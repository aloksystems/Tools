// ===== image-processing.js — canvas-based image engine =====

import {
  loadImageFromBlob,
  cloneCanvas,
  mimeFromFormat,
} from "./utils.js";

// ---------- Core loading/resizing ----------

export async function loadImage(fileOrBlob) {
  const img = await loadImageFromBlob(fileOrBlob);
  return { img, width: img.naturalWidth, height: img.naturalHeight };
}

export function drawImageOnCanvas(img, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function resizeImage(img, targetWidth, targetHeight, keepRatio = true) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  let w = targetWidth;
  let h = targetHeight;
  if (keepRatio) {
    const ratio = srcW / srcH;
    if (w && h) {
      const fromWidth = h * ratio;
      const fromHeight = w / ratio;
      if (fromWidth <= w) {
        w = fromWidth;
        h = targetHeight;
      } else {
        h = fromHeight;
        w = targetWidth;
      }
    } else if (w) {
      h = Math.round(w / ratio);
    } else if (h) {
      w = Math.round(h * ratio);
    } else {
      return drawImageOnCanvas(img, srcW, srcH);
    }
  }
  return drawImageOnCanvas(img, w, h);
}

// Rotate a canvas/image 90° clockwise per call.
export function rotateImage(img, deg) {
  const canvas = document.createElement("canvas");
  const radians = (deg * Math.PI) / 180;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (deg % 180 === 0) {
    canvas.width = w;
    canvas.height = h;
  } else {
    canvas.width = h;
    canvas.height = w;
  }
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas;
}

// ---------- Format conversion / blob ----------

export function canvasToBlob(canvas, format, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const mime = mimeFromFormat(format);
    if (format === "png") {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
    } else {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error(`Encoding to ${format} failed`))),
        mime,
        quality
      );
    }
  });
}

export async function convertImage(canvasOrImg, format, quality = 0.8) {
  const canvas = canvasOrImg instanceof HTMLCanvasElement
    ? canvasOrImg
    : drawImageOnCanvas(canvasOrImg, canvasOrImg.naturalWidth, canvasOrImg.naturalHeight);
  return canvasToBlob(canvas, format, quality);
}

// ---------- Iterative compression toward a target size ----------

export async function compressImageToSizeCanvas(
  sourceCanvas,
  opts
) {
  const {
    format = "jpg",
    targetBytes,
    maxQuality = 0.92,
    minQuality = 0.3,
    maxDimension = 2000,
    allowDimensionReduction = true,
  } = opts;

  let baseCanvas = sourceCanvas instanceof HTMLCanvasElement ? sourceCanvas : cloneCanvas(sourceCanvas);

  if (baseCanvas.width > maxDimension || baseCanvas.height > maxDimension) {
    const ratio = Math.min(maxDimension / baseCanvas.width, maxDimension / baseCanvas.height);
    const w = Math.max(1, Math.round(baseCanvas.width * ratio));
    const h = Math.max(1, Math.round(baseCanvas.height * ratio));
    baseCanvas = drawImageOnCanvas(baseCanvas, w, h);
  }

  if (format === "png") {
    const blob = await canvasToBlob(baseCanvas, "png");
    return {
      blob,
      canvas: baseCanvas,
      width: baseCanvas.width,
      height: baseCanvas.height,
      quality: 1,
    };
  }

  if (format === "webp" || format === "jpg" || format === "jpeg") {
    if (!targetBytes) {
      const blob = await canvasToBlob(baseCanvas, format, 0.82);
      return {
        blob,
        canvas: baseCanvas,
        width: baseCanvas.width,
        height: baseCanvas.height,
        quality: 0.82,
      };
    }

    // try to hit target with pure quality binary search
    const attempt = async (q) => {
      const blob = await canvasToBlob(baseCanvas, format, q);
      return blob;
    };

    let low = minQuality;
    let high = maxQuality;
    let best = null;

    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      const blob = await attempt(mid);
      if (blob.size <= targetBytes) {
        best = { blob, quality: mid };
        low = mid;
      } else {
        high = mid;
      }
      if (high - low < 0.01) break;
    }

    if (best && best.blob.size <= targetBytes) {
      return {
        blob: best.blob,
        canvas: baseCanvas,
        width: baseCanvas.width,
        height: baseCanvas.height,
        quality: best.quality,
      };
    }

    // quality reduction alone insufficient: reduce dimensions if allowed
    if (allowDimensionReduction) {
      let w = baseCanvas.width;
      let h = baseCanvas.height;
      let curCanvas = baseCanvas;
      let quota = (low + high) / 2 || minQuality;

      for (let iter = 0; iter < 8 && quota >= minQuality; iter++) {
        const scaleDown = 0.82;
        w *= scaleDown;
        h *= scaleDown;
        if (Math.min(w, h) < 16) break;
        curCanvas = drawImageOnCanvas(baseCanvas, w, h);

        let qLow = minQuality;
        let qHigh = maxQuality;
        let localBest = null;
        for (let i = 0; i < 10; i++) {
          const qMid = (qLow + qHigh) / 2;
          const blob = await canvasToBlob(curCanvas, format, qMid);
          if (blob.size <= targetBytes) {
            localBest = { blob, quality: qMid };
            qLow = qMid;
          } else {
            qHigh = qMid;
          }
          if (qHigh - qLow < 0.02) break;
        }
        if (localBest) {
          return {
            blob: localBest.blob,
            canvas: curCanvas,
            width: curCanvas.width,
            height: curCanvas.height,
            quality: localBest.quality,
          };
        }
      }
    }

    // Failed to meet target: return the smallest found
    const finalBlob = await attempt(minQuality);
    return {
      blob: finalBlob,
      canvas: baseCanvas,
      width: baseCanvas.width,
      height: baseCanvas.height,
      quality: minQuality,
    };
  }

  // Unknown format fallback
  const blob = await canvasToBlob(baseCanvas, "png");
  return {
    blob,
    canvas: baseCanvas,
    width: baseCanvas.width,
    height: baseCanvas.height,
    quality: 1,
  };
}

// ---------- Crop ----------

export function cropCanvas(canvas, x, y, w, h) {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w));
  out.height = Math.max(1, Math.round(h));
  out.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
  return out;
}

export { cloneCanvas };