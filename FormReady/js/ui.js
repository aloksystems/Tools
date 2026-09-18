// ===== ui.js — DOM rendering, modals, toasts =====

import { getState, setStage, STAGES } from "./state.js";
import { formatFileSize, resolveDims } from "./utils.js";
import { categoryIcon } from "./classification.js";
import { effectBy } from "./compression.js";

const state = getState();

let callbacks = {};

// ---------- Tiny DOM helper ----------
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else if (key === "checked" || key === "selected" || key === "disabled") {
      if (value) node.setAttribute(key, "");
    } else if (key === "hidden") {
      if (value) node.setAttribute("hidden", "");
    } else if (value !== null && value !== undefined && value !== false) {
      node.setAttribute(key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(), value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// ---------- Element cache ----------
const el = {};
export function cacheEl() {
  el.stepper = document.getElementById("stepper");
  el.stageUpload = document.getElementById("stage-upload");
  el.stageConfigure = document.getElementById("stage-configure");
  el.stageResult = document.getElementById("stage-result");
  el.fileList = document.getElementById("fileList");
  el.emptyDocs = document.getElementById("emptyDocs");
  el.docsSummary = document.getElementById("docsSummary");
  el.progressWrap = document.getElementById("progressWrap");
  el.progressLabel = document.getElementById("progressLabel");
  el.progressCount = document.getElementById("progressCount");
  el.progressFill = document.getElementById("progressFill");
  el.progressItems = document.getElementById("progressItems");
  el.resultList = document.getElementById("resultList");
  el.resultSummary = document.getElementById("resultSummary");
  el.resultHeading = document.getElementById("resultHeading");
  el.packToggle = document.getElementById("packToggle");
  el.packBar = document.getElementById("packBar");
  el.combineBtn = document.getElementById("combineBtn");
  el.dropzone = document.getElementById("dropzone");
}

export function init(cb) {
  callbacks = cb;

  document.querySelectorAll("[data-select-docs]").forEach((btn) => {
    btn.addEventListener("click", () => callbacks.onSelectFiles());
  });

  document.querySelectorAll("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.querySelector(btn.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-open-ops]").forEach((btn) => {
    btn.addEventListener("click", () => callbacks.onOpenOps());
  });
  document.querySelectorAll("[data-open-about]").forEach((btn) => {
    btn.addEventListener("click", () => callbacks.onOpenAbout());
  });
  document.querySelectorAll("[data-open-privacy]").forEach((btn) => {
    btn.addEventListener("click", () => callbacks.onOpenPrivacy());
  });

  const closeBtns = document.querySelectorAll(".icon-btn");
  closeBtns.forEach((b) => b.addEventListener("click", () => closeModal()));

  const backdrop = document.getElementById("modalBackdrop");
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.getElementById("modalClose").addEventListener("click", closeModal);

  const infoBackdrop = document.getElementById("infoBackdrop");
  infoBackdrop.addEventListener("click", (e) => {
    if (e.target === infoBackdrop) closeInfoModal();
  });
  document.getElementById("infoClose").addEventListener("click", closeInfoModal);

  document.getElementById("clearAllBtn").addEventListener("click", () => callbacks.onClearAll());

  el.packToggle.addEventListener("change", (e) => {
    callbacks.onPackToggle(e.target.checked);
  });
  el.combineBtn.addEventListener("click", () => callbacks.onCombine());

  el.processBtn = document.getElementById("processBtn");
  el.processBtn.addEventListener("click", () => callbacks.onProcessAll());

  document.getElementById("applyAllBtn").addEventListener("click", () => callbacks.onApplyAll());
  document.getElementById("resetBulkBtn").addEventListener("click", () => callbacks.onResetBulk());

  const modes = document.querySelectorAll('input[name="downloadMode"]');
  modes.forEach((m) => m.addEventListener("change", () => callbacks.onDownloadMode(m.value)));

  document.getElementById("downloadSeparateBtn").addEventListener("click", () => callbacks.onDownloadSeparate());
  document.getElementById("downloadZipBtn").addEventListener("click", () => callbacks.onDownloadZip());
  document.getElementById("backToConfigure").addEventListener("click", () => callbacks.onBackToConfigure());
  document.getElementById("addMoreFromResult").addEventListener("click", () => callbacks.onSelectFiles());

  wireBulkForm();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeInfoModal();
    }
  });
}

function wireBulkForm() {
  const bulkTargetOn = document.getElementById("bulkTargetOn");
  const bulkTargetInputs = document.getElementById("bulkTargetInputs");
  const bulkDimsOn = document.getElementById("bulkDimsOn");
  const bulkDimsInputs = document.getElementById("bulkDimsInputs");

  bulkTargetOn.addEventListener("change", () => {
    bulkTargetInputs.hidden = !bulkTargetOn.checked;
    callbacks.onBulkChange({ targetOn: bulkTargetOn.checked });
  });
  bulkDimsOn.addEventListener("change", () => {
    bulkDimsInputs.hidden = !bulkDimsOn.checked;
    document.getElementById("bulkDimsUnit").disabled = !bulkDimsOn.checked;
    document.getElementById("bulkRatio").disabled = !bulkDimsOn.checked;
    callbacks.onBulkChange({ dimsOn: bulkDimsOn.checked });
  });

  document.getElementById("bulkTargetValue").addEventListener("input", (e) =>
    callbacks.onBulkChange({ targetValue: Number(e.target.value) }));
  document.getElementById("bulkTargetUnit").addEventListener("change", (e) =>
    callbacks.onBulkChange({ targetUnit: e.target.value }));
  document.getElementById("bulkWidth").addEventListener("input", (e) =>
    callbacks.onBulkChange({ width: e.target.value ? Number(e.target.value) : null }));
  document.getElementById("bulkHeight").addEventListener("input", (e) =>
    callbacks.onBulkChange({ height: e.target.value ? Number(e.target.value) : null }));
  document.getElementById("bulkDimsUnit").addEventListener("change", (e) =>
    callbacks.onBulkChange({ dimsUnit: e.target.value }));
  document.getElementById("bulkRatio").addEventListener("input", (e) =>
    callbacks.onBulkChange({ ratio: e.target.value }));
  document.getElementById("bulkKeepRatio").addEventListener("change", (e) =>
    callbacks.onBulkChange({ keepRatio: e.target.checked }));
  document.getElementById("bulkQuality").addEventListener("input", (e) => {
    document.getElementById("bulkQualityOut").textContent = `${e.target.value}%`;
    callbacks.onBulkChange({ quality: Number(e.target.value) });
  });

  document.querySelectorAll('input[name="bulkFormat"]').forEach((r) => {
    r.addEventListener("change", () => callbacks.onBulkChange({ format: r.value }));
  });
}

