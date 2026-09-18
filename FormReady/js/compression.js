// ===== compression.js — orchestrate per-file processing =====

import {
  loadImage,
  resizeImage,
  convertImage,
  compressImageToSizeCanvas,
  rotateImage,
  cropCanvas,
} from "./image-processing.js";
import {
  bytesFromTarget,
  classifyMimeByType,
  parseRatio,
} from "./utils.js";
import { exportPdfToImages, rasterPdfToTarget } from "./pdf-processing.js";

let workerBridge = null;
export function setWorkerBridge(fn) { workerBridge = fn; }

// ---------- Settings helpers ----------

export function effectBy(item, settings) {
  const s = settings || item.settings || {};
  const from = classifyMimeByType(item.fileType);
  const to = s.format && s.format !== "original" ? s.format : from;
  return { from, to };
}

export function outputFormat(item, settings) {
  return effectBy(item, settings).to;
}

export function canProcess(item) {
  return classifyMimeByType(item.fileType) !== "unknown";
}

function drawToCanvas(img, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return c;
}

function canvasToJpeg(canvas, quality = 0.92) {
  return new Promise((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("JPEG encode failed"))), "image/jpeg", quality);
  });
}

function canvasToPng(canvas) {
  return new Promise((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG encode failed"))), "image/png");
  });
}

// ---------- Image → image ----------

export async function processImageFile(item) {
  const s = item.settings || {};
  const fromType = classifyMimeByType(item.fileType);

  const format = s.format && s.format !== "original" ? s.format : fromType;

  if (format === "pdf") {
    return processImageToPdf(item);
  }

  // GIF has no lossy canvas encoding; if a size target is set, re-encode
  // through the format chosen (defaulting to WEBP so animation-quality
  // expectations are not silently broken).
  if (fromType === "gif" && (!s.format || s.format === "original")) {
    if (s.targetOn) {
      const jpegLike = await processImageFile({
        ...item,
        settings: { ...s, format: "webp", note: "gif-to-webp" },
      });
      jpegLike.note = "GIF re-encoded as WEBP to meet the size target.";
      return jpegLike;
    }
    return {
      blob: item.originalFile,
      format: "gif",
      width: null,
      height: null,
      metTarget: true,
      note: "GIF kept as original.",
    };
  }

  const { img } = await loadImage(item.originalFile);

  let baseCanvas = null;
  let baseW = img.naturalWidth;
  let baseH = img.naturalHeight;

  if (s.crop && s.crop.enabled && s.crop.width > 0 && s.crop.height > 0) {
    const full = drawToCanvas(img, baseW, baseH);
    // crop stored in original-pixel coordinates
    const x = Math.max(0, Math.min(baseW, Math.round(Number(s.crop.x) || 0)));
    const y = Math.max(0, Math.min(baseH, Math.round(Number(s.crop.y) || 0)));
    const cw = Math.min(baseW - x, Math.round(Number(s.crop.width)));
    const ch = Math.min(baseH - y, Math.round(Number(s.crop.height)));
    baseCanvas = cropCanvas(full, x, y, cw, ch);
  }

  if (s.rotate && s.rotate % 360 !== 0) {
    const src = baseCanvas || drawToCanvas(img, baseW, baseH);
    baseCanvas = rotateImage(src, s.rotate);
  }

  const targetBytes = s.targetOn ? bytesFromTarget(s.targetValue, s.targetUnit) : null;
  // When a specific aspect ratio is given, the resolved dimensions ARE the
  // target aspect — do not re-fit to the source aspect.
  const keepRatio = s.keepRatio !== false && !(s.ratio && parseRatio(s.ratio));

  const inW = baseCanvas ? baseCanvas.width : baseW;
  const inH = baseCanvas ? baseCanvas.height : baseH;

  let desiredW = s.width && s.width > 0 ? Number(s.width) : null;
  let desiredH = s.height && s.height > 0 ? Number(s.height) : null;

  const explicitDims = !!(desiredW || desiredH);

  let workingCanvas;
  if (baseCanvas) {
    workingCanvas = resizeImage(baseCanvas, desiredW || inW, desiredH || inH, keepRatio);
  } else {
    workingCanvas = resizeImage(img, desiredW || inW, desiredH || inH, keepRatio);
  }

  const targetWidth = workingCanvas.width;
  const targetHeight = workingCanvas.height;

  if (!targetBytes) {
    const q = (s.quality || 80) / 100;
    const blob = await convertImage(workingCanvas, format, q);
    return {
      blob,
      format,
      width: workingCanvas.width,
      height: workingCanvas.height,
      metTarget: true,
      quality: q,
    };
  }

  // Try the dedicated worker for CPU-heavy compression loops.
  if (workerBridge && ["jpg", "jpeg", "webp"].includes(format) && typeof createImageBitmap !== "undefined") {
    const workerResult = await workerBridge(
      workingCanvas,
      format,
      targetBytes,
      !explicitDims && s.allowShrink !== false
    );
    if (workerResult && workerResult.blob && workerResult.blob.size <= targetBytes) {
      return {
        blob: workerResult.blob,
        format,
        width: workerResult.width,
        height: workerResult.height,
        metTarget: true,
        quality: workerResult.quality,
        targetBytes,
        targetLabel: `${s.targetValue} ${s.targetUnit}`,
        targetWidth,
        targetHeight,
      };
    }
    if (workerResult && workerResult.blob) {
      return {
        blob: workerResult.blob,
        format,
        width: workerResult.width,
        height: workerResult.height,
        metTarget: false,
        quality: workerResult.quality,
        targetBytes,
        targetLabel: `${s.targetValue} ${s.targetUnit}`,
        targetWidth,
        targetHeight,
      };
    }
  }

  const result = await compressImageToSizeCanvas(workingCanvas, {
    format,
    targetBytes,
    maxQuality: 0.92,
    minQuality: 0.25,
    allowDimensionReduction: !explicitDims && s.allowShrink !== false,
  });

  const metTarget = result.blob.size <= targetBytes;

  return {
    blob: result.blob,
    format,
    width: result.width,
    height: result.height,
    metTarget,
    quality: result.quality,
    targetBytes,
    targetLabel: `${s.targetValue} ${s.targetUnit}`,
    targetWidth,
    targetHeight,
  };
}

