// ===== app.js — main application controller =====

import {
  getState,
  setStage,
  STAGES,
  addFiles as pushRecords,
  updateFile,
} from "./state.js";
import {
  init as initUI,
  cacheEl,
  render,
  setStep,
  syncBulkUI,
  getDefaultSettings,
  effectiveSettings,
  toast,
  openModal,
  closeModal,
  confirmDialog,
  promptRename,
  openSettingsModal,
  openImageEditor,
  openCombineModal,
  showProgress,
  updateProgress,
  showAbout,
  showPrivacy,
  showOperations,
} from "./ui.js";
import { initDropzone, addFiles as ingestFiles } from "./upload.js";
import {
  addRecords,
  removeRecord,
  renameRecord,
  setSettings,
  clearSettings,
  resetProcessed,
  clearAll,
} from "./file-manager.js";
import {
  canProcess,
  processImageFile,
  processPdfFile,
  combineImagesToPdf,
  outputFormat,
  effectBy,
  setWorkerBridge,
} from "./compression.js";
import { sanitizeFileName, resolveDims } from "./utils.js";
import { buildZip, downloadBlob } from "./zip.js";

const state = getState();

let worker = null;

function ensureWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/processing-worker.js", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

let workerSeq = 0;
function postWorker(message) {
  return new Promise((resolve, reject) => {
    const w = ensureWorker();
    if (!w) return reject(new Error("No worker"));
    const id = ++workerSeq;
    const onMsg = (e) => {
      if (e.data && e.data.id === id) {
        w.removeEventListener("message", onMsg);
        if (e.data.ok) resolve(e.data);
        else reject(new Error(e.data.error || "Worker error"));
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ ...message, id });
  });
}

function initProcesWorkerSupport() {
  setWorkerBridge(async (canvas, format, targetBytes, allowShrink) => {
    try {
      const bitmap = await createImageBitmap(canvas);
      const res = await postWorker({
        type: "compress",
        imageBitmap: bitmap,
        format,
        targetBytes,
        allowShrink,
      });
      return {
        blob: res.blob,
        width: res.width,
        height: res.height,
        quality: res.quality,
      };
    } catch {
      return null;
    }
  });
}

// ============ Dropzone / file input ============

const input = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
let openFileDialog = null;

function setupInputHandlers() {
  const controller = initDropzone(input, dropzone, {
    onBeforeSelect: () => {
      if (state.files.some((f) => f.status === "processing")) {
        toast("Files are still processing.", "warn");
        return false;
      }
      return true;
    },
    onFiles: handleNewFiles,
  });
  openFileDialog = controller.openDialog;
}

async function handleNewFiles(fileList) {
  const { records, rejected } = await ingestFiles(fileList);
  if (!records.length) {
    toast("No supported files were added.", "error");
    if (rejected.length) toast(`Skipped: ${rejected.join(", ")}`, "warn", 5000);
    return;
  }
  addRecords(records);
  if (rejected.length) {
    toast(`Added ${records.length} file(s). Skipped ${rejected.length} unsupported.`, "warn");
  } else {
    toast(`✓ Added ${records.length} file${records.length === 1 ? "" : "s"} successfully`, "success");
  }
  setStage(STAGES.CONFIGURE);
  setStep(STAGES.CONFIGURE);
  render();
}

// ============ File card actions ============

function onRemove(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  if (rec.kind === "pack" && rec.packSources) {
    rec.packSources.forEach((srcId) => {
      const src = state.files.find((f) => f.id === srcId);
      if (src) updateFile(srcId, { status: "ready", note: null });
    });
    toast("Pack removed. The original images are back in the workspace.", "info");
  }
  removeRecord(id);
  if (!state.files.length) {
    setStage(STAGES.UPLOAD);
    setStep(STAGES.UPLOAD);
  }
  render();
}

function onRename(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  promptRename(rec, (newName) => {
    renameRecord(id, newName);
    render();
    toast("File renamed.", "success");
  });
}

function onEditSettings(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  openSettingsModal(rec);
}

function onEditImage(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  openImageEditor(rec);
}

function onSaveSettings(id, settings, opts) {
  const rec = state.files.find((f) => f.id === id);
  const incoming = Object.assign({}, settings);
  delete incoming.kind;
  const merged = Object.assign({}, rec?.settings || {}, incoming);
  setSettings(id, merged);
  render();
  if (opts && opts.edited) {
    toast("Image saved. Reprocess to see the result.", "success");
  } else {
    toast(`Settings saved for the file. Press “Process & Download”.`, "info");
  }
}