// ---------- Steps ----------

export function setStep(step) {
  const isUpload = step === STAGES.UPLOAD;
  const isConfigure = step === STAGES.CONFIGURE;
  const isResult = step === STAGES.RESULT;

  el.stageUpload.hidden = !isUpload;
  el.stageConfigure.hidden = !isConfigure;
  el.stageResult.hidden = !isResult;
  if (!isConfigure && !isUpload && !isResult) el.stageConfigure.hidden = false;

  document.querySelectorAll(".step").forEach((s) => {
    const name = s.dataset.step;
    s.classList.toggle("is-active", name === step);
    s.classList.toggle("is-done", name !== step && !isUpload && !isResult);
  });

  if (step === STAGES.RESULT) {
    el.progressWrap.hidden = true;
  }
}

// ---------- Buld settings UI state ----------

export function syncBulkUI() {
  const b = state.bulk;
  const f = document.getElementById("bulkForm");
  const formatRadio = f.querySelector(`input[name="bulkFormat"][value="${b.format}"]`);
  if (formatRadio) formatRadio.checked = true;
  document.getElementById("bulkTargetOn").checked = b.targetOn;
  document.getElementById("bulkTargetInputs").hidden = !b.targetOn;
  document.getElementById("bulkTargetValue").value = b.targetValue;
  document.getElementById("bulkTargetUnit").value = b.targetUnit;
  document.getElementById("bulkQuality").value = b.quality;
  document.getElementById("bulkQualityOut").textContent = `${b.quality}%`;
  document.getElementById("bulkDimsOn").checked = b.dimsOn;
  document.getElementById("bulkDimsInputs").hidden = !b.dimsOn;
  document.getElementById("bulkWidth").value = b.width || "";
  document.getElementById("bulkHeight").value = b.height || "";
  document.getElementById("bulkDimsUnit").value = b.dimsUnit || "px";
  document.getElementById("bulkDimsUnit").disabled = !b.dimsOn;
  document.getElementById("bulkRatio").value = b.ratio || "";
  document.getElementById("bulkRatio").disabled = !b.dimsOn;
  document.getElementById("bulkKeepRatio").checked = b.keepRatio;
}

// ---------- Render ----------

export function render() {
  renderDocsSummary();
  renderFileList();
  renderPackBar();
  renderResult();
  el.packToggle.checked = state.pack.enabled;
}

export function getDefaultSettings() {
  const b = state.bulk;
  return {
    format: b.format,
    targetOn: b.targetOn,
    targetValue: b.targetValue,
    targetUnit: b.targetUnit,
    quality: b.quality,
    dimsOn: b.dimsOn,
    width: b.width,
    height: b.height,
    dimsUnit: b.dimsUnit || "px",
    ratio: b.ratio || "",
    keepRatio: b.keepRatio,
  };
}

// Merge model: bulk defaults apply to every file; each file's custom
// record.settings only overrides the fields it explicitly sets.
export function effectiveSettings(record) {
  return Object.assign({}, getDefaultSettings(), record.settings || {});
}

function renderDocsSummary() {
  const count = state.files.length;
  el.docsSummary.textContent = `${count} document${count === 1 ? "" : "s"}`;
  const total = state.files.reduce((s, f) => s + (f.originalSize || 0), 0);
  el.docsSummary.textContent += ` · ${formatFileSize(total)} total`;
  el.emptyDocs.hidden = count > 0;
  el.fileList.hidden = count === 0;
}

function renderPackBar() {
  const hasImages = state.files.some((f) => f.fileType.startsWith("image/") && !state.pack.group);
  el.packBar.hidden = !hasImages;
  el.combineBtn.hidden = !(state.pack.enabled && state.pack.group && state.pack.group.length > 1);
}

function renderFileList() {
  el.fileList.innerHTML = "";
  for (const record of state.files) {
    el.fileList.append(renderFileCard(record));
  }
}

