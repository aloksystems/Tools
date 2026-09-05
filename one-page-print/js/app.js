/**
 * App — main application controller for One Page Print.
 */
(function () {
  'use strict';

  // Modules
  const fileManager = new FileManager();
  const gridCalc = new GridCalculator();
  let previewRenderer;
  let dragManager;
  const printManager = new PrintManager();
  const downloadManager = new DownloadManager();

  // State
  const state = {
    currentSheet: 0,
    grid: { rows: 2, cols: 2 },
    paperSize: 'a4',
    orientation: 'portrait',
    margin: 10,
    gap: 4,
    borderThickness: 0,
    scaleMode: 'fit',
    customGridMode: false
  };

  // DOM
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    uploadSection: $('#uploadSection'),
    uploadArea: $('#uploadArea'),
    browseBtn: $('#browseBtn'),
    fileInput: $('#fileInput'),
    workspace: $('#workspace'),
    thumbStrip: $('#thumbStrip'),
    bottomActions: $('#bottomActions'),
    thumbList: $('#thumbList'),
    thumbCount: $('#thumbCount'),
    previewCanvas: $('#previewCanvas'),
    prevSheet: $('#prevSheet'),
    nextSheet: $('#nextSheet'),
    sheetInfo: $('#sheetInfo'),
    sheetStats: $('#sheetStats'),
    gridPresets: $('#gridPresets'),
    gridInfo: $('#gridInfo'),
    customGridBtn: $('#customGridBtn'),
    customGridForm: $('#customGridForm'),
    customRows: $('#customRows'),
    customCols: $('#customCols'),
    customApplyBtn: $('#customApplyBtn'),
    paperSize: $('#paperSize'),
    orientPortrait: $('#orientPortrait'),
    orientLandscape: $('#orientLandscape'),
    scaleMode: $('#scaleMode'),
    pageMargin: $('#pageMargin'),
    pageMarginVal: $('#pageMarginVal'),
    cellGap: $('#cellGap'),
    cellGapVal: $('#cellGapVal'),
    borderThickness: $('#borderThickness'),
    borderThicknessVal: $('#borderThicknessVal'),
    autoArrangeBtn: $('#autoArrangeBtn'),
    resetBtn: $('#resetBtn'),
    printBtn: $('#printBtn'),
    downloadBtn: $('#downloadBtn'),
    addMoreBtn: $('#addMoreBtn'),
    loadingOverlay: $('#loadingOverlay'),
    loadingText: $('#loadingText'),
    previewWrapper: $('#previewWrapper')
  };

  // ===== Initialization =====
  async function init() {
    await fileManager.init();
    previewRenderer = new PreviewRenderer(els.previewCanvas);
    dragManager = new DragManager(els.thumbList, handleReorder);
    dragManager.init();

    bindEvents();
  }

  // ===== Event Binding =====
  function bindEvents() {
    // Upload
    els.uploadArea.addEventListener('click', () => els.fileInput.click());
    els.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.fileInput.click();
    });
    els.fileInput.addEventListener('change', handleFileSelect);

    // Drag & drop on upload area
    els.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.uploadArea.classList.add('drag-over');
    });
    els.uploadArea.addEventListener('dragleave', () => {
      els.uploadArea.classList.remove('drag-over');
    });
    els.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      els.uploadArea.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    // Paper size
    els.paperSize.addEventListener('change', () => {
      state.paperSize = els.paperSize.value;
      updatePreview();
    });

    // Orientation
    els.orientPortrait.addEventListener('click', () => setOrientation('portrait'));
    els.orientLandscape.addEventListener('click', () => setOrientation('landscape'));

    // Grid presets
    els.gridPresets.addEventListener('click', (e) => {
      const btn = e.target.closest('.grid-btn');
      if (!btn) return;

      if (btn.id === 'customGridBtn') {
        toggleCustomGrid();
        return;
      }

      const rows = parseInt(btn.dataset.rows, 10);
      const cols = parseInt(btn.dataset.cols, 10);
      setGrid(rows, cols);
      hideCustomGrid();
    });

    // Custom grid
    els.customApplyBtn.addEventListener('click', () => {
      const rows = parseInt(els.customRows.value, 10) || 1;
      const cols = parseInt(els.customCols.value, 10) || 1;
      setGrid(Math.min(rows, 10), Math.min(cols, 10));
    });

    // Scale mode
    els.scaleMode.addEventListener('change', () => {
      state.scaleMode = els.scaleMode.value;
      updatePreview();
    });

    // Sliders
    els.pageMargin.addEventListener('input', () => {
      state.margin = parseInt(els.pageMargin.value, 10);
      els.pageMarginVal.textContent = state.margin + 'mm';
      updatePreview();
    });

    els.cellGap.addEventListener('input', () => {
      state.gap = parseInt(els.cellGap.value, 10);
      els.cellGapVal.textContent = state.gap + 'mm';
      updatePreview();
    });

    els.borderThickness.addEventListener('input', () => {
      state.borderThickness = parseFloat(els.borderThickness.value);
      els.borderThicknessVal.textContent = state.borderThickness + (state.borderThickness > 0 ? 'mm' : '');
      updatePreview();
    });

    // Sheet navigation
    els.prevSheet.addEventListener('click', () => {
      if (state.currentSheet > 0) {
        state.currentSheet--;
        updatePreview();
      }
    });

    els.nextSheet.addEventListener('click', () => {
      const calc = gridCalc.calculate(state.grid.rows, state.grid.cols, fileManager.getPageCount());
      if (state.currentSheet < calc.sheetsRequired - 1) {
        state.currentSheet++;
        updatePreview();
      }
    });

    // Actions
    els.autoArrangeBtn.addEventListener('click', handleAutoArrange);
    els.resetBtn.addEventListener('click', handleReset);
    els.printBtn.addEventListener('click', handlePrint);
    els.downloadBtn.addEventListener('click', handleDownload);
    els.addMoreBtn.addEventListener('click', () => els.fileInput.click());
  }

  // ===== File Handling =====
  function handleFileSelect(e) {
    if (e.target.files.length) handleFiles(e.target.files);
    els.fileInput.value = '';
  }

  async function handleFiles(fileList) {
    showLoading('Processing files...');
    try {
      await fileManager.processFiles(fileList);
      if (fileManager.getPageCount() > 0) {
        showWorkspace();
        state.currentSheet = 0;
        previewRenderer.clearCache();
        updateAll();
      }
    } catch (err) {
      console.error('Error processing files:', err);
      alert('Error processing files. Please try again.');
    }
    hideLoading();
  }

  // ===== Workspace =====
  function showWorkspace() {
    els.uploadSection.style.display = 'none';
    els.workspace.style.display = 'flex';
    els.thumbStrip.style.display = 'block';
    els.bottomActions.style.display = 'flex';
  }

  // ===== Grid =====
  function setGrid(rows, cols) {
    state.grid = { rows, cols };
    state.currentSheet = 0;

    // Update active button
    $$('.grid-btn').forEach(btn => btn.classList.remove('active'));
    const matchBtn = [...$$('.grid-btn')].find(
      b => b.dataset.rows == rows && b.dataset.cols == cols
    );
    if (matchBtn) matchBtn.classList.add('active');

    updateAll();
  }

  function toggleCustomGrid() {
    const form = els.customGridForm;
    const isVisible = form.style.display !== 'none';
    if (isVisible) {
      hideCustomGrid();
    } else {
      form.style.display = 'block';
      els.customGridBtn.classList.add('active');
      $$('.grid-btn:not(.grid-btn-custom)').forEach(b => b.classList.remove('active'));
    }
  }

  function hideCustomGrid() {
    els.customGridForm.style.display = 'none';
    els.customGridBtn.classList.remove('active');
  }

  // ===== Orientation =====
  function setOrientation(orient) {
    state.orientation = orient;
    els.orientPortrait.classList.toggle('active', orient === 'portrait');
    els.orientLandscape.classList.toggle('active', orient === 'landscape');
    updatePreview();
  }

  // ===== Auto Arrange =====
  function handleAutoArrange() {
    const total = fileManager.getPageCount();
    if (total === 0) return;
    const best = gridCalc.autoArrange(total, state.paperSize, state.orientation);
    setGrid(best.rows, best.cols);
  }

  // ===== Reset =====
  function handleReset() {
    const defaults = {
      grid: { rows: 2, cols: 2 },
      paperSize: 'a4',
      orientation: 'portrait',
      margin: 10,
      gap: 4,
      borderThickness: 0,
      scaleMode: 'fit'
    };

    Object.assign(state, { ...defaults, currentSheet: 0 });

    els.paperSize.value = state.paperSize;
    els.scaleMode.value = state.scaleMode;
    els.pageMargin.value = state.margin;
    els.pageMarginVal.textContent = state.margin + 'mm';
    els.cellGap.value = state.gap;
    els.cellGapVal.textContent = state.gap + 'mm';
    els.borderThickness.value = state.borderThickness;
    els.borderThicknessVal.textContent = state.borderThickness;

    setOrientation(state.orientation);
    setGrid(state.grid.rows, state.grid.cols);
  }

  // ===== Updates =====
  function updateAll() {
    updateGridInfo();
    updateThumbStrip();
    updateSheetNav();
    updatePreview();
  }

  function updateGridInfo() {
    const { rows, cols } = state.grid;
    const ips = rows * cols;
    els.gridInfo.innerHTML = `${rows} × ${cols} = <strong>${ips}</strong> pages/sheet`;
  }

  function updateThumbStrip() {
    const pages = fileManager.getPages();
    els.thumbCount.textContent = `(${pages.length})`;

    els.thumbList.innerHTML = '';
    pages.forEach((page, idx) => {
      const item = document.createElement('div');
      item.className = 'thumb-item';
      item.draggable = true;
      item.dataset.index = idx;
      item.dataset.id = page.id;

      const canvas = document.createElement('canvas');
      canvas.width = 144;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 144, 160);

      // Draw thumbnail
      const img = new Image();
      img.onload = () => {
        const ar = img.naturalWidth / img.naturalHeight;
        let dw, dh;
        if (ar > 144 / 160) {
          dw = 144;
          dh = 144 / ar;
        } else {
          dh = 160;
          dw = 160 * ar;
        }
        ctx.drawImage(img, (144 - dw) / 2, (160 - dh) / 2, dw, dh);
      };
      img.src = page.dataUrl;

      const actions = document.createElement('div');
      actions.className = 'thumb-item-actions';
      actions.innerHTML = `
        <button class="thumb-action rotate" title="Rotate" data-action="rotate" data-id="${page.id}">↻</button>
        <button class="thumb-action delete" title="Remove" data-action="delete" data-id="${page.id}">×</button>
      `;

      const label = document.createElement('div');
      label.className = 'thumb-item-label';
      label.textContent = page.label;

      item.appendChild(canvas);
      item.appendChild(actions);
      item.appendChild(label);

      // Click actions
      actions.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target.closest('.thumb-action');
        if (!btn) return;
        const id = parseInt(btn.dataset.id, 10);
        if (btn.dataset.action === 'delete') {
          fileManager.removePage(id);
          previewRenderer.clearCache();
          updateAll();
        } else if (btn.dataset.action === 'rotate') {
          fileManager.rotatePage(id);
          previewRenderer.clearCache();
          updateAll();
        }
      });

      els.thumbList.appendChild(item);
    });

    // Re-init drag manager
    dragManager.destroy();
    dragManager = new DragManager(els.thumbList, handleReorder);
    dragManager.init();
  }

  function updateSheetNav() {
    const total = fileManager.getPageCount();
    const calc = gridCalc.calculate(state.grid.rows, state.grid.cols, total);
    const sheets = calc.sheetsRequired;

    if (state.currentSheet >= sheets) state.currentSheet = Math.max(0, sheets - 1);

    els.prevSheet.disabled = state.currentSheet <= 0;
    els.nextSheet.disabled = state.currentSheet >= sheets - 1;
    els.sheetInfo.textContent = `Sheet ${state.currentSheet + 1} / ${sheets}`;

    els.sheetStats.innerHTML = `
      <span>${total} items</span> · 
      <span>${state.grid.rows} × ${state.grid.cols}</span> · 
      <span>${calc.itemsPerSheet} / sheet</span> · 
      <span>${sheets} sheet${sheets !== 1 ? 's' : ''}</span>
    `;
  }

  async function updatePreview() {
    const pages = fileManager.getPages();
    if (pages.length === 0) return;

    const calc = gridCalc.calculate(state.grid.rows, state.grid.cols, pages.length);
    if (state.currentSheet >= calc.sheetsRequired) {
      state.currentSheet = Math.max(0, calc.sheetsRequired - 1);
    }

    await previewRenderer.render(pages, state.currentSheet, gridCalc, state);
    updateSheetNav();
    updateGridInfo();
  }

  // ===== Drag Reorder =====
  function handleReorder(fromIndex, toIndex) {
    const pages = fileManager.getPages();
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);
    fileManager.reorderPages(pages);
    previewRenderer.clearCache();
    updateAll();
  }

  // ===== Print =====
  async function handlePrint() {
    const pages = fileManager.getPages();
    if (pages.length === 0) return;
    await printManager.print(pages, gridCalc, state);
  }

  // ===== Download =====
  async function handleDownload() {
    const pages = fileManager.getPages();
    if (pages.length === 0) return;
    await downloadManager.download(
      pages, gridCalc, state, previewRenderer,
      showLoading, hideLoading
    );
  }

  // ===== Loading =====
  function showLoading(text) {
    els.loadingText.textContent = text || 'Processing...';
    els.loadingOverlay.style.display = 'flex';
  }

  function hideLoading() {
    els.loadingOverlay.style.display = 'none';
  }

  // ===== Keyboard shortcuts =====
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      els.prevSheet.click();
    } else if (e.key === 'ArrowRight') {
      els.nextSheet.click();
    }
  });

  // ===== Boot =====
  init();
})();
