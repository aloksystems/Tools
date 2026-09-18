// ===== pdf-processing.js — PDF reading, rendering via PDF.js, building via pdf-lib =====

import { mimeFromFormat } from "./utils.js";

let pdfjsWorkerReady = false;

function ensurePdfjs() {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF.js library failed to load. Check your connection.");
  }
  if (!pdfjsWorkerReady) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    pdfjsWorkerReady = true;
  }
}

export async function getPageCount(file) {
  ensurePdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
}

// Render selected PDF pages to image blobs.
// Returns [{ index, pageNumber, blob, width, height, url? }]
export async function exportPdfToImages(file, opts = {}) {
  ensurePdfjs();
  const { format = "jpg", pages = null, quality = 0.82, dpi = 2 } = opts;
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const mime = mimeFromFormat(format === "jpeg" ? "jpg" : format) || "image/jpeg";

  const wanted = pages && pages.length
    ? Array.from(new Set(pages.map((p) => Number(p)).filter((p) => p >= 1 && p <= doc.numPages)))
    : Array.from({ length: doc.numPages }, (_, i) => i + 1);

  const results = [];

  for (const pageNumber of wanted) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: dpi });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error(`Rendering page ${pageNumber} failed`))),
        mime,
        quality
      );
    });

    results.push({
      pageNumber,
      blob,
      width: canvas.width,
      height: canvas.height,
    });
  }

  await doc.destroy();
  return results;
}

// Render a single page to an image element/canvas for preview.
export async function renderPageToJpeg(file, pageNumber = 1, scale = 1.5) {
  ensurePdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  await doc.destroy();
  return canvas;
}

export async function mergePdfs(files) {
  const { PDFDocument } = PDFLib;
  const out = await PDFDocument.create();
  for (const f of files) {
    const buf = f instanceof Blob || (f && f.arrayBuffer) ? await f.arrayBuffer() : f;
    if (typeof PDFLib === "undefined") throw new Error("pdf-lib failed to load.");
    let src;
    try {
      src = await PDFDocument.load(buf, { ignoreEncryption: true });
    } catch (e) {
      throw new Error("Could not read one of the PDF files. It may be corrupted or encrypted.");
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  const bytes = await out.save();
  return new Blob([bytes], { type: "application/pdf" });
}

export async function imageBlobToPdfBlob(blobs) {
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.create();
  for (const blob of blobs) {
    const buf = await blob.arrayBuffer();
    let image;
    try {
      image = await doc.embedJpg(buf);
    } catch {
      try {
        image = await doc.embedPng(buf);
      } catch {
        try {
          image = await doc.embedJpeg(buf);
        } catch {
          image = await doc.embedPng(buf).catch(() => null);
        }
      }
    }
    if (!image) throw new Error("Could not embed an image into the PDF.");
    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}

// Rasterise every page into the PDF (flatten) and try quality/dpi tiers to
// reach a size target. Only used as a clearly-reported last resort.
export async function rasterPdfToTarget(file, targetBytes) {
  ensurePdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const { PDFDocument } = PDFLib;

  const pngBlobOf = (canvas) => new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("png encode"))), "image/png"));
  const jpegBlobOf = (canvas, q) => new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("jpeg encode"))), "image/jpeg", q));

  async function renderAt(scale, quality) {
    const out = await PDFDocument.create();
    for (const num of pageNums) {
      const srcPage = await doc.getPage(num);
      const baseVp = srcPage.getViewport({ scale: 1 });
      const vp = srcPage.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      await srcPage.render({ canvasContext: ctx, viewport: vp }).promise;

      let image;
      try {
        image = await out.embedJpg(await jpegBlobOf(canvas, quality).then((b) => b.arrayBuffer()));
      } catch {
        image = await out.embedPng(await pngBlobOf(canvas).then((b) => b.arrayBuffer()));
      }

      const pw = baseVp.width;
      const ph = baseVp.height;
      const dst = out.addPage([pw, ph]);
      const fit = Math.min(pw / image.width, ph / image.height);
      const dw = image.width * fit;
      const dh = image.height * fit;
      dst.drawImage(image, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    }
    const bytes = await out.save();
    await out;
    return bytes;
  }

  let best = null;
  for (const scale of [1.5, 1, 0.66, 0.45, 0.3]) {
    let qLow = 0.25, qHigh = 0.75, localBest = null;
    for (let i = 0; i < 7; i++) {
      const qMid = (qLow + qHigh) / 2;
      const buf = await renderAt(scale, qMid);
      if (buf.byteLength <= targetBytes) {
        localBest = buf;
        qLow = qMid;
      } else {
        qHigh = qMid;
      }
      if (qHigh - qLow < 0.03) break;
    }
    if (localBest) {
      best = localBest;
      break;
    }
  }

  await doc.destroy();
  if (best) return new Blob([best], { type: "application/pdf" });
  return null;
}