export function renderFileCard(record) {
  const isPdf = record.fileType === "application/pdf";
  const isImage = record.fileType.startsWith("image/");
  const settings = effectiveSettings(record);
  const isCustom = !!record.settings;
  const { to } = effectBy(record, settings);
  const dpx = resolveDims(settings);
  const ratioLabel = settings.ratio ? ` (${settings.ratio.replace(/\s+/g, "")})` : "";

  const preview = buildPreviewNode(record);

  const statusBadge = statusBadgeFor(record);

  const info = h("div", { class: "card-info" },
    h("div", { class: "card-info-top" },
      h("span", { class: "card-name" }, record.currentName),
      h("button", {
        class: "card-rename",
        title: "Rename file",
        ariaLabel: `Rename ${record.currentName}`,
        onclick: () => callbacks.onRename(record.id),
      }, "✎")
    ),
    h("div", { class: "card-meta" },
      h("span", {}, `${(record.fileType.split("/")[1] || "file").toUpperCase()} · ${formatFileSize(record.originalSize)}`),
      record.dims ? h("span", {}, `${record.dims.width} × ${record.dims.height} px`) : null,
      isPdf && record.pdfPages ? h("span", {}, `${record.pdfPages} pages`) : null,
      record.category ? h("span", { class: "badge badge-cat" }, `${categoryIcon(record.category)} ${record.category}`) : null
    ),
    statusBadge
  );

  const req = h("div", { class: "card-req" },
    h("span", { class: "req-line" }, "Output: ", h("strong", {}, to === "original" ? "Original" : to.toUpperCase())),
    settings.targetOn
      ? h("span", {}, "Target: ", h("strong", { class: "req-target" }, `≤ ${settings.targetValue} ${settings.targetUnit}`))
      : h("span", {}, "Target: ", h("em", {}, "No limit")),
    settings.dimsOn || (settings.width && settings.height)
      ? h("span", {}, "Dimensions: ", h("strong", {}, `${[dpx.width, dpx.height].filter(Boolean).join(" × ")} px${ratioLabel}`))
      : null,
    isCustom
      ? h("span", { class: "badge badge-custom" }, "Custom settings")
      : h("span", {}, "Using bulk settings")
  );

  const actions = []; 

  if (record.status === "done" && record.processedBlobURL) {
    actions.push(h("button", {
      class: "btn btn-soft btn-sm",
      onclick: () => callbacks.onDownloadOne(record.id),
    }, "Download"));
  }

  if (isImage && record.status !== "processing") {
    actions.push(h("button", {
      class: "btn btn-ghost btn-sm",
      onclick: () => callbacks.onEditImage(record.id),
    }, "Edit Image"));
  }

  if (record.status !== "processing") {
    actions.push(h("button", {
      class: "btn btn-ghost btn-sm",
      onclick: () => callbacks.onEditSettings(record.id),
    }, isCustom ? "Change Settings" : "Edit Settings"));
  }

  actions.push(h("button", {
    class: "btn btn-danger-soft btn-sm",
    onclick: () => callbacks.onRemove(record.id),
  }, "Remove"));

  const cardContent = [
    h("div", { class: "card-main" }, preview, info),
    req,
    h("div", { class: "card-actions" }, ...actions),
  ];

  if (record.status === "done" && record.resultDetails) {
    cardContent.push(renderResultBlock(record));
  }

  const card = h("article", {
    class: cardClasses(record),
    role: "listitem",
  }, ...cardContent);

  return card;
}

function cardClasses(record) {
  const base = ["file-card"];
  if (record.settings) base.push("is-custom");
  if (record.status === "done") base.push("is-processed");
  if (record.status === "failed") base.push("is-failed");
  if (record.status === "processing") base.push("is-processing");
  return base.join(" ");
}

function statusBadgeFor(record) {
  switch (record.status) {
    case "processing": return h("span", { class: "badge badge-processing", role: "status" }, "⟳ Processing");
    case "done": return h("span", { class: "badge badge-done", role: "status" }, record.requirementMet === false ? "⚠ Partial" : "✓ Ready");
    case "failed": return h("span", { class: "badge badge-failed", role: "status" }, "✕ Failed");
    default: return h("span", { class: "badge badge-ready", role: "status" }, "Ready");
  }
}

function buildPreviewNode(record) {
  if (record.fileType.startsWith("image/") && record.previewURL) {
    return h("div", { class: "card-preview" },
      h("img", { src: record.previewURL, alt: `Preview of ${record.currentName}`, loading: "lazy" }));
  }
  if (record.fileType === "application/pdf") {
    return h("div", { class: "card-preview" }, h("span", { class: "pdf-icon" }, "PDF"));
  }
  return h("div", { class: "card-preview" }, h("span", { class: "file-icon" }, "FILE"));
}

function renderResultBlock(record) {
  const d = record.resultDetails || {};
  const eff = effectiveSettings(record);
  const targetLabel = eff.targetOn
    ? `≤ ${eff.targetValue} ${eff.targetUnit}`
    : null;

  return h("div", { class: "card-result" },
    h("div", { class: "result-stat" },
      h("span", {}, "Original: ", h("strong", {}, formatFileSize(record.originalSize))),
      targetLabel ? h("span", {}, "Target: ", h("strong", {}, targetLabel)) : null,
      d.width && d.height ? h("span", {}, `${d.width} × ${d.height} px`) : null
    ),
    h("div", { class: "result-size" },
      record.requirementMet === false
        ? h("span", { class: "verified-fail", role: "status" }, "✕ Requirement not satisfied")
        : h("span", { class: "verified-ok", role: "status" }, "✓ Requirement satisfied"),
      " ",
      h("strong", {}, formatFileSize(record.processedSize)),
      record.requirementMet === false
        ? h("button", { class: "btn btn-ghost btn-sm", style: "margin-left:8px", onclick: () => callbacks.onRetry(record.id) }, "Try Again")
        : null
    )
  );
}

// ---------- Result rendering ----------

