// ===== state.js — central application state =====

import { uid } from "./utils.js";

export const STAGES = {
  UPLOAD: "upload",
  CONFIGURE: "configure",
  RESULT: "result",
};

const state = {
  stage: STAGES.UPLOAD,
  files: [],
  downloadMode: "separate",
  bulk: {
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
  },
  pack: {
    enabled: false,
    group: null,
  },
  baseURL: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function setStage(stage) {
  state.stage = stage;
  emit();
}

export function addFiles(files) {
  state.files.push(...files);
  emit();
}

export function removeFile(id) {
  state.files = state.files.filter((f) => f.id !== id);
  emit();
}

export function clearFiles() {
  for (const f of state.files) {
    if (f.previewURL) URL.revokeObjectURL(f.previewURL);
  }
  state.files = [];
  emit();
}

export function getFile(id) {
  return state.files.find((f) => f.id === id);
}

export function updateFile(id, patch) {
  const f = getFile(id);
  if (!f) return;
  Object.assign(f, patch);
  emit();
}

export function updateBulk(patch) {
  Object.assign(state.bulk, patch);
  emit();
}

export function setDownloadMode(mode) {
  state.downloadMode = mode;
  emit();
}

export function newFileRecord(file) {
  return {
    id: uid(),
    originalFile: file,
    originalName: file.name,
    currentName: file.name,
    fileType: file.type,
    ext: "",
    originalSize: file.size,
    category: "Document",
    previewURL: null,
    extra: null,
    settings: null,
    status: "ready",
    processedFile: null,
    processedSize: null,
    processedBlobURL: null,
    error: null,
    requirementMet: null,
    resultDetails: null,
  };
}