// ---------- Image → PDF ----------

async function imageToPdfBlob(canvas, quality = 0.92) {
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.create();
  const jpgBlob = await canvasToJpeg(canvas, quality);
  const bytes = await jpgBlob.arrayBuffer();
  let image;
  try {
    image = await doc.embedJpg(bytes);
  } catch {
    image = await doc.embedPng(await canvasToPng(canvas).then((b) => b.arrayBuffer()));
  }
  const page = doc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}

export async function processImageToPdf(item) {
  const s = item.settings || {};
  const { img } = await loadImage(item.originalFile);
  const targetBytes = s.targetOn ? bytesFromTarget(s.targetValue, s.targetUnit) : null;

  let imgW = img.naturalWidth;
  let imgH = img.naturalHeight;

  if ((s.width && s.width > 0) || (s.height && s.height > 0)) {
    const keepRatio = s.keepRatio !== false;
    const targetW = s.width && s.width > 0 ? Number(s.width) : null;
    const targetH = s.height && s.height > 0 ? Number(s.height) : null;
    const resized = resizeImage(img, targetW || img.naturalWidth, targetH || img.naturalHeight, keepRatio);
    imgW = resized.width;
    imgH = resized.height;
  }

  const canvas = drawToCanvas(img, imgW, imgH);

  let pdfBlob;
  let qualityUsed = 0.92;
  if (!targetBytes) {
    pdfBlob = await imageToPdfBlob(canvas, 0.92);
  } else {
    let qHigh = 0.95, qLow = 0.15, best = null;
    for (let i = 0; i < 10; i++) {
      const qMid = (qHigh + qLow) / 2;
      const blob = await imageToPdfBlob(canvas, qMid);
      if (blob.size <= targetBytes) {
        best = blob;
        qualityUsed = qMid;
        qLow = qMid;
      } else {
        qHigh = qMid;
      }
    }
    if (!best) {
      // shrink canvas until target met
      let w = canvas.width, h = canvas.height;
      let shrunk = canvas;
      for (let i = 0; i < 8; i++) {
        w *= 0.82; h *= 0.82;
        if (Math.min(w, h) < 16) break;
        shrunk = drawToCanvas(img, w, h);
        let lq = 0.15, hq = 0.95, lb = null;
        for (let j = 0; j < 9; j++) {
          const qm = (lq + hq) / 2;
          const b2 = await imageToPdfBlob(shrunk, qm);
          if (b2.size <= targetBytes) { lb = b2; hq = qm; } else { lq = qm; }
        }
        if (lb) { best = lb; break; }
      }
    }
    pdfBlob = best || (await imageToPdfBlob(canvas, 0.15));
  }

  return {
    blob: pdfBlob,
    format: "pdf",
    width: canvas.width,
    height: canvas.height,
    metTarget: targetBytes ? pdfBlob.size <= targetBytes : true,
    targetBytes,
    targetLabel: s.targetOn ? `${s.targetValue} ${s.targetUnit}` : null,
    quality: qualityUsed,
  };
}

// ---------- PDF processing ----------

