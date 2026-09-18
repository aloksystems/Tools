// ===== upload.js — ingest files: dialog + drag & drop + preview building =====

import { classifyFromName } from "./classification.js";
import { newFileRecord } from "./state.js";
import { buildPreview } from "./preview.js";
import { getFileExt, extMatch, classifyMimeByType } from "./utils.js";

const SUPPORTED = ["jpg", "jpeg", "png", "webp", "gif", "pdf"];

export function isSupportedFile(file) {
  if (file.type === "application/pdf") return true;
  if (file.type.startsWith("image/")) return true;
  return extMatch(file.name, SUPPORTED);
}

export function normalizeFileExt(file) {
  let ext = getFileExt(file.name);
  if (!ext && file.type === "application/pdf") ext = "pdf";
  if (!ext && file.type.startsWith("image/")) ext = "unknown";
  return ext;
}

export async function addFiles(fileList) {
  const accepted = [];
  const rejected = [];

  for (const file of Array.from(fileList || [])) {
    if (!file || !file.size) {
      rejected.push(file ? file.name : "?");
      continue;
    }
    if (isSupportedFile(file)) {
      accepted.push(file);
    } else {
      rejected.push(file.name);
    }
  }

  const records = [];
  for (const file of accepted) {
    const record = newFileRecord(file);
    record.ext = normalizeFileExt(file);
    record.category = classifyFromName(file.name);

    const type = classifyMimeByType(file.type);
    if (record.ext === "unknown" && type !== "unknown") record.ext = type;

    if (file.type.startsWith("image/")) {
      record.previewURL = URL.createObjectURL(file);
      const { buildPreview } = await import("./preview.js");
      const info = await buildPreview(record);
      record.dims = info.dims;
    }
    if (file.type === "application/pdf") {
      const { buildPreview } = await import("./preview.js");
      const info = await buildPreview(record);
      record.pdfPages = info.pdfPages;
    }

    records.push(record);
  }

  return { records, rejected };
}

export function initDropzone(inputEl, dropzoneEl, handlers) {
  function openDialog() {
    if (handlers.onBeforeSelect && !handlers.onBeforeSelect()) return;
    inputEl.value = "";
    inputEl.click();
  }

  inputEl.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (files && files.length) {
      await handlers.onFiles(files);
    }
    inputEl.value = "";
  });

  dropzoneEl.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    openDialog();
  });

  dropzoneEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDialog();
    }
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzoneEl.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzoneEl.classList.remove("is-dragover");
    });
  });

  dropzoneEl.addEventListener("drop", async (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) await handlers.onFiles(files);
  });

  return { openDialog };
}