function onClearSettings(id) {
  clearSettings(id);
  render();
  toast("Now using bulk defaults for this file.", "info");
}

// ============ Bulk actions ============

function onBulkChange(patch) {
  state.bulk = Object.assign({}, state.bulk, patch);
}

function onApplyAll() {
  const defaults = getDefaultSettings();
  const count = state.files.length;
  if (!count) return toast("No files to apply settings to.", "warn");
  state.files.forEach((f) => {
    if (f.status === "processing") return;
    const merged = Object.assign({}, defaults, f.settings || {});
    if (f.settings?.crop) merged.crop = f.settings.crop;
    if (f.settings?.rotate) merged.rotate = f.settings.rotate;
    if (f.settings?.pages) merged.pages = f.settings.pages;
    if (f.settings?.pagesList) merged.pagesList = f.settings.pagesList;
    setSettings(f.id, merged);
    resetProcessed(f.id);
  });
  render();
  toast(`Bulk defaults applied to ${count} file(s).`, "success");
}

function onResetBulk() {
  state.bulk = {
    format: "original",
    targetOn: true,
    targetValue: 200,
    targetUnit: "KB",
    quality: 80,
    dimsOn: false,
    width: null,
    height: null,
    dimsUnit: "px",
    ratio: "",
    keepRatio: true,
  };
  syncBulkUI();
  toast("Bulk settings reset.", "info");
}

function onDownloadMode(mode) {
  state.downloadMode = mode;
}

// ============ Clear all ============

async function onClearAll() {
  const hasResults = state.files.some((f) => f.status === "done" || f.status === "failed");
  if (hasResults) {
    const ok = await confirmDialog(
      "Clear the whole workspace?",
      "All files, processed results and previews will be removed from memory."
    );
    if (!ok) return;
  } else if (!state.files.length) {
    return toast("Workspace is already empty.", "info");
  }
  clearAll();
  setStage(STAGES.UPLOAD);
  setStep(STAGES.UPLOAD);
  render();
  toast("Workspace cleared.", "info");
}

// ============ Pack / combine ============

function onPackToggle(enabled) {
  state.pack = { ...state.pack, enabled };
  const btn = document.getElementById("processBtn");
  btn.textContent = enabled ? "Process Application Pack" : "Process & Download";
  if (enabled) toast("Application Pack mode on. Use “Combine into one PDF…” for grouped documents.", "info");
  render();
}

function onCombine() {
  const images = state.files.filter(
    (f) => f.fileType.startsWith("image/") && f.status !== "packed" && f.status !== "processing"
  );
  if (images.length < 2) {
    toast("Select at least 2 images within the workspace to combine.", "warn");
    return;
  }
  openCombineModal(images);
}

async function onCombineSubmit(order, opts, originals) {
  try {
    toast("Building the combined PDF…", "info");
    const blob = await combineImagesToPdf(order, opts);
    if (!blob.size) throw new Error("Empty result");
    const fileName = "combined_documents.pdf";
    const fakeFile = new File([blob], fileName, { type: "application/pdf" });
    const rec = {
      id: "pack_" + Date.now().toString(36),
      originalFile: fakeFile,
      originalName: fileName,
      currentName: fileName,
      fileType: "application/pdf",
      ext: "pdf",
      originalSize: blob.size,
      category: "Combined PDF",
      previewURL: null,
      pdfPages: order.length,
      dims: null,
      settings: null,
      status: "ready",
      processedFile: null,
      processedSize: null,
      processedBlobURL: null,
      error: null,
      requirementMet: null,
      resultDetails: null,
      kind: "pack",
      packSources: order.map((r) => r.id),
    };
    pushRecords([rec]);
    order.forEach((r) => {
      const live = state.files.find((f) => f.id === r.id);
      if (live && !live.kind) updateFile(r.id, { status: "packed", note: "Included in combined PDF" });
    });
    setStage(STAGES.CONFIGURE);
    setStep(STAGES.CONFIGURE);
    render();
    toast(`✓ Combined ${order.length} image(s) into ${fileName}`, "success");
  } catch (e) {
    toast(`Could not combine: ${e.message}`, "error", 6000);
    render();
  }
}

