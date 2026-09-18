// ===== utils.js — shared helpers =====

export const KB = 1024;
export const MB = 1024 * 1024;

export function formatFileSize(bytes) {
  if (bytes == null || isNaN(bytes)) return "—";
  if (bytes < KB) return `${Math.round(bytes)} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(2)} MB`;
}

export function bytesFromTarget(value, unit) {
  const num = Number(value);
  if (!num || num <= 0) return null;
  return unit === "MB" ? num * MB : num * KB;
}

export const CM_TO_PX = 96 / 2.54;

export function toPx(value, unit) {
  const num = Number(value);
  if (!num || num <= 0) return null;
  return unit === "cm" ? Math.round(num * CM_TO_PX) : Math.round(num);
}

export function parseRatio(input) {
  const m = String(input || "")
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*[\sx:×*]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a > 0 && b > 0 ? [a, b] : null;
}

export function resolveDims(opts = {}) {
  const unit = opts.unit || opts.dimsUnit || "px";
  let w = opts.width != null && opts.width !== "" ? toPx(opts.width, unit) : null;
  let h = opts.height != null && opts.height !== "" ? toPx(opts.height, unit) : null;
  const ratio = opts.ratio != null ? opts.ratio : opts.ratioLabel;
  const r = parseRatio(ratio);
  if (r) {
    if (w && !h) h = Math.round((w * r[1]) / r[0]);
    else if (!w && h) w = Math.round((h * r[0]) / r[1]);
  }
  return { width: w, height: h };
}

export function targetLabel(value, unit) {
  return `${value} ${unit}`;
}

export function getFileExt(name) {
  const dot = String(name).lastIndexOf(".");
  return dot === -1 ? "" : String(name).slice(dot + 1).toLowerCase();
}

export function stripExt(name) {
  const dot = String(name).lastIndexOf(".");
  return dot === -1 ? String(name) : String(name).slice(0, dot);
}

export function mimeFromFormat(format) {
  switch (format) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    default:
      return "";
  }
}

export function formatLabel(format) {
  if (!format || format === "original") return "Original";
  return format.toUpperCase();
}

export function classifyMimeByType(fileType) {
  if (fileType === "application/pdf") return "pdf";
  if (fileType.startsWith("image/")) {
    return fileType.split("/")[1] || "unknown";
  }
  return fileType;
}

export function uid() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function readFileArrayBuffer(file) {
  return file.arrayBuffer ? file.arrayBuffer() : new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function sanitizeFileName(name) {
  const base = String(name || "file")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .replace(/[_.]+$/g, "");
  return base || "file";
}

export function buildFileName(base, format, index) {
  const safe = sanitizeFileName(base);
  const suffix = format === "pdf" ? "pdf" : format;
  return `${safe}.${suffix}`;
}

export function pageLabel(index) {
  return String(index).padStart(2, "0");
}

export async function loadImageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageFromURL(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image."));
    img.src = url;
  });
}

export function cloneCanvas(canvas) {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  out.getContext("2d").drawImage(canvas, 0, 0);
  return out;
}

export function isSafeFormat(format) {
  return ["jpg", "jpeg", "png", "webp", "gif", "pdf"].includes(format);
}

export function extMatch(name, exts) {
  const n = name.toLowerCase();
  return exts.some((e) => n.endsWith(e));
}

export function escapeHtmlAttr(value) {
  return String(value).replace(/["'&<>]/g, (ch) => {
    switch (ch) {
      case '"': return "&quot;";
      case "'": return "&#39;";
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      default: return ch;
    }
  });
}