export async function processPdfFile(item) {
  const s = item.settings || {};
  const from = classifyMimeByType(item.fileType);
  const to = s.format && s.format !== "original" ? s.format : from;

  if (to === "pdf") {
    return compressPdf(item);
  }

  if (["jpg", "jpeg", "png", "webp"].includes(to)) {
    const targetBytes = s.targetOn ? bytesFromTarget(s.targetValue, s.targetUnit) : null;
    const pages = s.pages && s.pages.length ? s.pages : null;
    const result = await exportPdfToImages(item.originalFile, {
      format: to === "jpeg" ? "jpg" : to,
      pages,
      quality: (s.quality || 80) / 100,
    });
    if (!result.length) throw new Error("No pages could be rendered from this PDF.");
    const first = result[0];

    if (targetBytes && result.length === 1) {
      const imgRes = await processImageFile({
        ...item,
        fileType: first.blob.type,
        originalFile: first.blob,
        settings: {
          ...s,
          format: to,
          targetOn: true,
          targetValue: s.targetValue,
          targetUnit: s.targetUnit,
        },
      });
      return {
        blob: imgRes.blob,
        format: to,
        pages: [{ ...first, blob: imgRes.blob }],
        metTarget: imgRes.metTarget,
        targetBytes,
        targetLabel: `${s.targetValue} ${s.targetUnit}`,
        width: imgRes.width,
        height: imgRes.height,
      };
    }

    return {
      blob: first.blob,
      format: to,
      pages: result,
      metTarget: true,
      targetBytes: null,
      width: first.width,
      height: first.height,
    };
  }

  throw new Error(`Unsupported PDF output format: ${to}`);
}

async function compressPdf(item) {
  const s = item.settings || {};
  const targetBytes = s.targetOn ? bytesFromTarget(s.targetValue, s.targetUnit) : null;
  const source = await item.originalFile.arrayBuffer();

  let doc;
  try {
    doc = await PDFLib.PDFDocument.load(source, { ignoreEncryption: true });
  } catch (e) {
    throw new Error("Could not read this PDF. It may be corrupted or encrypted.");
  }
  const pageCount = doc.getPageCount();

  const candidates = [];

  try {
    candidates.push(await doc.save({ useObjectStreams: false }));
  } catch {}
  try {
    doc = await PDFLib.PDFDocument.load(source, { ignoreEncryption: true });
    candidates.push(await doc.save({ useObjectStreams: true, addDefaultPage: false }));
  } catch {}
  try {
    doc = await PDFLib.PDFDocument.load(source, { ignoreEncryption: true });
    candidates.push(await doc.save({ useObjectStreams: true, objectsPerTick: 50 }));
  } catch {}

  const bestBuf = candidates.sort((a, b) => a.byteLength - b.byteLength)[0] || source;

  let finalBuf = bestBuf;
  let note = null;

  if (targetBytes && bestBuf.byteLength > targetBytes) {
    const raster = await rasterPdfToTarget(item.originalFile, targetBytes);
    if (raster) {
      const ab = await raster.arrayBuffer();
      if (ab.byteLength < bestBuf.byteLength) {
        finalBuf = ab;
        note = "Pages were flattened to images to reach the size target after compression.";
      }
    }
    if (finalBuf.byteLength > targetBytes) {
      note = "This PDF could not be reduced below the requested size while keeping acceptable quality.";
    }
  }

  const metTarget = finalBuf.byteLength <= targetBytes;

  return {
    blob: new Blob([finalBuf], { type: "application/pdf" }),
    format: "pdf",
    metTarget,
    targetBytes,
    targetLabel: s.targetOn ? `${s.targetValue} ${s.targetUnit}` : null,
    pages: pageCount,
    note: note || (metTarget ? null : "PDF could not be reduced below requested size."),
  };
}

// ---------- Combine several images → one PDF ----------

export async function combineImagesToPdf(records, opts = {}) {
  const { pageSize, orientation, margin } = opts;
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.create();

  const A4 = [595.28, 841.89];
  const LETTER = [612, 792];

  for (const rec of records) {
    const { img } = await loadImage(rec.originalFile);
    const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    const jpgBlob = await canvasToJpeg(canvas, 0.92);
    let image;
    try {
      image = await doc.embedJpg(await jpgBlob.arrayBuffer());
    } catch {
      image = await doc.embedPng(await canvasToPng(canvas).then((b) => b.arrayBuffer()));
    }

    let pw = image.width;
    let ph = image.height;
    if (pageSize === "A4") {
      pw = A4[0]; ph = A4[1];
      if (orientation === "landscape") { [pw, ph] = [ph, pw]; }
    } else if (pageSize === "Letter") {
      pw = LETTER[0]; ph = LETTER[1];
      if (orientation === "landscape") { [pw, ph] = [ph, pw]; }
    }

    const page = doc.addPage([pw, ph]);
    const m = Number(margin) || 0;
    const availW = pw - m * 2;
    const availH = ph - m * 2;
    const scale = Math.min(availW / image.width, availH / image.height);
    const dw = Math.min(image.width * scale, availW);
    const dh = Math.min(image.height * scale, availH);
    page.drawImage(image, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}