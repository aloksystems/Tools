(function () {
  'use strict';

  // ---------- DOM ----------
  const statusMessage = document.getElementById('statusMessage');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const chooseBtn = document.getElementById('chooseBtn');
  const uploadError = document.getElementById('upload-error');
  const fileInfo = document.getElementById('file-info');
  const infoFilename = document.getElementById('info-filename');
  const infoFormat = document.getElementById('info-format');
  const infoDimensions = document.getElementById('info-dimensions');
  const infoFilesize = document.getElementById('info-filesize');

  const presetGrid = document.getElementById('presetGrid');
  const customSizeFields = document.getElementById('custom-size-fields');
  const customWidthInput = document.getElementById('customWidth');
  const customHeightInput = document.getElementById('customHeight');
  const dpiInput = document.getElementById('dpiInput');
  const dpiChips = Array.from(document.querySelectorAll('[data-dpi]'));
  const pixelDisplay = document.getElementById('pixelDisplay');
  const physicalSizeDisplay = document.getElementById('physicalSizeDisplay');
  const pixelSizeDisplay = document.getElementById('pixelSizeDisplay');
  const dpiDisplay = document.getElementById('dpiDisplay');
  const sizeError = document.getElementById('size-error');

  const cropViewport = document.getElementById('cropViewport');
  const cropCanvas = document.getElementById('cropCanvas');
  const zoomSlider = document.getElementById('zoomSlider');
  const zoomValue = document.getElementById('zoomValue');
  const resetCropBtn = document.getElementById('resetCropBtn');
  const bgToggleGroup = document.getElementById('bgToggleGroup');
  const bgHint = document.getElementById('bgHint');

  const copyButtons = Array.from(document.querySelectorAll('.copy-btn'));
  const customCopyButton = copyButtons.find((button) => button.dataset.copies === 'custom');
  const customCopiesField = document.getElementById('custom-copies-field');
  const customCopiesInput = document.getElementById('customCopies');
  const gridColsInput = document.getElementById('gridCols');
  const gridRowsInput = document.getElementById('gridRows');
  const gridTotalHint = document.getElementById('gridTotalHint');
  const marginTopInput = document.getElementById('marginTop');
  const marginBottomInput = document.getElementById('marginBottom');
  const marginLeftInput = document.getElementById('marginLeft');
  const marginRightInput = document.getElementById('marginRight');
  const formatButtons = Array.from(document.querySelectorAll('.format-btn'));
  const qualityControl = document.getElementById('quality-control');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityValue = document.getElementById('qualityValue');

  const photoTab = document.getElementById('photoTab');
  const sheetTab = document.getElementById('sheetTab');
  const photoPanel = document.getElementById('photoPanel');
  const sheetPanel = document.getElementById('sheetPanel');
  const previewTabs = document.querySelector('.preview-tabs');
  const photoPreviewCanvas = document.getElementById('photoPreviewCanvas');
  const photoPlaceholder = document.getElementById('photoPlaceholder');
  const sheetPreviewCanvas = document.getElementById('sheetPreviewCanvas');
  const sheetPlaceholder = document.getElementById('sheetPlaceholder');
  const metaSize = document.getElementById('metaSize');
  const metaPixels = document.getElementById('metaPixels');
  const metaDpi = document.getElementById('metaDpi');
  const metaFormat = document.getElementById('metaFormat');
  const sheetMeta = document.getElementById('sheetMeta');
  const summaryNote = document.getElementById('summaryNote');

  const downloadPhotoBtn = document.getElementById('downloadPhotoBtn');
  const downloadSheetBtn = document.getElementById('downloadSheetBtn');
  const printSheetBtn = document.getElementById('printSheetBtn');
  const resetBtn = document.getElementById('resetBtn');
  const printContainer = document.getElementById('printContainer');
  const printImage = document.getElementById('printImage');

  // ---------- Constants ----------
  const MM_PER_INCH = 25.4;
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const SHEET_SPACING_MM = 5;
  const MAX_FILE_BYTES = 30 * 1024 * 1024;
  const MIN_DPI = 72;
  const MAX_DPI = 600;
  const PRESETS = {
    india: { name: 'India Passport', widthMM: 35, heightMM: 45, slug: 'india-35x45mm' },
    us2x2: { name: 'US 2 × 2 in', widthMM: 50.8, heightMM: 50.8, slug: 'us-2x2in' },
    schengen: { name: 'Schengen Visa', widthMM: 35, heightMM: 45, slug: 'schengen-35x45mm' },
    pan: { name: 'PAN Card', widthMM: 25, heightMM: 35, slug: 'pan-25x35mm' },
    square: { name: 'Square', widthMM: 35, heightMM: 35, slug: 'square-35x35mm' },
    custom: { name: 'Custom size', widthMM: null, heightMM: null, slug: 'custom' }
  };

  // ---------- State ----------
  const state = {
    uploadedImage: null,
    fileName: '',
    fileFormat: '',
    fileSizeBytes: 0,
    fileWidth: 0,
    fileHeight: 0,

    preset: 'india',
    photoWidthMM: 35,
    photoHeightMM: 45,
    photoWidthPx: 413,
    photoHeightPx: 531,
    dpi: 300,
    lastAspect: null,

    cropScale: 1,
    cropOffsetX: 0,
    cropOffsetY: 0,
    minCropScale: 1,
    canvasW: 0,
    canvasH: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartOffsetX: 0,
    dragStartOffsetY: 0,

    backgroundMode: 'original',
    sheetCopies: 8,
    sheetCols: 4,
    sheetRows: 2,
    pageMargins: { top: 10, bottom: 10, left: 10, right: 10 },
    outputFormat: 'jpg',
    jpgQuality: 90,

    processedCanvas: null,
    sheetCanvas: null
  };

  let fileRequestId = 0;
  let statusTimer = 0;
  let resizeTimer = 0;
  let sheetErrorMessage = '';

  // ---------- Utilities ----------
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toNumber(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function trimNumber(value) {
    return String(Math.round(value * 10) / 10);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function mmToPixels(mm, dpi) {
    return Math.round((mm / MM_PER_INCH) * dpi);
  }

  function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function hideError(element) {
    element.textContent = '';
    element.hidden = true;
  }

  function setStatus(message, type) {
    window.clearTimeout(statusTimer);
    statusMessage.textContent = message;
    statusMessage.className = 'status-banner' + (type === 'success' ? ' success' : type === 'error' ? ' error' : '');
    statusMessage.hidden = false;
    statusTimer = window.setTimeout(function () {
      statusMessage.hidden = true;
    }, 6000);
  }

  function clearStatus() {
    window.clearTimeout(statusTimer);
    statusMessage.hidden = true;
    statusMessage.textContent = '';
    statusMessage.className = 'status-banner';
  }

  function prettyFileFormat(file) {
    const type = (file.type || '').toLowerCase();
    if (type === 'image/jpeg' || type === 'image/jpg') return 'JPG';
    if (type === 'image/png') return 'PNG';
    if (type === 'image/webp') return 'WEBP';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'JPG';
    if (ext === 'png') return 'PNG';
    if (ext === 'webp') return 'WEBP';
    return 'IMAGE';
  }

  // ---------- Shared UI helpers ----------
  function setActiveCopyButton(activeButton) {
    copyButtons.forEach(function (button) {
      const isActive = button === activeButton;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  function syncDpiUI() {
    dpiChips.forEach(function (button) {
      const isActive = Number(button.dataset.dpi) === state.dpi;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
    dpiInput.value = String(state.dpi);
  }

  function updateMeta() {
    metaSize.textContent = trimNumber(state.photoWidthMM) + ' × ' + trimNumber(state.photoHeightMM) + ' mm';
    metaPixels.textContent = state.photoWidthPx + ' × ' + state.photoHeightPx + ' px';
    metaDpi.textContent = state.dpi + ' DPI';
    metaFormat.textContent = state.outputFormat === 'png' ? 'PNG · lossless' : 'JPG · ' + state.jpgQuality + '%';
  }

  function updateSummary() {
    if (!state.uploadedImage) {
      summaryNote.textContent = 'Add a photo to preview it here.';
      return;
    }
    summaryNote.textContent = PRESETS[state.preset].name + ' · ' +
      trimNumber(state.photoWidthMM) + ' × ' + trimNumber(state.photoHeightMM) + ' mm';
  }

  function updateFormatUI() {
    formatButtons.forEach(function (button) {
      const isActive = button.dataset.format === state.outputFormat;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
    qualityControl.hidden = state.outputFormat === 'png';
    qualityValue.textContent = state.jpgQuality + '%';
    updateMeta();
  }

  function activatePreviewTab(name, shouldFocus) {
    const isPhoto = name !== 'sheet';
    photoTab.classList.toggle('active', isPhoto);
    sheetTab.classList.toggle('active', !isPhoto);
    photoTab.setAttribute('aria-selected', isPhoto ? 'true' : 'false');
    sheetTab.setAttribute('aria-selected', isPhoto ? 'false' : 'true');
    photoTab.tabIndex = isPhoto ? 0 : -1;
    sheetTab.tabIndex = isPhoto ? -1 : 0;
    photoPanel.hidden = !isPhoto;
    sheetPanel.hidden = isPhoto;
    if (shouldFocus) {
      (isPhoto ? photoTab : sheetTab).focus();
    }
  }

  function clearPhotoPreview() {
    state.processedCanvas = null;
    photoPreviewCanvas.hidden = true;
    photoPreviewCanvas.width = 0;
    photoPreviewCanvas.height = 0;
    photoPlaceholder.hidden = false;
    downloadPhotoBtn.disabled = true;
  }

  function clearSheetPreview() {
    state.sheetCanvas = null;
    sheetPreviewCanvas.hidden = true;
    sheetPreviewCanvas.width = 0;
    sheetPreviewCanvas.height = 0;
    sheetPlaceholder.hidden = false;
    sheetMeta.textContent = 'A4 · 210 × 297 mm';
    downloadSheetBtn.disabled = true;
    printSheetBtn.disabled = true;
  }

  // ---------- Size and resolution ----------
  function updateCropViewportAspect() {
    cropViewport.style.aspectRatio = state.photoWidthMM + ' / ' + state.photoHeightMM;
  }

  function updateSizeDisplay() {
    const widthMM = state.photoWidthMM;
    const heightMM = state.photoHeightMM;
    const nextAspect = widthMM / heightMM;

    if (!Number.isFinite(widthMM) || !Number.isFinite(heightMM) || widthMM <= 0 || heightMM <= 0) {
      showError(sizeError, 'Enter positive width and height values.');
      return;
    }
    if (widthMM < 5 || heightMM < 5 || widthMM > 200 || heightMM > 200) {
      showError(sizeError, 'Photo dimensions must stay between 5 mm and 200 mm.');
      return;
    }
    if (!Number.isFinite(state.dpi) || state.dpi < MIN_DPI || state.dpi > MAX_DPI) {
      showError(sizeError, 'Resolution must be between ' + MIN_DPI + ' and ' + MAX_DPI + ' DPI.');
      return;
    }

    const widthPx = mmToPixels(widthMM, state.dpi);
    const heightPx = mmToPixels(heightMM, state.dpi);
    if (widthPx < 50 || heightPx < 50) {
      showError(sizeError, 'That output is too small. Increase the photo size or DPI.');
      return;
    }
    if (widthPx > 10000 || heightPx > 10000) {
      showError(sizeError, 'That output is too large. Reduce the photo size or DPI.');
      return;
    }

    hideError(sizeError);
    const aspectChanged = state.lastAspect !== null && Math.abs(state.lastAspect - nextAspect) > 0.000001;
    state.lastAspect = nextAspect;
    state.photoWidthPx = widthPx;
    state.photoHeightPx = heightPx;

    pixelDisplay.textContent = widthPx + ' × ' + heightPx + ' px';
    physicalSizeDisplay.textContent = trimNumber(widthMM) + ' × ' + trimNumber(heightMM) + ' mm';
    pixelSizeDisplay.textContent = widthPx + ' × ' + heightPx + ' px';
    dpiDisplay.textContent = state.dpi + ' DPI';

    updateCropViewportAspect();

    if (state.uploadedImage) {
      if (aspectChanged) {
        resetCrop();
      }
      renderCropCanvas();
      generatePreview();
    }

    updateMeta();
    updateSummary();
  }

  function selectPreset(presetKey) {
    const key = PRESETS[presetKey] ? presetKey : 'india';
    state.preset = key;

    document.querySelectorAll('.preset-btn').forEach(function (button) {
      const isActive = button.dataset.preset === key;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });

    if (key === 'custom') {
      customSizeFields.hidden = false;
      state.photoWidthMM = clamp(toNumber(customWidthInput.value, 35), 5, 200);
      state.photoHeightMM = clamp(toNumber(customHeightInput.value, 45), 5, 200);
      customWidthInput.value = trimNumber(state.photoWidthMM);
      customHeightInput.value = trimNumber(state.photoHeightMM);
    } else {
      customSizeFields.hidden = true;
      state.photoWidthMM = PRESETS[key].widthMM;
      state.photoHeightMM = PRESETS[key].heightMM;
    }

    updateSizeDisplay();
  }

  function applyCustomDimensions() {
    if (state.preset !== 'custom') return;
    state.photoWidthMM = clamp(toNumber(customWidthInput.value, state.photoWidthMM), 5, 200);
    state.photoHeightMM = clamp(toNumber(customHeightInput.value, state.photoHeightMM), 5, 200);
    customWidthInput.value = trimNumber(state.photoWidthMM);
    customHeightInput.value = trimNumber(state.photoHeightMM);
    updateSizeDisplay();
  }

  function setDpi(value) {
    state.dpi = Math.round(clamp(toNumber(value, state.dpi), MIN_DPI, MAX_DPI));
    syncDpiUI();
    updateSizeDisplay();
  }

  // ---------- Crop ----------
  function getCropCanvasSize() {
    const width = Math.max(1, Math.round(cropViewport.clientWidth));
    let height = Math.max(1, Math.round(cropViewport.clientHeight));
    if (!height) {
      height = Math.max(1, Math.round(width * state.photoHeightMM / state.photoWidthMM));
    }
    return { width: width, height: height };
  }

  function resetCrop() {
    if (!state.uploadedImage) return;
    const size = getCropCanvasSize();
    const image = state.uploadedImage;
    const imageW = image.naturalWidth || image.width;
    const imageH = image.naturalHeight || image.height;

    state.minCropScale = Math.max(size.width / imageW, size.height / imageH);
    state.cropScale = state.minCropScale;
    state.cropOffsetX = (size.width - imageW * state.cropScale) / 2;
    state.cropOffsetY = (size.height - imageH * state.cropScale) / 2;

    zoomSlider.value = '1';
    zoomValue.textContent = '1.00×';
  }

  function constrainCropOffsets() {
    if (!state.uploadedImage) return;
    const size = getCropCanvasSize();
    const image = state.uploadedImage;
    const drawnW = (image.naturalWidth || image.width) * state.cropScale;
    const drawnH = (image.naturalHeight || image.height) * state.cropScale;
    state.cropOffsetX = clamp(state.cropOffsetX, Math.min(size.width - drawnW, 0), Math.max(size.width - drawnW, 0));
    state.cropOffsetY = clamp(state.cropOffsetY, Math.min(size.height - drawnH, 0), Math.max(size.height - drawnH, 0));
  }

  function renderCropCanvas() {
    if (!state.uploadedImage) return;
    const size = getCropCanvasSize();
    if (cropCanvas.width !== size.width || cropCanvas.height !== size.height) {
      cropCanvas.width = size.width;
      cropCanvas.height = size.height;
    }
    const context = cropCanvas.getContext('2d');
    if (!context) return;

    const image = state.uploadedImage;
    state.canvasW = size.width;
    state.canvasH = size.height;

    context.clearRect(0, 0, size.width, size.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      state.cropOffsetX,
      state.cropOffsetY,
      (image.naturalWidth || image.width) * state.cropScale,
      (image.naturalHeight || image.height) * state.cropScale
    );
  }

  function getPointerPosition(event) {
    const rect = cropCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (cropCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (cropCanvas.height / rect.height)
    };
  }

  function nudgeCrop(dx, dy) {
    state.cropOffsetX += dx;
    state.cropOffsetY += dy;
    constrainCropOffsets();
    renderCropCanvas();
    generatePreview();
  }

  function handleViewportResize() {
    if (!state.uploadedImage || !state.canvasW || !state.canvasH) return;
    const size = getCropCanvasSize();
    if (size.width === state.canvasW && size.height === state.canvasH) return;

    const ratioX = size.width / state.canvasW;
    const ratioY = size.height / state.canvasH;
    if (Math.abs(ratioX - ratioY) < 0.02) {
      const ratio = ratioX;
      state.cropOffsetX *= ratio;
      state.cropOffsetY *= ratio;
      state.cropScale *= ratio;
      state.minCropScale *= ratio;
    } else {
      resetCrop();
    }
    constrainCropOffsets();
    renderCropCanvas();
    generatePreview();
  }

  // ---------- Photo processing ----------
  function applyWhiteBackground(canvas) {
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    const samplePoints = [
      [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
      [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
      [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)]
    ];
    let avgR = 0;
    let avgG = 0;
    let avgB = 0;
    samplePoints.forEach(function (point) {
      const index = (point[1] * width + point[0]) * 4;
      avgR += data[index];
      avgG += data[index + 1];
      avgB += data[index + 2];
    });
    avgR = Math.round(avgR / samplePoints.length);
    avgG = Math.round(avgG / samplePoints.length);
    avgB = Math.round(avgB / samplePoints.length);

    function colorDistance(r, g, b) {
      const dr = r - avgR;
      const dg = g - avgG;
      const db = b - avgB;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    function isBackground(index) {
      return colorDistance(data[index], data[index + 1], data[index + 2]) < 55;
    }

    const visited = new Uint8Array(width * height);
    const queue = [];
    let head = 0;

    function seed(pixel) {
      if (!visited[pixel] && isBackground(pixel * 4)) {
        visited[pixel] = 1;
        queue.push(pixel);
      }
    }

    for (let x = 0; x < width; x++) {
      seed(x);
      seed((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      seed(y * width);
      seed(y * width + (width - 1));
    }

    while (head < queue.length) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) seed(pixel - 1);
      if (x < width - 1) seed(pixel + 1);
      if (y > 0) seed(pixel - width);
      if (y < height - 1) seed(pixel + width);
    }

    const featherThreshold = 80;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        const index = pixel * 4;
        if (visited[pixel]) {
          data[index] = 255;
          data[index + 1] = 255;
          data[index + 2] = 255;
          continue;
        }
        let nearBackground = false;
        for (let dy = -2; dy <= 2 && !nearBackground; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && visited[ny * width + nx]) {
              nearBackground = true;
              break;
            }
          }
        }
        if (nearBackground) {
          const distance = colorDistance(data[index], data[index + 1], data[index + 2]);
          if (distance < featherThreshold) {
            const blend = (1 - distance / featherThreshold) * 0.7;
            data[index] = Math.round(data[index] + (255 - data[index]) * blend);
            data[index + 1] = Math.round(data[index + 1] + (255 - data[index + 1]) * blend);
            data[index + 2] = Math.round(data[index + 2] + (255 - data[index + 2]) * blend);
          }
        }
      }
    }

    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  function generateProcessedPhoto() {
    if (!state.uploadedImage) return null;
    const viewW = state.canvasW || getCropCanvasSize().width;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = state.photoWidthPx;
    exportCanvas.height = state.photoHeightPx;
    const context = exportCanvas.getContext('2d');
    if (!context) throw new Error('The browser could not create a drawing canvas.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const ratio = state.photoWidthPx / viewW;
    const image = state.uploadedImage;
    context.drawImage(
      image,
      state.cropOffsetX * ratio,
      state.cropOffsetY * ratio,
      (image.naturalWidth || image.width) * state.cropScale * ratio,
      (image.naturalHeight || image.height) * state.cropScale * ratio
    );

    if (state.backgroundMode === 'white') {
      applyWhiteBackground(exportCanvas);
    }
    return exportCanvas;
  }

  function generatePreview() {
    if (!state.uploadedImage) return;
    try {
      const processed = generateProcessedPhoto();
      if (!processed) return;
      state.processedCanvas = processed;

      photoPreviewCanvas.width = processed.width;
      photoPreviewCanvas.height = processed.height;
      const context = photoPreviewCanvas.getContext('2d');
      if (!context) throw new Error('The browser could not draw the preview.');
      context.clearRect(0, 0, processed.width, processed.height);
      context.drawImage(processed, 0, 0);
      photoPreviewCanvas.hidden = false;
      photoPlaceholder.hidden = true;
      photoPreviewCanvas.setAttribute('aria-label', 'Finished passport photo, ' + processed.width + ' by ' + processed.height + ' pixels');
      downloadPhotoBtn.disabled = false;

      updateSummary();
      generateSheetPreview();
    } catch (error) {
      setStatus('Could not render the photo preview. ' + error.message, 'error');
    }
  }

  // ---------- A4 sheet ----------
  function bestGridForCopies(count) {
    const fixed = {
      4: { cols: 2, rows: 2 },
      6: { cols: 2, rows: 3 },
      8: { cols: 4, rows: 2 },
      12: { cols: 3, rows: 4 }
    };
    if (fixed[count]) return fixed[count];

    const pageAspect = A4_WIDTH_MM / A4_HEIGHT_MM;
    let best = null;
    const firstCols = count <= 2 ? 1 : 2;
    for (let cols = firstCols; cols <= 8; cols++) {
      const rows = Math.ceil(count / cols);
      if (rows > 8) continue;
      const empty = cols * rows - count;
      const aspectDifference = Math.abs(cols / rows - pageAspect);
      const score = empty * 0.35 + aspectDifference;
      if (!best || score < best.score) {
        best = { cols: cols, rows: rows, score: score };
      }
    }
    return best ? { cols: best.cols, rows: best.rows } : { cols: 8, rows: 8 };
  }

  function updateGridHint() {
    const capacity = state.sheetCols * state.sheetRows;
    const copies = state.sheetCopies;
    gridTotalHint.textContent = capacity === copies
      ? state.sheetCols + ' × ' + state.sheetRows + ' = ' + copies + ' photos'
      : state.sheetCols + ' × ' + state.sheetRows + ' grid · ' + copies + (copies === 1 ? ' photo' : ' photos');
  }

  function syncGridFromCopies(count) {
    const grid = bestGridForCopies(count);
    state.sheetCols = grid.cols;
    state.sheetRows = grid.rows;
    gridColsInput.value = String(grid.cols);
    gridRowsInput.value = String(grid.rows);
    updateGridHint();
  }

  function syncCopySelectionToGrid() {
    const count = state.sheetCols * state.sheetRows;
    const presetButton = copyButtons.find(function (button) {
      return button.dataset.copies === String(count);
    });
    if (presetButton) {
      setActiveCopyButton(presetButton);
      customCopiesField.hidden = true;
    } else {
      setActiveCopyButton(customCopyButton);
      customCopiesField.hidden = false;
      customCopiesInput.value = String(count);
    }
  }

  function readCustomCopies() {
    const count = Math.round(clamp(toNumber(customCopiesInput.value, 8), 1, 64));
    customCopiesInput.value = String(count);
    return count;
  }

  function readMarginsFromUI() {
    state.pageMargins.top = clamp(toNumber(marginTopInput.value, 0), 0, 40);
    state.pageMargins.bottom = clamp(toNumber(marginBottomInput.value, 0), 0, 40);
    state.pageMargins.left = clamp(toNumber(marginLeftInput.value, 0), 0, 40);
    state.pageMargins.right = clamp(toNumber(marginRightInput.value, 0), 0, 40);
    marginTopInput.value = trimNumber(state.pageMargins.top);
    marginBottomInput.value = trimNumber(state.pageMargins.bottom);
    marginLeftInput.value = trimNumber(state.pageMargins.left);
    marginRightInput.value = trimNumber(state.pageMargins.right);
  }

  function generateSheetPreview() {
    const processed = state.processedCanvas;
    if (!processed) {
      clearSheetPreview();
      return;
    }

    try {
      const dpi = state.dpi;
      const sheetW = mmToPixels(A4_WIDTH_MM, dpi);
      const sheetH = mmToPixels(A4_HEIGHT_MM, dpi);
      const marginTop = mmToPixels(state.pageMargins.top, dpi);
      const marginBottom = mmToPixels(state.pageMargins.bottom, dpi);
      const marginLeft = mmToPixels(state.pageMargins.left, dpi);
      const marginRight = mmToPixels(state.pageMargins.right, dpi);
      const spacing = mmToPixels(SHEET_SPACING_MM, dpi);
      const availableW = sheetW - marginLeft - marginRight;
      const availableH = sheetH - marginTop - marginBottom;
      const cols = state.sheetCols;
      const rows = state.sheetRows;
      const copies = state.sheetCopies;

      if (availableW <= 0 || availableH <= 0) {
        throw new Error('Those page margins leave no printable area.');
      }
      if (!Number.isFinite(copies) || copies < 1 || copies > cols * rows) {
        throw new Error('Choose a valid number of photos and a grid that can hold them.');
      }

      // Keep every photo at its exact physical size instead of stretching it to fill the page.
      const photoW = processed.width;
      const photoH = processed.height;
      const usedCols = Math.min(cols, copies);
      const totalW = usedCols * photoW + (usedCols - 1) * spacing;
      const totalH = rows * photoH + (rows - 1) * spacing;
      if (totalW > availableW || totalH > availableH) {
        throw new Error(
          'At the exact ' + trimNumber(state.photoWidthMM) + ' × ' + trimNumber(state.photoHeightMM) +
          ' mm size, these photos do not fit on A4. Reduce copies, columns, rows, or margins.'
        );
      }

      const startY = marginTop;

      const sheetCanvas = document.createElement('canvas');
      sheetCanvas.width = sheetW;
      sheetCanvas.height = sheetH;
      if (!sheetCanvas.width || !sheetCanvas.height) {
        throw new Error('This DPI is too large for the browser to render. Try 300 DPI.');
      }
      const sheetContext = sheetCanvas.getContext('2d');
      if (!sheetContext) throw new Error('The browser could not create the sheet canvas.');

      sheetContext.fillStyle = '#ffffff';
      sheetContext.fillRect(0, 0, sheetW, sheetH);
      sheetContext.imageSmoothingEnabled = true;
      sheetContext.imageSmoothingQuality = 'high';
      let remaining = copies;
      for (let row = 0; row < rows && remaining > 0; row++) {
        const rowCount = Math.min(cols, remaining);
        const rowWidth = rowCount * photoW + (rowCount - 1) * spacing;
        const startX = Math.round(marginLeft + (availableW - rowWidth) / 2);
        for (let col = 0; col < rowCount; col++) {
          sheetContext.drawImage(
            processed,
            startX + col * (photoW + spacing),
            startY + row * (photoH + spacing),
            photoW,
            photoH
          );
        }
        remaining -= rowCount;
      }

      state.sheetCanvas = sheetCanvas;

      sheetPreviewCanvas.width = sheetW;
      sheetPreviewCanvas.height = sheetH;
      const previewContext = sheetPreviewCanvas.getContext('2d');
      if (!previewContext) throw new Error('The browser could not draw the sheet preview.');
      previewContext.clearRect(0, 0, sheetW, sheetH);
      previewContext.drawImage(sheetCanvas, 0, 0);

      sheetPreviewCanvas.hidden = false;
      sheetPlaceholder.hidden = true;
      sheetMeta.textContent = cols + ' × ' + rows + ' · ' + copies + (copies === 1 ? ' photo' : ' photos') + ' · ' + dpi + ' DPI';
      sheetPreviewCanvas.setAttribute('aria-label', 'A4 sheet preview with ' + copies + (copies === 1 ? ' photo' : ' photos'));
      downloadSheetBtn.disabled = false;
      printSheetBtn.disabled = false;
      if (sheetErrorMessage && statusMessage.textContent === sheetErrorMessage) {
        clearStatus();
      }
      sheetErrorMessage = '';
    } catch (error) {
      clearSheetPreview();
      sheetErrorMessage = error.message;
      setStatus(error.message, 'error');
    }
  }

  // ---------- File handling ----------
  function isSupportedFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const extensionOk = ['jpg', 'jpeg', 'png', 'webp'].indexOf(ext) !== -1;
    const typeOk = !file.type || ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].indexOf(file.type) !== -1;
    return extensionOk && typeOk;
  }

  function loadFile(file) {
    hideError(uploadError);
    if (!file) return;
    if (!isSupportedFile(file)) {
      showError(uploadError, 'Unsupported file type. Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showError(uploadError, 'That file is larger than 30 MB. Choose a smaller image.');
      return;
    }

    const requestId = ++fileRequestId;
    const reader = new FileReader();
    reader.onload = function (event) {
      if (requestId !== fileRequestId) return;
      const image = new Image();
      image.onload = function () {
        if (requestId !== fileRequestId) return;
        state.uploadedImage = image;
        state.fileName = file.name;
        state.fileFormat = prettyFileFormat(file);
        state.fileSizeBytes = file.size;
        state.fileWidth = image.naturalWidth || image.width;
        state.fileHeight = image.naturalHeight || image.height;

        infoFilename.textContent = file.name;
        infoFilename.title = file.name;
        infoFormat.textContent = state.fileFormat;
        infoDimensions.textContent = state.fileWidth + ' × ' + state.fileHeight + ' px';
        infoFilesize.textContent = formatFileSize(file.size);
        fileInfo.hidden = false;

        cropViewport.classList.remove('is-empty');
        resetCrop();
        renderCropCanvas();
        generatePreview();
        activatePreviewTab('photo');
        hideError(uploadError);
      };
      image.onerror = function () {
        if (requestId !== fileRequestId) return;
        showError(uploadError, 'That image could not be opened. Try another JPG, PNG, or WebP file.');
      };
      image.src = event.target.result;
    };
    reader.onerror = function () {
      if (requestId !== fileRequestId) return;
      showError(uploadError, 'The file could not be read. Please try again.');
    };
    reader.readAsDataURL(file);
  }

  // ---------- Download and print ----------
  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('The browser could not encode this image.'));
          }
        }, mimeType, quality);
      } catch (error) {
        reject(error);
      }
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function outputMime() {
    return state.outputFormat === 'png' ? 'image/png' : 'image/jpeg';
  }

  function outputExtension() {
    return state.outputFormat === 'png' ? 'png' : 'jpg';
  }

  function exportSlug() {
    if (state.preset !== 'custom') return PRESETS[state.preset].slug;
    return 'custom-' + trimNumber(state.photoWidthMM).replace('.', '_') + 'x' +
      trimNumber(state.photoHeightMM).replace('.', '_') + 'mm';
  }

  async function downloadPhoto() {
    if (!state.processedCanvas) {
      setStatus('Add a photo before downloading.', 'error');
      return;
    }
    const quality = state.outputFormat === 'png' ? undefined : state.jpgQuality / 100;
    const filename = 'passport-photo-' + exportSlug() + '.' + outputExtension();
    downloadPhotoBtn.disabled = true;
    try {
      const blob = await canvasToBlob(state.processedCanvas, outputMime(), quality);
      downloadBlob(blob, filename);
      setStatus('Photo downloaded as ' + filename + '.', 'success');
    } catch (error) {
      setStatus('Could not download the photo. ' + error.message, 'error');
    } finally {
      downloadPhotoBtn.disabled = !state.processedCanvas;
    }
  }

  async function downloadSheet() {
    if (!state.sheetCanvas) {
      setStatus('Add a photo before downloading a sheet.', 'error');
      return;
    }
    const quality = state.outputFormat === 'png' ? undefined : state.jpgQuality / 100;
    const filename = 'passport-sheet-a4-' + exportSlug() + '.' + outputExtension();
    downloadSheetBtn.disabled = true;
    try {
      const blob = await canvasToBlob(state.sheetCanvas, outputMime(), quality);
      downloadBlob(blob, filename);
      setStatus('A4 sheet downloaded as ' + filename + '.', 'success');
    } catch (error) {
      setStatus('Could not download the sheet. ' + error.message, 'error');
    } finally {
      downloadSheetBtn.disabled = !state.sheetCanvas;
    }
  }

  async function printSheet() {
    if (!state.sheetCanvas) {
      setStatus('Add a photo before printing.', 'error');
      return;
    }
    let printUrl = '';
    try {
      const blob = await canvasToBlob(state.sheetCanvas, 'image/jpeg', 0.95);
      printUrl = URL.createObjectURL(blob);
      printImage.onload = function () {
        window.print();
        window.setTimeout(function () {
          printContainer.hidden = true;
          URL.revokeObjectURL(printUrl);
          printUrl = '';
        }, 2000);
      };
      printImage.onerror = function () {
        printContainer.hidden = true;
        if (printUrl) {
          URL.revokeObjectURL(printUrl);
          printUrl = '';
        }
        setStatus('The sheet could not be prepared for printing. Try downloading it instead.', 'error');
      };
      printContainer.hidden = false;
      printImage.src = printUrl;
    } catch (error) {
      printContainer.hidden = true;
      if (printUrl) URL.revokeObjectURL(printUrl);
      setStatus('The sheet could not be prepared for printing. ' + error.message, 'error');
    }
  }

  // ---------- Reset ----------
  function resetEverything() {
    fileRequestId++;
    state.uploadedImage = null;
    state.fileName = '';
    state.fileFormat = '';
    state.fileSizeBytes = 0;
    state.fileWidth = 0;
    state.fileHeight = 0;
    state.cropScale = 1;
    state.cropOffsetX = 0;
    state.cropOffsetY = 0;
    state.minCropScale = 1;
    state.canvasW = 0;
    state.canvasH = 0;
    state.isDragging = false;
    state.lastAspect = null;
    state.dpi = 300;
    state.outputFormat = 'jpg';
    state.jpgQuality = 90;
    state.backgroundMode = 'original';
    state.sheetCols = 4;
    state.sheetRows = 2;
    state.sheetCopies = 8;
    state.pageMargins = { top: 10, bottom: 10, left: 10, right: 10 };

    fileInput.value = '';
    fileInfo.hidden = true;
    infoFilename.textContent = '—';
    infoFilename.removeAttribute('title');
    infoFormat.textContent = '—';
    infoDimensions.textContent = '—';
    infoFilesize.textContent = '—';
    hideError(uploadError);
    hideError(sizeError);
    clearStatus();

    cropViewport.classList.add('is-empty');
    cropViewport.classList.remove('dragging');
    cropCanvas.width = 0;
    cropCanvas.height = 0;
    resetCropBtn.blur();
    zoomSlider.value = '1';
    zoomValue.textContent = '1.00×';

    clearPhotoPreview();
    clearSheetPreview();
    activatePreviewTab('photo');

    customSizeFields.hidden = true;
    customWidthInput.value = '35';
    customHeightInput.value = '45';
    customCopiesInput.value = '8';
    customCopiesField.hidden = true;
    syncDpiUI();

    document.querySelectorAll('.bg-btn').forEach(function (button) {
      const isActive = button.dataset.bg === 'original';
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
    bgHint.textContent = 'Keeps the background from your photo.';

    setActiveCopyButton(copyButtons.find(function (button) {
      return button.dataset.copies === '8';
    }));
    gridColsInput.value = '4';
    gridRowsInput.value = '2';
    updateGridHint();
    marginTopInput.value = '10';
    marginBottomInput.value = '10';
    marginLeftInput.value = '10';
    marginRightInput.value = '10';

    qualitySlider.value = '90';
    qualityValue.textContent = '90%';
    updateFormatUI();

    printContainer.hidden = true;
    printImage.removeAttribute('src');
    downloadPhotoBtn.disabled = true;
    downloadSheetBtn.disabled = true;
    printSheetBtn.disabled = true;

    selectPreset('india');
  }

  // ---------- Events ----------
  chooseBtn.addEventListener('click', function () {
    fileInput.click();
  });

  dropZone.addEventListener('click', function () {
    fileInput.click();
  });

  dropZone.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) {
      loadFile(fileInput.files[0]);
    }
    fileInput.value = '';
  });

  dropZone.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.add('active');
  });

  dropZone.addEventListener('dragleave', function (event) {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove('active');
  });

  dropZone.addEventListener('drop', function (event) {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove('active');
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      loadFile(event.dataTransfer.files[0]);
    }
  });

  window.addEventListener('dragover', function (event) {
    event.preventDefault();
  });

  window.addEventListener('drop', function (event) {
    event.preventDefault();
  });

  document.addEventListener('paste', function (event) {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    let imageFile = null;
    if (clipboard.files && clipboard.files.length) {
      for (let i = 0; i < clipboard.files.length; i++) {
        if (clipboard.files[i].type && clipboard.files[i].type.indexOf('image/') === 0) {
          imageFile = clipboard.files[i];
          break;
        }
      }
    }
    if (!imageFile && clipboard.items) {
      for (let i = 0; i < clipboard.items.length; i++) {
        if (clipboard.items[i].type.indexOf('image/') === 0) {
          imageFile = clipboard.items[i].getAsFile();
          if (imageFile) break;
        }
      }
    }
    if (imageFile) {
      event.preventDefault();
      loadFile(imageFile);
    }
  });

  presetGrid.addEventListener('click', function (event) {
    const button = event.target.closest('.preset-btn');
    if (button) selectPreset(button.dataset.preset);
  });

  customWidthInput.addEventListener('change', applyCustomDimensions);
  customHeightInput.addEventListener('change', applyCustomDimensions);

  dpiChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      setDpi(chip.dataset.dpi);
    });
  });

  dpiInput.addEventListener('change', function () {
    setDpi(dpiInput.value);
  });

  cropViewport.addEventListener('pointerdown', function (event) {
    if (!state.uploadedImage) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    state.isDragging = true;
    cropViewport.classList.add('dragging');
    const position = getPointerPosition(event);
    state.dragStartX = position.x;
    state.dragStartY = position.y;
    state.dragStartOffsetX = state.cropOffsetX;
    state.dragStartOffsetY = state.cropOffsetY;
    try {
      cropViewport.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is an enhancement; dragging still works without it.
    }
    cropViewport.focus({ preventScroll: true });
  });

  cropViewport.addEventListener('pointermove', function (event) {
    if (!state.isDragging || !state.uploadedImage) return;
    const position = getPointerPosition(event);
    state.cropOffsetX = state.dragStartOffsetX + (position.x - state.dragStartX);
    state.cropOffsetY = state.dragStartOffsetY + (position.y - state.dragStartY);
    constrainCropOffsets();
    renderCropCanvas();
  });

  function endCropDrag(event) {
    if (!state.isDragging) return;
    state.isDragging = false;
    cropViewport.classList.remove('dragging');
    if (event && event.pointerId !== undefined) {
      try {
        cropViewport.releasePointerCapture(event.pointerId);
      } catch (error) {
        // The pointer may already be released.
      }
    }
    generatePreview();
  }

  cropViewport.addEventListener('pointerup', endCropDrag);
  cropViewport.addEventListener('pointercancel', endCropDrag);

  cropViewport.addEventListener('keydown', function (event) {
    if (!state.uploadedImage) return;
    const step = event.shiftKey ? 10 : 2;
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else if (event.key === 'ArrowUp') dy = -step;
    else if (event.key === 'ArrowDown') dy = step;
    else return;
    event.preventDefault();
    nudgeCrop(dx, dy);
  });

  zoomSlider.addEventListener('input', function () {
    if (!state.uploadedImage) return;
    const factor = clamp(toNumber(zoomSlider.value, 1), 1, 5);
    zoomValue.textContent = factor.toFixed(2) + '×';
    state.cropScale = state.minCropScale * factor;
    constrainCropOffsets();
    renderCropCanvas();
  });

  zoomSlider.addEventListener('change', function () {
    if (state.uploadedImage) generatePreview();
  });

  resetCropBtn.addEventListener('click', function () {
    if (!state.uploadedImage) return;
    resetCrop();
    renderCropCanvas();
    generatePreview();
  });

  bgToggleGroup.addEventListener('click', function (event) {
    const button = event.target.closest('.bg-btn');
    if (!button) return;
    state.backgroundMode = button.dataset.bg === 'white' ? 'white' : 'original';
    document.querySelectorAll('.bg-btn').forEach(function (item) {
      const isActive = item.dataset.bg === state.backgroundMode;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
    bgHint.textContent = state.backgroundMode === 'white'
      ? 'Samples the edges and fades similar colours to white. Best with plain backgrounds — check the preview.'
      : 'Keeps the background from your photo.';
    if (state.uploadedImage) generatePreview();
  });

  copyButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      const value = button.dataset.copies;
      if (value === 'custom') {
        customCopiesField.hidden = false;
        setActiveCopyButton(button);
        state.sheetCopies = readCustomCopies();
        syncGridFromCopies(state.sheetCopies);
      } else {
        customCopiesField.hidden = true;
        setActiveCopyButton(button);
        state.sheetCopies = Number(value);
        syncGridFromCopies(state.sheetCopies);
      }
      generateSheetPreview();
    });
  });

  customCopiesInput.addEventListener('change', function () {
    customCopiesField.hidden = false;
    setActiveCopyButton(customCopyButton);
    state.sheetCopies = readCustomCopies();
    syncGridFromCopies(state.sheetCopies);
    generateSheetPreview();
  });

  gridColsInput.addEventListener('change', function () {
    state.sheetCols = Math.round(clamp(toNumber(gridColsInput.value, 1), 1, 8));
    gridColsInput.value = String(state.sheetCols);
    state.sheetCopies = state.sheetCols * state.sheetRows;
    syncCopySelectionToGrid();
    updateGridHint();
    generateSheetPreview();
  });

  gridRowsInput.addEventListener('change', function () {
    state.sheetRows = Math.round(clamp(toNumber(gridRowsInput.value, 1), 1, 8));
    gridRowsInput.value = String(state.sheetRows);
    state.sheetCopies = state.sheetCols * state.sheetRows;
    syncCopySelectionToGrid();
    updateGridHint();
    generateSheetPreview();
  });

  [marginTopInput, marginBottomInput, marginLeftInput, marginRightInput].forEach(function (input) {
    input.addEventListener('change', function () {
      readMarginsFromUI();
      generateSheetPreview();
    });
  });

  formatButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      state.outputFormat = button.dataset.format === 'png' ? 'png' : 'jpg';
      updateFormatUI();
    });
  });

  qualitySlider.addEventListener('input', function () {
    state.jpgQuality = Math.round(clamp(toNumber(qualitySlider.value, 90), 10, 100));
    qualityValue.textContent = state.jpgQuality + '%';
    updateMeta();
  });

  photoTab.addEventListener('click', function () {
    activatePreviewTab('photo');
  });

  sheetTab.addEventListener('click', function () {
    activatePreviewTab('sheet');
  });

  previewTabs.addEventListener('keydown', function (event) {
    const tabs = [photoTab, sheetTab];
    const current = tabs.indexOf(document.activeElement);
    if (current === -1) return;
    let next = null;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    activatePreviewTab(next === 0 ? 'photo' : 'sheet', true);
  });

  downloadPhotoBtn.addEventListener('click', downloadPhoto);
  downloadSheetBtn.addEventListener('click', downloadSheet);
  printSheetBtn.addEventListener('click', printSheet);
  resetBtn.addEventListener('click', resetEverything);

  window.addEventListener('afterprint', function () {
    printContainer.hidden = true;
  });

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(handleViewportResize, 180);
  });

  // ---------- Init ----------
  syncDpiUI();
  updateFormatUI();
  updateGridHint();
  selectPreset('india');
  setActiveCopyButton(copyButtons.find(function (button) {
    return button.dataset.copies === '8';
  }));
  activatePreviewTab('photo');
})();