// ============ Processing ============

async function processAll() {
  const candidates = state.files.filter((f) => f.status !== "packed");

  if (!candidates.length) {
    toast("Nothing to process. Add documents first.", "warn");
    return;
  }
  if (candidates.some((f) => f.status === "processing")) {
    toast("Processing is already running.", "warn");
    return;
  }

  setStage(STAGES.CONFIGURE);
  setStep(STAGES.CONFIGURE);
  showProgress(state.pack.enabled ? "Preparing your application pack…" : "Processing documents…");

  const toProcess = [];
  for (const rec of candidates) {
    resetProcessed(rec.id);
    if (!canProcess(rec)) {
      updateFile(rec.id, {
        status: "failed",
        error: "Unsupported file type.",
      });
    } else {
      toProcess.push(rec);
    }
  }
  render();
  updateProgress(state.files);

  let failedAny = false;
  for (let i = 0; i < toProcess.length; i++) {
    const rec = toProcess[i];
    updateFile(rec.id, { status: "processing", error: null });
    render();
    updateProgress(state.files);

    try {
      const result = await processOne(rec);
      applyResult(rec, result);
    } catch (err) {
      failedAny = true;
      updateFile(rec.id, {
        status: "failed",
        error: err && err.message ? err.message : "Processing failed",
        processedSize: null,
      });
    }
    render();
    updateProgress(state.files);
  }

  const okCount = state.files.filter((f) => f.status === "done" && f.requirementMet !== false).length;
  const partial = state.files.filter((f) => f.status === "done" && f.requirementMet === false).length;
  const failed = state.files.filter((f) => f.status === "failed").length;

  updateProgress(state.files);
  setStage(STAGES.RESULT);
  setStep(STAGES.RESULT);
  render();

  if (failed || partial) {
    toast(`Processed ${okCount} file(s) fully. ${partial + failed} need attention.`, "warn", 6000);
  } else {
    toast(`✓ ${okCount} / ${toProcess.length || okCount} documents ready`, "success", 5000);
  }

  const finalFiles = state.files.filter((f) => f.status === "done" && f.requirementMet !== false);
  if (state.downloadMode === "zip" && finalFiles.length) {
    handleZipDownload();
  }
}

async function processOne(rec) {
  const rawSettings = effectiveSettings(rec);
  const { width, height } = resolveDims(rawSettings);
  const settings = Object.assign({}, rawSettings, { width, height });
  const effective = Object.assign({}, rec, { settings });
  if (rec.fileType === "application/pdf" || rec.kind === "pack") {
    return processPdfFile(effective);
  }
  if (rec.fileType.startsWith("image/")) {
    return processImageFile(effective);
  }
  throw new Error("Unsupported file type.");
}

function applyResult(rec, result) {
  const format = result.format || outputFormat(rec);
  const isImageOut = ["jpg", "jpeg", "png", "webp", "gif"].includes(format);
  const processedBlobURL = isImageOut
    ? URL.createObjectURL(result.blob)
    : null;

  if (rec.processedBlobURL) URL.revokeObjectURL(rec.processedBlobURL);

  updateFile(rec.id, {
    status: "done",
    processedFile: result.blob,
    processedSize: result.blob.size,
    processedBlobURL,
    requirementMet: result.metTarget !== false,
    resultDetails: {
      format,
      width: result.width || null,
      height: result.height || null,
      pages: Array.isArray(result.pages)
        ? result.pages.length
        : result.pages || null,
      pageBlobs: Array.isArray(result.pages) ? result.pages : null,
      targetBytes: result.targetBytes || null,
      targetLabel:
        result.targetLabel ||
        (rec.settings?.targetOn ? `${rec.settings.targetValue} ${rec.settings.targetUnit}` : null),
      note: result.note || null,
    },
  });
}

async function onRetry(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  resetProcessed(id);
  updateFile(rec.id, { status: "processing" });
  setStage(STAGES.CONFIGURE);
  setStep(STAGES.CONFIGURE);
  showProgress("Retrying one file…");
  render();
  updateProgress(state.files);
  try {
    const result = await processOne(rec);
    applyResult(rec, result);
    toast(`✓ ${rec.currentName} processed`, "success");
  } catch (e) {
    updateFile(rec.id, { status: "failed", error: e.message || "Failed" });
    toast(`Could not process ${rec.currentName}: ${e.message}`, "error", 6000);
  }
  setStep(STAGES.RESULT);
  render();
  render();
}

