// ===== file-manager.js — CRUD for file records =====

import { getState, addFiles as pushRecords, removeFile, clearFiles, updateFile } from "./state.js";

const state = getState();

export function addRecords(records) {
  pushRecords(records);
  return records;
}

export function removeRecord(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  if (rec.previewURL) URL.revokeObjectURL(rec.previewURL);
  if (rec.processedBlobURL) URL.revokeObjectURL(rec.processedBlobURL);
  removeFile(id);
}

export function renameRecord(id, newName) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  const name = (newName || "").trim();
  if (!name) return;
  updateFile(id, { currentName: name });
}

export function setSettings(id, settings) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  updateFile(id, { settings });
}

export function clearSettings(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  updateFile(id, { settings: null });
}

export function resetProcessed(id) {
  const rec = state.files.find((f) => f.id === id);
  if (!rec) return;
  if (rec.processedBlobURL) URL.revokeObjectURL(rec.processedBlobURL);
  updateFile(id, {
    status: rec.status === "packed" ? "packed" : "ready",
    processedFile: null,
    processedSize: null,
    processedBlobURL: null,
    error: null,
    requirementMet: null,
    resultDetails: null,
  });
}

export function clearAll() {
  clearFiles();
}