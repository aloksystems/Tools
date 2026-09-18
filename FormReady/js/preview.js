// ===== preview.js — generate previews for files =====

import { getPageCount } from "./pdf-processing.js";

export async function buildPreview(record) {
  const type = record.fileType;
  const isPdf = type === "application/pdf";
  const isImage = type.startsWith("image/");

  if (record.previewURL) {
    URL.revokeObjectURL(record.previewURL);
    record.previewURL = null;
  }

  if (isImage) {
    record.previewURL = URL.createObjectURL(record.originalFile);
    const dims = await getImageDimensions(record);
    return { dims, pdfPages: null };
  }

  if (isPdf) {
    try {
      const pages = await getPageCount(record.originalFile);
      return { dims: null, pdfPages: pages };
    } catch {
      return { dims: null, pdfPages: null };
    }
  }

  return { dims: null, pdfPages: null };
}

export function getImageDimensions(record) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = record.previewURL;
  });
}