// ============ Downloads ============

function downloadName(rec) {
  const fmt = rec.resultDetails?.format || "bin";
  const base = sanitizeFileName((rec.currentName || rec.originalName).replace(/\.[^.]+$/, ""));
  return `${base}.${fmt}`;
}

function onDownloadOne(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec || !rec.processedFile) return toast("No result to download yet.", "warn");
  const pages = rec.resultDetails?.pageBlobs;
  if (pages && pages.length > 1) {
    const base = sanitizeFileName((rec.currentName || rec.originalName).replace(/\.[^.]+$/, ""));
    pages.forEach((p, idx) => {
      const num = p.pageNumber != null ? p.pageNumber : idx + 1;
      downloadBlob(p.blob, `${base}_page_${String(num).padStart(2, "0")}.${rec.resultDetails.format}`);
    });
    toast(`Downloaded ${pages.length} page(s).`, "success");
    return;
  }
  downloadBlob(rec.processedFile, downloadName(rec));
  toast("Download started.", "success");
}

async function handleDownloadSeparate() {
  const ready = state.files.filter((f) => f.status === "done" && f.requirementMet !== false);
  if (!ready.length) return toast("No verified results to download.", "warn");
  ready.forEach((rec, i) => setTimeout(() => onDownloadOne(rec.id), i * 350));
  toast(`Downloading ${ready.length} file(s).`, "info", 2500);
}

async function handleZipDownload() {
  const ready = state.files.filter((f) => f.status === "done" && f.requirementMet !== false);
  if (!ready.length) return toast("No verified results to download.", "warn");
  toast("Creating ZIP…", "info");
  try {
    const zipBlob = await buildZip(ready);
    downloadBlob(zipBlob, "FormReady_Application_Pack.zip");
    toast("✓ ZIP created successfully", "success");
  } catch (e) {
    toast(`ZIP failed: ${e.message}`, "error", 6000);
  }
}

// ============ Navigation ============

function onBackToConfigure() {
  setStage(STAGES.CONFIGURE);
  setStep(STAGES.CONFIGURE);
  render();
}

// ============ Info ============

function onOpenOps() { showOperations(); }
function onOpenAbout() { showAbout(); }
function onOpenPrivacy() { showPrivacy(); }

// Test hook (only active with ?test=1)
if (new URLSearchParams(location.search).has("test")) {
  window.__fr = {
    add: (files) => handleNewFiles(files),
    processAll,
    getFiles: () => state.files.map((f) => ({
      id: f.id,
      name: f.currentName,
      type: f.fileType,
      status: f.status,
      settings: f.settings,
      size: f.processedSize,
      met: f.requirementMet,
      format: f.resultDetails ? f.resultDetails.format : null,
      dims: f.resultDetails ? [f.resultDetails.width, f.resultDetails.height] : null,
      error: f.error,
    })),
    state: () => ({
      stage: state.stage,
      bulk: state.bulk,
      downloadMode: state.downloadMode,
      fileCount: state.files.length,
    }),
    buildZip: async () => {
      const ready = state.files.filter((f) => f.status === "done" && f.requirementMet !== false);
      const blob = await buildZip(ready);
      return { size: blob.size, count: ready.length };
    },
  };
}

// ============ Init ============

async function boot() {
  cacheEl();
  initUI({
    onSelectFiles: () => openFileDialog && openFileDialog(),
    onFiles: handleNewFiles,
    onRemove,
    onRename,
    onEditImage,
    onEditSettings,
    onSaveSettings,
    onClearSettings,
    onClearAll,
    onBulkChange,
    onApplyAll,
    onResetBulk,
    onDownloadMode,
    onProcessAll: processAll,
    onRetry,
    onDownloadOne,
    onDownloadSeparate: handleDownloadSeparate,
    onDownloadZip: handleZipDownload,
    onBackToConfigure,
    onPackToggle,
    onCombine,
    onCombineSubmit,
    onOpenOps,
    onOpenAbout,
    onOpenPrivacy,
  });

  initProcesWorkerSupport();
  syncBulkUI();
  setupInputHandlers();
  setStage(STAGES.UPLOAD);
  setStep(STAGES.UPLOAD);
  render();
}

window.addEventListener("DOMContentLoaded", boot);