function renderResult() {
  const done = state.files.filter((f) => f.status === "done");
  const failed = state.files.filter((f) => f.status === "failed");
  const readyCount = done.filter((f) => f.requirementMet !== false).length;

  el.resultList.innerHTML = "";
  for (const record of state.files) {
    if (record.status !== "done" && record.status !== "failed") continue;
    el.resultList.append(renderResultCard(record));
  }

  const heading = failed.length
    ? `${readyCount} ready · ${failed.length} need attention`
    : `${done.length} ready`;
  el.resultHeading.textContent = done.length ? "Your Documents Are Ready" : "Processing Results";
  el.resultSummary.textContent = heading;
}

function renderResultCard(record) {
  const isImage = record.fileType.startsWith("image/");
  const preview = record.processedBlobURL && (isImage || record.resultDetails?.format !== "pdf")
    ? h("div", { class: "card-preview" }, h("img", { src: record.processedBlobURL, alt: `Result of ${record.currentName}` }))
    : h("div", { class: "card-preview" }, h("span", { class: "pdf-icon" }, "PDF"));

  const d = record.resultDetails || {};
  const eff = effectiveSettings(record);
  const targetLabel = eff.targetOn
    ? `≤ ${eff.targetValue} ${eff.targetUnit}`
    : null;

  const meta = [
    `${(d.format || "file").toUpperCase()} · ${formatFileSize(record.processedSize)}`,
    d.width && d.height ? `${d.width} × ${d.height} px` : null,
    d.pages && d.pages > 1 ? `${d.pages} pages` : null,
  ].filter(Boolean).join(" · ");

  const ok = record.requirementMet !== false;

  return h("article", { class: `result-card${ok ? "" : " result-fail"}`, role: "listitem" },
    preview,
    h("div", { class: "card-name" }, record.currentName),
    h("div", { class: "card-meta" }, h("span", {}, meta)),
    ok
      ? h("span", { class: "verified-ok", role: "status" }, "✓ Requirement satisfied")
      : h("span", { class: "verified-fail", role: "status" }, "✕ Requirement not satisfied"),
    targetLabel ? h("span", { class: "req-line" }, "Target: ", h("strong", {}, targetLabel)) : null,
    h("div", { class: "card-actions" },
      h("button", { class: "btn btn-primary btn-sm", onclick: () => callbacks.onDownloadOne(record.id) }, "Download"),
      !ok ? h("button", { class: "btn btn-ghost btn-sm", onclick: () => callbacks.onRetry(record.id) }, "Try Again") : null
    )
  );
}

// ---------- Progress ----------

export function showProgress(label = "Processing…") {
  el.progressWrap.hidden = false;
  el.progressLabel.textContent = label;
  el.progressCount.textContent = "0 / 0 files";
  el.progressFill.style.width = "0%";
  el.progressItems.innerHTML = "";
}

export function updateProgress(records) {
  const total = records.length;
  const done = records.filter((r) => r.status === "done" || r.status === "failed").length;
  const running = records.filter((r) => r.status === "processing");
  el.progressCount.textContent = `${done} / ${total} files`;
  el.progressFill.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;

  el.progressItems.innerHTML = "";
  let active = done;
  for (const r of records) {
    const cls = r.status === "done" ? "p-ok" : r.status === "failed" ? "p-err" : r.status === "processing" ? "p-run" : "";
    el.progressItems.append(h("li", {},
      h("span", { class: cls },
        r.status === "done" ? "✓" : r.status === "failed" ? "✕" : r.status === "processing" ? "⟳" : "○",
        " ",
        r.currentName
      )
    ));
  }
}

// ---------- Toasts ----------

export function toast(message, type = "info", duration = 3800) {
  const stack = document.getElementById("toastStack");
  const icon = { success: "✓", error: "✕", info: "ℹ", warn: "!" }[type] || "ℹ";
  const node = h("div", { class: `toast toast-${type}`, role: "status" },
    h("span", { class: "toast-icon" }, icon),
    h("span", { class: "toast-message" }, message)
  );
  stack.append(node);
  setTimeout(() => {
    node.style.transition = "opacity .3s, transform .3s";
    node.style.opacity = "0";
    node.style.transform = "translateY(8px)";
    setTimeout(() => node.remove(), 320);
  }, duration);
}

// ---------- Modals ----------

export function openModal(title, bodyNode, footNode) {
  const backdrop = document.getElementById("modalBackdrop");
  document.getElementById("modalTitle").textContent = title;
  const body = document.getElementById("modalBody");
  body.innerHTML = "";
  body.append(bodyNode);
  const foot = document.getElementById("modalFoot");
  foot.innerHTML = "";
  if (footNode) foot.append(footNode);
  backdrop.hidden = false;
  document.body.style.overflow = "hidden";
}

export function closeModal() {
  const backdrop = document.getElementById("modalBackdrop");
  backdrop.hidden = true;
  document.body.style.overflow = "";
  document.getElementById("modalBody").innerHTML = "";
  document.getElementById("modalFoot").innerHTML = "";
}

