// ===== processing-worker.js — off-main-thread image compression =====

self.onmessage = async (e) => {
  const msg = e.data || {};

  if (msg.type === "compress") {
    try {
      const result = await compressToSize(msg);
      self.postMessage({ id: msg.id, ok: true, ...result });
    } catch (err) {
      self.postMessage({ id: msg.id, ok: false, error: String(err && err.message || err) });
    }
    return;
  }

  self.postMessage({ id: msg.id, ok: false, error: "Unknown task" });
};

async function makeCanvas(source, w, h) {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }
  throw new Error("OffscreenCanvas unavailable");
}

function encode(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    canvas.convertToBlob({ type: `image/${format}` })
      .then(resolve)
      .catch(() => {
        if (canvas.convertToBlob) {
          canvas.convertToBlob({ type: `image/${format}`, quality }).then(resolve).catch(reject);
        } else reject(new Error("No blob conversion in worker"));
      });
  });
}

async function compressToSize(msg) {
  const {
    imageBitmap,
    format = "jpg",
    targetBytes = null,
    maxQuality = 0.92,
    minQuality = 0.25,
    allowShrink = true,
    maxDimension = 2000,
  } = msg;

  let source = imageBitmap;
  let w = imageBitmap.width;
  let h = imageBitmap.height;

  if (Math.max(w, h) > maxDimension) {
    const ratio = Math.min(maxDimension / w, maxDimension / h);
    w *= ratio; h *= ratio;
    source = await makeCanvas(imageBitmap, w, h);
  }

  const base = source instanceof OffscreenCanvas ? source : await makeCanvas(imageBitmap, w, h);
  w = base.width; h = base.height;

  if (!targetBytes || format === "png") {
    const blob = await encode(base, format === "png" ? "png" : format, 0.82);
    return { blob, width: w, height: h, quality: format === "png" ? 1 : 0.82 };
  }

  const attempt = async (q) => encode(base, format, q);

  let low = minQuality, high = maxQuality, best = null;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    const blob = await attempt(mid);
    if (blob.size <= targetBytes) { best = { blob, quality: mid }; low = mid; }
    else high = mid;
    if (high - low < 0.01) break;
  }
  if (best) return { blob: best.blob, width: w, height: h, quality: best.quality };

  if (allowShrink) {
    let cw = w, ch = h, canvas = base;
    for (let iter = 0; iter < 8; iter++) {
      cw *= 0.82; ch *= 0.82;
      if (Math.min(cw, ch) < 16) break;
      canvas = await makeCanvas(source, cw, ch);
      let lq = minQuality, hq = maxQuality, lb = null;
      for (let i = 0; i < 10; i++) {
        const qm = (lq + hq) / 2;
        const b2 = await encode(canvas, format, qm);
        if (b2.size <= targetBytes) { lb = { blob: b2, quality: qm }; lq = qm; }
        else hq = qm;
        if (hq - lq < 0.02) break;
      }
      if (lb) return { blob: lb.blob, width: cw, height: ch, quality: lb.quality };
    }
  }

  const blob = await attempt(minQuality);
  return { blob, width: w, height: h, quality: minQuality };
}