// ===== zip.js — download processed results =====

import { sanitizeFileName } from "./utils.js";

export async function buildZip(files) {
  if (typeof JSZip === "undefined") throw new Error("JSZip library failed to load.");
  const zip = new JSZip();

  const usedNames = new Set();

  for (const item of files) {
    const blobs = flattenBlobs(item);
    for (const entry of blobs) {
      let base = sanitizeFileName(entry.name || item.currentName || item.originalName);
      base = uniqueName(base, usedNames);
      zip.file(base, entry.blob);
    }
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

// A processed item may hold a single blob or multiple page blobs (PDF→images).
function flattenBlobs(item) {
  if (!item.processedFile) return [];
  if (item.resultDetails && item.resultDetails.pages && item.resultDetails.pages.length > 1) {
    return item.resultDetails.pages.map((p, i) => ({
      blob: p.blob,
      name: `${sanitizeFileName(item.currentName || item.originalName).replace(/\.\w+$/, "")}_page_${String(p.pageNumber || i + 1).padStart(2, "0")}.${item.resultDetails.format}`,
    }));
  }
  const ext = item.resultDetails?.format || extFromName(item.currentName || item.originalName);
  return [{ blob: item.processedFile, name: `${sanitizeFileName((item.currentName || item.originalName)).replace(/\.[^.]+$/, "")}.${ext}` }];
}

function extFromName(name) {
  const m = String(name).match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "bin";
}

function uniqueName(name, used) {
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let candidate = name;
  let i = 1;
  while (used.has(candidate)) {
    candidate = `${base}(${i})${ext}`;
    i++;
  }
  used.add(candidate);
  return candidate;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}