function openInfo(title, bodyNode) {
  document.getElementById("infoTitle").textContent = title;
  const body = document.getElementById("infoBody");
  body.innerHTML = "";
  body.append(bodyNode);
  document.getElementById("infoBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
}

export function closeInfoModal() {
  document.getElementById("infoBackdrop").hidden = true;
  document.body.style.overflow = "";
}

export function showAbout() {
  const content = h("div", { class: "info-body" },
    h("h3", {}, "What is FormReady?"),
    h("p", {}, "FormReady is a bulk document preparation workspace. Upload many photos, signatures, certificates and PDFs at once, give each file its own output format, maximum size and dimensions — then process everything and download the results separately or as one ZIP."),
    h("h3", {}, "How the workflow works"),
    h("ul", {},
      h("li", {}, "Upload all documents together (JPG, PNG, WEBP, GIF, PDF)."),
      h("li", {}, "Set requirements per file — or set bulk defaults once and override individual files."),
      h("li", {}, "The app converts, resizes and compresses every file using its own engine."),
      h("li", {}, "Each result is verified against the requested target before it is marked ready."),
      h("li", {}, "Download files separately or as FormReady_Application_Pack.zip."),
    ),
    h("h3", {}, "About “maximum size”"),
    h("p", {}, "When you set a target such as “≤ 50 KB”, it is a maximum. FormReady iteratively optimises quality and, if permitted, dimensions until the output meets the limit, then reports whether the requirement was satisfied."),
    h("h3", {}, "Bulk defaults & per-file settings"),
    h("p", {}, "Set defaults once (format, maximum size, quality, dimensions, aspect ratio) and every new file uses them. Turn on “Custom settings for this file” to give a single file its own instructions — or clear them any time to fall back to the bulk defaults."),
  );
  openInfo("About FormReady", content);
}

export function showPrivacy() {
  const content = h("div", { class: "info-body" },
    h("h3", {}, "Private & Browser-Based"),
    h("p", {}, "Your files are processed locally in your browser whenever possible. Nothing is uploaded to a server unless you explicitly download or share something yourself."),
    h("h3", {}, "What happens to your files"),
    h("ul", {},
      h("li", {}, "Files stay in memory while you work with them."),
      h("li", {}, "Nothing is sent to analytics or logging services."),
      h("li", {}, "Clearing the workspace removes files and previews from memory immediately."),
      h("li", {}, "Reloading the page clears the current session."),
    ),
    h("h3", {}, "Libraries"),
    h("p", {}, "Processing is powered by open-source libraries loaded from a CDN (pdf-lib, PDF.js, JSZip). The page source is fully inspectable."),
  );
  openInfo("Privacy", content);
}

export function showOperations() {
  const ops = [
    ["Image → JPG / PNG / WEBP", "Convert and compress any uploaded image."],
    ["Image → PDF", "Turn a single image into a PDF."],
    ["Combine into one PDF", "Order and merge selected images into one document."],
    ["PDF compression", "Rebuild PDFs with optimised object streams."],
    ["PDF → JPG / PNG", "Render PDF pages as images, all or selected."],
    ["Resize & crop", "Custom dimensions, aspect ratio lock, canvas crop and rotate."],
    ["Target maximum size", "Iterative quality/dimension optimisation with verification."],
    ["Rename files", "Friendly output names before processing."],
    ["Before/after verification", "Every result is measured and compared to its target."],
    ["ZIP download", "Collect everything into FormReady_Application_Pack.zip."],
  ];
  const grid = h("div", { class: "op-grid" });
  for (const [label, hint] of ops) {
    grid.append(h("div", { class: "op-card" }, h("strong", {}, label), h("small", {}, hint)));
  }
  const content = h("div", { class: "info-body" },
    h("p", {}, "All operations live inside the single workspace — choose them per file via Edit Settings."),
    grid
  );
  openInfo("Operations", content);
}

// ---------- Confirm dialog ----------

export function confirmDialog(message, note) {
  return new Promise((resolve) => {
    const body = h("div", {},
      h("p", { class: "confirm-text" }, message),
      note ? h("p", { class: "confirm-note" }, note) : null
    );
    const foot = h("div", {},
      h("button", { class: "btn btn-ghost", onclick: () => { closeModal(); resolve(false); } }, "Cancel"),
      h("button", { class: "btn btn-danger-soft", onclick: () => { closeModal(); resolve(true); } }, "Clear All")
    );
    openModal("Please confirm", body, foot);
  });
}

export function promptRename(record, onDone) {
  const input = h("input", {
    type: "text",
    value: record.currentName,
    class: "rename-input",
    style: "width:100%",
    ariaLabel: "New file name",
  });
  const body = h("div", {},
    h("label", { style: "display:block;margin-bottom:8px;font-weight:700" }, "Rename file"),
    input,
    h("p", { class: "confirm-note", style: "margin-top:8px" }, "Safe characters only. The name is used for the downloaded result.")
  );
  const foot = h("div", {},
    h("button", { class: "btn btn-ghost", onclick: () => { closeModal(); } }, "Cancel"),
    h("button", { class: "btn btn-primary", onclick: () => {
      const name = input.value.trim();
      closeModal();
      if (name) onDone(name);
    } }, "Rename")
  );
  openModal(`Rename — ${record.currentName}`, body, foot);
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

export function showValidationError(fileNames) {
  toast(
    `No files were selected. Choose JPG, PNG, WEBP, GIF or PDF documents.`,
    "warn"
  );
  if (fileNames && fileNames.length) {
    toast(`Skipped unsupported: ${fileNames.join(", ")}`, "error", 5000);
  }
}

// ---------- Settings modal ----------

export function openSettingsModal(record) {
  const s = Object.assign({}, effectiveSettings(record));
  const isPdf = record.fileType === "application/pdf";
  const isImage = record.fileType.startsWith("image/");
  let isCustom = !!record.settings;

  const formats = [];
  if (isImage) {
    formats.push("original", "jpg", "png", "webp", "pdf");
  } else if (isPdf) {
    formats.push("original", "jpg", "png", "webp");
  } else {
    formats.push("original");
  }

  const formatSeg = h("div", { class: "segment", role: "radiogroup", ariaLabel: "Output format" });
  for (const f of formats) {
    formatSeg.append(h("label", { class: "seg-opt" },
      h("input", { type: "radio", name: "mdlFormat", value: f, class: "mdl-in", checked: s.format === f }),
      h("span", {}, f === "original" ? "Original" : f.toUpperCase())
    ));
  }

  const targetOn = h("input", { type: "checkbox", id: "mdlTargetOn", checked: s.targetOn, class: "mdl-in" });
  const targetValue = h("input", { type: "number", id: "mdlTargetValue", min: "1", value: s.targetValue || 200, style: "width:100px", class: "mdl-in" });
  const targetUnit = h("select", { id: "mdlTargetUnit", class: "mdl-in" },
    h("option", { value: "KB", selected: s.targetUnit === "KB" }, "KB"),
    h("option", { value: "MB", selected: s.targetUnit === "MB" }, "MB")
  );

  const dimsOn = h("input", { type: "checkbox", id: "mdlDimsOn", checked: s.dimsOn, class: "mdl-in" });
  const dimW = h("input", { type: "number", id: "mdlW", min: "1", placeholder: "Width", value: s.width || "", class: "mdl-in" });
  const dimH = h("input", { type: "number", id: "mdlH", min: "1", placeholder: "Height", value: s.height || "", class: "mdl-in" });
  const dimsUnitSel = h("select", { id: "mdlDimsUnit", class: "mdl-in" },
    h("option", { value: "px", selected: (s.dimsUnit || "px") === "px" }, "px"),
    h("option", { value: "cm", selected: s.dimsUnit === "cm" }, "cm")
  );
  const ratioInput = h("input", { type: "text", id: "mdlRatioStr", placeholder: "Ratio 3×4 / 3:4", value: s.ratio || "", class: "mdl-in" });
  const keepRatio = h("input", { type: "checkbox", id: "mdlKeepRatio", checked: s.keepRatio !== false, class: "mdl-in" });

  const quality = h("input", { type: "range", id: "mdlQuality", min: "10", max: "100", step: "1", value: s.quality || 80, class: "mdl-in" });
  const qualityOut = h("output", { for: "mdlQuality" }, `${s.quality || 80}%`);

  const pagesField = isPdf
    ? h("div", { class: "editor-field" },
        h("label", { for: "mdlPages" }, "Pages (PDF → image)"),
        h("input", { type: "text", id: "mdlPages", placeholder: "All, or e.g. 1,3,4", value: s.pagesList || "", class: "mdl-in" }),
        h("small", { class: "editor-live-size" }, "Leave empty for all pages.")
      )
    : null;

  const customToggle = h("input", { type: "checkbox", id: "mdlCustom", checked: isCustom });
  const customHint = h("p", { class: "confirm-note", id: "mdlCustomHint" }, "");
  const customRow = h("div", { class: "settings-custom" },
    h("label", { class: "check check-strong", style: "font-size:15px" },
      customToggle,
      h("span", {}, "Custom settings for this file")
    ),
    customHint
  );

  const body = h("div", { class: "settings-form" },
    customRow,
    h("fieldset", { class: "field" },
      h("legend", {}, "Output Format"),
      formatSeg
    ),
    h("fieldset", { class: "field" },
      h("legend", {}, `Target Size (maximum)`),
      h("div", { class: "target-row" },
        h("label", { class: "check" }, targetOn, h("span", {}, "Limit size")),
        targetValue, targetUnit
      )
    ),
    h("fieldset", { class: "field" },
      h("legend", {}, "Dimensions"),
      h("div", { class: "target-row" },
        h("label", { class: "check" }, dimsOn, h("span", {}, "Resize")),
        dimW, h("span", { "aria-hidden": "true" }, "×"), dimH, dimsUnitSel
      ),
      h("div", { class: "target-row ratio-row" },
        h("label", { class: "check sm" }, keepRatio, h("span", {}, "Keep ratio")),
        h("label", { class: "ratio-label", for: "mdlRatioStr" }, "Aspect ratio"),
        ratioInput
      )
    ),
    h("fieldset", { class: "field" },
      h("legend", {}, "Quality"),
      h("div", { class: "slider-row" }, quality, qualityOut)
    ),
    pagesField,
  );

  function refreshCustom() {
    const base = !isCustom;
    body.querySelectorAll(".mdl-in").forEach((n) => { n.disabled = base; });
    targetValue.disabled = base || !targetOn.checked;
    targetUnit.disabled = base || !targetOn.checked;
    dimW.disabled = base || !dimsOn.checked;
    dimH.disabled = base || !dimsOn.checked;
    dimsUnitSel.disabled = base || !dimsOn.checked;
    ratioInput.disabled = base || !dimsOn.checked;
    keepRatio.disabled = base || !dimsOn.checked;
    customHint.textContent = isCustom
      ? "These settings are saved for this file only. Other files keep the bulk defaults."
      : "This file uses the bulk defaults. Switch the toggle on to make it custom.";
    body.classList.toggle("is-default", !isCustom);
    if (apply) apply.textContent = isCustom ? "Apply Custom Settings" : "Use Bulk Defaults";
    if (reset) reset.textContent = isCustom ? "Use Bulk Defaults" : "Close";
  }

  targetOn.addEventListener("change", refreshCustom);
  dimsOn.addEventListener("change", refreshCustom);
  quality.addEventListener("input", () => { qualityOut.textContent = `${quality.value}%`; });

  customToggle.addEventListener("change", () => {
    isCustom = customToggle.checked;
    refreshCustom();
  });

  const apply = h("button", { class: "btn btn-primary", id: "mdlApplyBtn", onclick: () => {
    if (!isCustom) {
      closeModal();
      callbacks.onClearSettings(record.id);
      return;
    }
    const format = document.querySelector('input[name="mdlFormat"]:checked')?.value || "original";
    const dimsUnit = dimsUnitSel.value || "px";
    const ratioStr = ratioInput.value.trim();
    const settings = {
      format,
      targetOn: targetOn.checked,
      targetValue: Number(targetValue.value) || 200,
      targetUnit: targetUnit.value,
      quality: Number(quality.value) || 80,
      dimsOn: dimsOn.checked,
      width: dimsOn.checked && dimW.value ? Number(dimW.value) : null,
      height: dimsOn.checked && dimH.value ? Number(dimH.value) : null,
      dimsUnit,
      ratio: ratioStr,
      keepRatio: keepRatio.checked,
    };
    if (isPdf) {
      const raw = pagesField.querySelector("#mdlPages")?.value.trim();
      settings.pagesList = raw || "";
      settings.pages = raw
        ? raw.split(",").map((s2) => parseInt(s2, 10)).filter((n) => n > 0)
        : null;
    }
    // preserve crop/rotate from the image editor if present
    if (record.settings) {
      if (record.settings.crop) settings.crop = record.settings.crop;
      if (record.settings.rotate) settings.rotate = record.settings.rotate;
    }
    closeModal();
    callbacks.onSaveSettings(record.id, settings);
  }}, isCustom ? "Apply Custom Settings" : "Use Bulk Defaults");

  const reset = h("button", { class: "btn btn-ghost", onclick: () => {
    closeModal();
    callbacks.onClearSettings(record.id);
  }}, isCustom ? "Use Bulk Defaults" : "Close");

  const foot = h("div", {}, reset, apply);
  refreshCustom();
  openModal(`Edit Settings — ${record.currentName}`, body, foot);
}

// ---------- Image editor modal ----------

export function openImageEditor(record) {
  const s = effectiveSettings(record);
  const isPdf = record.fileType === "application/pdf";

  const canvas = document.createElement("canvas");
  const wrap = h("div", { class: "editor-preview" }, canvas);
  let currentCanvas = null;

  async function loadSource() {
    if (isPdf) {
      const { renderPageToJpeg } = await import("./pdf-processing.js");
      currentCanvas = await renderPageToJpeg(record.originalFile, 1, 1.5);
      draw();
      return;
    }
    const { loadImage } = await import("./image-processing.js");
    const { img } = await loadImage(record.originalFile);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    currentCanvas = c;
    draw();
  }

  let cropEnabled = false;
  let cropX = 0, cropY = 0, cropW = 0, cropH = 0;
  let rotateDeg = 0;
  let mouseDown = false, dragStartX = 0, dragStartY = 0, mode = "idle";

  const dimInfo = h("div", { class: "editor-live-size" }, "Loading…");

  function draw() {
    if (!currentCanvas) return;
    const ctx = canvas.getContext("2d");
    const scale = Math.min(1, (wrap.clientWidth - 8) / currentCanvas.width, (wrap.clientHeight - 8) / currentCanvas.height);
    canvas.width = Math.round(currentCanvas.width * scale);
    canvas.height = Math.round(currentCanvas.height * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(currentCanvas, 0, 0, canvas.width, canvas.height);
    if (cropEnabled && cropW > 0 && cropH > 0) {
      ctx.strokeStyle = "#4f46e5";
      ctx.lineWidth = 2;
      const sx = cropX * scale, sy = cropY * scale, sw = cropW * scale, sh = cropH * scale;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.fillStyle = "rgba(79,70,229,0.14)";
      ctx.fillRect(sx, sy, sw, sh);
    }
    dimInfo.textContent = `${currentCanvas.width} × ${currentCanvas.height} px source`;
  }

  canvas.addEventListener("mousedown", (e) => {
    if (!cropEnabled) return;
    mouseDown = true;
    mode = "new";
    const rect = canvas.getBoundingClientRect();
    dragStartX = e.clientX - rect.left;
    dragStartY = e.clientY - rect.top;
  });
  window.addEventListener("mousemove", (e) => {
    if (!mouseDown) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const curX = (e.clientX - rect.left) * scale;
    const curY = (e.clientY - rect.top) * scale;
    if (mode === "new") {
      cropX = Math.min(dragStartX * scale, curX);
      cropY = Math.min(dragStartY * scale, curY);
      cropW = Math.abs(curX - dragStartX * scale);
      cropH = Math.abs(curY - dragStartY * scale);
    }
    draw();
  });
  window.addEventListener("mouseup", () => { mouseDown = false; mode = "idle"; });

  canvas.addEventListener("touchstart", (e) => {
    if (!cropEnabled) return;
    mouseDown = true; mode = "new";
    const t = e.touches[0];
    dragStartX = t.clientX; dragStartY = t.clientY;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!mouseDown) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const t = e.touches[0];
    const curX = (t.clientX - rect.left) * scale;
    const curY = (t.clientY - rect.top) * scale;
    if (mode === "new") {
      cropX = Math.min(dragStartX * scale, curX);
      cropY = Math.min(dragStartY * scale, curY);
      cropW = Math.abs(curX - dragStartX * scale);
      cropH = Math.abs(curY - dragStartY * scale);
    }
    draw();
  }, { passive: true });

  const cropCheck = h("input", { type: "checkbox", id: "edCrop", checked: false });
  const rotateBtn = h("button", { class: "btn btn-soft btn-sm", onclick: () => {
    rotateDeg = (rotateDeg + 90) % 360;
    applyRotate();
  } }, "⟳ Rotate 90°");

  const note = h("div", { class: "editor-live-size" }, isPdf ? "This page will be the processed image." : "Draw a rectangle to crop. Rotate turns 90° clockwise.");

  const body = h("div", { class: "editor-grid" },
    h("div", {}, wrap, dimInfo),
    h("div", { class: "editor-panel" },
      h("div", { class: "editor-field" },
        h("div", { class: "editor-crop-actions" },
          h("label", { class: "check" }, cropCheck, h("span", {}, "Crop mode")),
          rotateBtn
        ),
        note
      ),
      h("div", { class: "editor-field" },
        h("label", { for: "edQuality" }, "Output quality"),
        h("div", { class: "slider-row" },
          h("input", { type: "range", id: "edQuality", min: "10", max: "100", value: s.quality || 80 }),
          h("output", { for: "edQuality" }, `${s.quality || 80}%`)
        )
      )
    )
  );

  body.querySelector("#edQuality").addEventListener("input", function() {
    this.nextElementSibling.textContent = `${this.value}%`;
  });

  cropCheck.addEventListener("change", () => {
    cropEnabled = cropCheck.checked;
    if (cropEnabled && cropW === 0) {
      cropX = currentCanvas.width * 0.1; cropY = currentCanvas.height * 0.1;
      cropW = currentCanvas.width * 0.8; cropH = currentCanvas.height * 0.8;
    }
    draw();
  });

  function applyRotate() {
    currentCanvas = rotateImageCompat(currentCanvas, 90);
    draw();
  }

  function rotateImageCompat(source, deg) {
    const radians = (deg * Math.PI) / 180;
    const w = source.width;
    const h = source.height;
    const out = document.createElement("canvas");
    if (deg % 180 === 0) {
      out.width = w; out.height = h;
    } else {
      out.width = h; out.height = w;
    }
    const ctx = out.getContext("2d");
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(source, -w / 2, -h / 2);
    return out;
  }

  const apply = h("button", { class: "btn btn-primary", onclick: () => {
    const overrides = {};
    overrides.quality = Number(body.querySelector("#edQuality").value) || 80;
    overrides.kind = "image-edit";
    if (cropEnabled && cropW > 2 && cropH > 2 && currentCanvas) {
      const ratio = currentCanvas.width / canvas.width;
      overrides.crop = {
        enabled: true,
        x: Math.round(cropX * ratio),
        y: Math.round(cropY * ratio),
        width: Math.round(cropW * ratio),
        height: Math.round(cropH * ratio),
      };
    } else {
      overrides.crop = null;
    }
    overrides.rotate = rotateDeg || 0;
    closeModal();
    callbacks.onSaveSettings(record.id, overrides, { edited: true });
  }}, "Apply Changes");

  const foot = h("div", {}, apply);
  openModal(`Edit Image — ${record.currentName}`, body, foot);
  loadSource();

  // expose canvas helpers to closure
  return { getCanvas: () => currentCanvas };
}

// ---------- Combine modal ----------

export function openCombineModal(records) {
  let order = records.slice();
  const list = h("div", { class: "order-wrap" });

  const renderOrder = () => {
    list.innerHTML = "";
    const ul = h("ul", { class: "order-list" });
    order.forEach((rec, idx) => {
      const thumb = rec.previewURL
        ? h("div", { class: "order-thumb" }, h("img", { src: rec.previewURL, alt: "" }))
        : h("div", { class: "order-thumb" }, "IMG");
      ul.append(h("li", { class: "order-item" },
        thumb,
        h("span", { class: "order-name" }, rec.currentName),
        h("button", { class: "order-btn", disabled: idx === 0, title: "Move up", onclick: (e) => { e.stopPropagation(); move(idx, -1); } }, "↑"),
        h("button", { class: "order-btn", disabled: idx === order.length - 1, title: "Move down", onclick: (e) => { e.stopPropagation(); move(idx, 1); } }, "↓"),
        h("button", { class: "order-btn", style: "color:#dc2626", title: "Remove", onclick: (e) => { e.stopPropagation(); order.splice(idx, 1); renderOrder(); } }, "✕")
      ));
    });
    if (!order.length) {
      ul.append(h("li", { class: "order-item" }, h("span", { class: "order-name" }, "No images selected.")));
    }
    list.append(ul);
  };

  function move(idx, d) {
    const target = idx + d;
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    renderOrder();
  }

  renderOrder();

  const pageSizeSel = h("select", { id: "cmbPageSize" },
    h("option", { value: "Auto" }, "Fit to image (Auto)"),
    h("option", { value: "A4" }, "A4"),
    h("option", { value: "Letter" }, "Letter")
  );
  const orientSel = h("select", { id: "cmbOrient" },
    h("option", { value: "portrait" }, "Portrait"),
    h("option", { value: "landscape" }, "Landscape")
  );
  const margin = h("input", { type: "number", id: "cmbMargin", min: "0", max: "100", value: "0", style: "width:90px" });

  const body = h("div", {},
    h("p", { style: "margin:0 0 6px;font-weight:700" }, "Order of pages"),
    list,
    h("fieldset", { class: "field", style: "margin-top:14px" },
      h("legend", {}, "Page options"),
      h("div", { class: "target-row" },
        h("label", { class: "check" }, "Page size"), pageSizeSel,
        h("label", { class: "check" }, "Orientation"), orientSel,
        h("label", { class: "check" }, "Margin (px)"), margin
      )
    )
  );

  const foot = h("div", {},
    h("button", { class: "btn btn-ghost", onclick: closeModal }, "Cancel"),
    h("button", { class: "btn btn-primary", onclick: () => {
      const opts = {
        pageSize: document.getElementById("cmbPageSize").value,
        orientation: document.getElementById("cmbOrient").value,
        margin: Number(document.getElementById("cmbMargin").value) || 0,
      };
      closeModal();
      callbacks.onCombineSubmit(order.slice(), opts, records);
    } }, "Create PDF")
  );

  openModal("Combine Images Into One PDF", body, foot);
}