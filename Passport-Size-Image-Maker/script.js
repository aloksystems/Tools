/* =============================================
   Passport Size Image Maker — JavaScript
   All processing happens locally in the browser.
   No server, no API, no external services.
   ============================================= */

(function () {
    'use strict';

    // ---------- DOM References ----------
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
    const bgToggleGroup = document.querySelector('.bg-toggle-group');
    const bgHint = document.getElementById('bgHint');

    const copiesButtons = document.querySelectorAll('.copy-btn');
    const customCopiesField = document.getElementById('custom-copies-field');
    const customCopiesInput = document.getElementById('customCopies');
    const formatButtons = document.querySelectorAll('.format-btn');
    const qualityControl = document.getElementById('quality-control');
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');

    const photoPreviewCanvas = document.getElementById('photoPreviewCanvas');
    const sheetPreviewCanvas = document.getElementById('sheetPreviewCanvas');
    const downloadPhotoBtn = document.getElementById('downloadPhotoBtn');
    const downloadSheetBtn = document.getElementById('downloadSheetBtn');
    const printSheetBtn = document.getElementById('printSheetBtn');
    const resetBtn = document.getElementById('resetBtn');
    const printContainer = document.getElementById('printContainer');
    const printImage = document.getElementById('printImage');

    // ---------- State ----------
    const state = {
        uploadedImage: null,       // HTMLImageElement
        fileName: '',
        fileFormat: '',
        fileSizeBytes: 0,
        fileWidth: 0,
        fileHeight: 0,

        preset: 'india',           // 'india' | '35x35' | '2x2' | 'custom'
        customWidthMM: 35,
        customHeightMM: 45,
        dpi: 300,
        photoWidthMM: 35,
        photoHeightMM: 45,
        photoWidthPx: 413,
        photoHeightPx: 531,

        // Crop state
        cropScale: 1,              // absolute scale relative to original image
        cropOffsetX: 0,            // absolute pixel offset in canvas space
        cropOffsetY: 0,
        minCropScale: 1,           // minimum scale to cover crop area
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartOffsetX: 0,
        dragStartOffsetY: 0,

        backgroundMode: 'original', // 'original' | 'white'
        sheetCopies: 8,
        customCopies: 8,
        outputFormat: 'jpg',
        jpgQuality: 90,

        processedPhotoCanvas: null, // final cropped (and possibly bg-removed) canvas
        sheetCanvas: null,
    };

    // ---------- Constants ----------
    const MM_PER_INCH = 25.4;
    const A4_WIDTH_MM = 210;
    const A4_HEIGHT_MM = 297;
    const SHEET_MARGIN_MM = 10;
    const SHEET_SPACING_MM = 5;
    const DISPLAY_MAX_SIZE = 420;

    // ---------- Utility Functions ----------
    function mmToPixels(mm, dpi) {
        return Math.round((mm / MM_PER_INCH) * dpi);
    }

    function pixelsToMM(px, dpi) {
        return (px / dpi) * MM_PER_INCH;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function showError(element, message) {
        element.textContent = message;
        element.hidden = false;
    }

    function hideError(element) {
        element.textContent = '';
        element.hidden = true;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    // ---------- Size Calculation ----------
    function calculatePhotoSize() {
        const widthMM = state.photoWidthMM;
        const heightMM = state.photoHeightMM;
        const dpi = state.dpi;

        if (!isFinite(widthMM) || !isFinite(heightMM) || widthMM <= 0 || heightMM <= 0) {
            throw new Error('Invalid photo dimensions. Please enter positive numbers.');
        }

        if (!isFinite(dpi) || dpi < 72 || dpi > 1200) {
            throw new Error('Invalid DPI. Please enter a value between 72 and 1200.');
        }

        state.photoWidthPx = mmToPixels(widthMM, dpi);
        state.photoHeightPx = mmToPixels(heightMM, dpi);

        if (state.photoWidthPx < 50 || state.photoHeightPx < 50) {
            throw new Error('Photo dimensions are too small. Increase the size or DPI.');
        }
        if (state.photoWidthPx > 10000 || state.photoHeightPx > 10000) {
            throw new Error('Photo dimensions are too large. Decrease the size or DPI.');
        }
    }

    function updateSizeDisplay() {
        try {
            calculatePhotoSize();
            hideError(sizeError);
            const wMM = state.photoWidthMM;
            const hMM = state.photoHeightMM;
            const wPx = state.photoWidthPx;
            const hPx = state.photoHeightPx;
            pixelDisplay.textContent = wPx + ' × ' + hPx + ' px';
            physicalSizeDisplay.textContent = wMM + ' × ' + hMM + ' mm';
            pixelSizeDisplay.textContent = wPx + ' × ' + hPx + ' px';
            dpiDisplay.textContent = state.dpi;
            updateCropViewportAspect();
            if (state.uploadedImage) {
                resetCrop();
                renderCropCanvas();
                generatePreview();
            }
        } catch (err) {
            showError(sizeError, err.message);
        }
    }

    // ---------- Preset Selection ----------
    function selectPreset(presetKey) {
        state.preset = presetKey;
        document.querySelectorAll('.preset-btn').forEach((btn) => {
            const isActive = btn.dataset.preset === presetKey;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
        });

        if (presetKey === 'custom') {
            customSizeFields.hidden = false;
            state.photoWidthMM = parseFloat(customWidthInput.value) || 35;
            state.photoHeightMM = parseFloat(customHeightInput.value) || 45;
        } else if (presetKey === 'india') {
            customSizeFields.hidden = true;
            state.photoWidthMM = 35;
            state.photoHeightMM = 45;
        } else if (presetKey === '35x35') {
            customSizeFields.hidden = true;
            state.photoWidthMM = 35;
            state.photoHeightMM = 35;
        } else if (presetKey === '2x2') {
            customSizeFields.hidden = true;
            // 2 inches = 50.8 mm
            state.photoWidthMM = Math.round(2 * MM_PER_INCH * 10) / 10;
            state.photoHeightMM = Math.round(2 * MM_PER_INCH * 10) / 10;
        }
        updateSizeDisplay();
    }

    // ---------- Crop Viewport ----------
    function updateCropViewportAspect() {
        const aspectRatio = state.photoWidthMM / state.photoHeightMM;
        // Use CSS aspect-ratio property
        cropViewport.style.aspectRatio = state.photoWidthMM + ' / ' + state.photoHeightMM;
    }

    function getCropCanvasDisplaySize() {
        const maxW = Math.min(DISPLAY_MAX_SIZE, cropViewport.clientWidth || DISPLAY_MAX_SIZE);
        const aspectRatio = state.photoWidthMM / state.photoHeightMM;
        let displayW = maxW;
        let displayH = displayW / aspectRatio;
        // Limit height too
        const maxH = Math.min(DISPLAY_MAX_SIZE * 1.4, 500);
        if (displayH > maxH) {
            displayH = maxH;
            displayW = displayH * aspectRatio;
        }
        return { width: Math.round(displayW), height: Math.round(displayH) };
    }

    function getCropCanvasSize() {
        return getCropCanvasDisplaySize();
    }

    function renderCropCanvas() {
        if (!state.uploadedImage) return;

        const canvasSize = getCropCanvasSize();
        cropCanvas.width = canvasSize.width;
        cropCanvas.height = canvasSize.height;
        cropCanvas.style.width = canvasSize.width + 'px';
        cropCanvas.style.height = canvasSize.height + 'px';
        cropCanvas.style.maxWidth = '100%';
        cropCanvas.style.maxHeight = '100%';

        const ctx = cropCanvas.getContext('2d');
        ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
        ctx.fillStyle = '#e8ebee';
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

        const img = state.uploadedImage;
        const scale = state.cropScale;
        const offsetX = state.cropOffsetX;
        const offsetY = state.cropOffsetY;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvasSize.width, canvasSize.height);
        ctx.clip();
        ctx.drawImage(img, offsetX, offsetY, img.width * scale, img.height * scale);
        ctx.restore();
    }

    function resetCrop() {
        if (!state.uploadedImage) return;
        const canvasSize = getCropCanvasSize();
        const img = state.uploadedImage;

        // Calculate cover scale
        const scaleX = canvasSize.width / img.width;
        const scaleY = canvasSize.height / img.height;
        state.minCropScale = Math.max(scaleX, scaleY);
        state.cropScale = state.minCropScale;

        // Center the image
        const drawnW = img.width * state.cropScale;
        const drawnH = img.height * state.cropScale;
        state.cropOffsetX = (canvasSize.width - drawnW) / 2;
        state.cropOffsetY = (canvasSize.height - drawnH) / 2;

        zoomSlider.value = 1;
        zoomValue.textContent = '1.00×';
    }

    function constrainCropOffsets() {
        if (!state.uploadedImage) return;
        const canvasSize = getCropCanvasSize();
        const img = state.uploadedImage;
        const drawnW = img.width * state.cropScale;
        const drawnH = img.height * state.cropScale;

        // Constrain so the crop area is always covered
        const minX = canvasSize.width - drawnW;
        const maxX = 0;
        const minY = canvasSize.height - drawnH;
        const maxY = 0;

        state.cropOffsetX = clamp(state.cropOffsetX, Math.min(minX, maxX), Math.max(minX, maxX));
        state.cropOffsetY = clamp(state.cropOffsetY, Math.min(minY, maxY), Math.max(minY, maxY));
    }

    // ---------- Image Upload ----------
    function handleFile(file) {
        hideError(uploadError);

        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        const isValidType = validTypes.includes(file.type) || validExtensions.includes(fileExt);

        if (!isValidType) {
            showError(uploadError, 'Unsupported file type. Please upload a JPG, JPEG, PNG, or WebP image.');
            return;
        }

        if (file.size > 30 * 1024 * 1024) {
            showError(uploadError, 'File is too large (over 30 MB). Please upload a smaller image.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                state.uploadedImage = img;
                state.fileName = file.name;
                state.fileFormat = (file.type || fileExt.replace('.', '')).toUpperCase();
                state.fileSizeBytes = file.size;
                state.fileWidth = img.width;
                state.fileHeight = img.height;

                // Update file info display
                infoFilename.textContent = file.name;
                infoFormat.textContent = state.fileFormat;
                infoDimensions.textContent = img.width + ' × ' + img.height + ' px';
                infoFilesize.textContent = formatFileSize(file.size);
                fileInfo.hidden = false;

                // Reset crop and render
                resetCrop();
                renderCropCanvas();
                generatePreview();
            };
            img.onerror = function () {
                showError(uploadError, 'Could not load the image. The file may be corrupted.');
            };
            img.src = e.target.result;
        };
        reader.onerror = function () {
            showError(uploadError, 'Could not read the file. Please try again.');
        };
        reader.readAsDataURL(file);
    }

    // ---------- Drag and Drop ----------
    dropZone.addEventListener('click', function (e) {
        if (e.target === chooseBtn || e.target.closest('.btn-choose')) return;
        fileInput.click();
    });

    chooseBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length > 0) {
            handleFile(fileInput.files[0]);
        }
        fileInput.value = '';
    });

    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Keyboard support for drop zone
    dropZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    // ---------- Preset Buttons ----------
    presetGrid.addEventListener('click', function (e) {
        const btn = e.target.closest('.preset-btn');
        if (btn) {
            selectPreset(btn.dataset.preset);
        }
    });

    customWidthInput.addEventListener('change', function () {
        if (state.preset === 'custom') {
            state.photoWidthMM = parseFloat(customWidthInput.value) || state.photoWidthMM;
            updateSizeDisplay();
        }
    });

    customHeightInput.addEventListener('change', function () {
        if (state.preset === 'custom') {
            state.photoHeightMM = parseFloat(customHeightInput.value) || state.photoHeightMM;
            updateSizeDisplay();
        }
    });

    dpiInput.addEventListener('change', function () {
        state.dpi = parseInt(dpiInput.value, 10) || 300;
        state.dpi = clamp(state.dpi, 72, 1200);
        dpiInput.value = state.dpi;
        updateSizeDisplay();
    });

    // ---------- Crop Interaction ----------
    function getPointerPos(e) {
        const rect = cropCanvas.getBoundingClientRect();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
        const scaleX = cropCanvas.width / rect.width;
        const scaleY = cropCanvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }

    cropViewport.addEventListener('pointerdown', function (e) {
        if (!state.uploadedImage) return;
        e.preventDefault();
        state.isDragging = true;
        cropViewport.classList.add('dragging');
        const pos = getPointerPos(e);
        state.dragStartX = pos.x;
        state.dragStartY = pos.y;
        state.dragStartOffsetX = state.cropOffsetX;
        state.dragStartOffsetY = state.cropOffsetY;
        cropViewport.setPointerCapture(e.pointerId);
    });

    cropViewport.addEventListener('pointermove', function (e) {
        if (!state.isDragging || !state.uploadedImage) return;
        e.preventDefault();
        const pos = getPointerPos(e);
        const dx = pos.x - state.dragStartX;
        const dy = pos.y - state.dragStartY;
        state.cropOffsetX = state.dragStartOffsetX + dx;
        state.cropOffsetY = state.dragStartOffsetY + dy;
        constrainCropOffsets();
        renderCropCanvas();
    });

    cropViewport.addEventListener('pointerup', function (e) {
        if (state.isDragging) {
            state.isDragging = false;
            cropViewport.classList.remove('dragging');
            generatePreview();
        }
    });

    cropViewport.addEventListener('pointercancel', function () {
        state.isDragging = false;
        cropViewport.classList.remove('dragging');
    });

    // Touch support
    cropViewport.addEventListener('touchstart', function (e) {
        if (!state.uploadedImage) return;
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('pointerdown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            pointerId: touch.identifier,
        });
        cropViewport.dispatchEvent(mouseEvent);
    }, { passive: false });

    cropViewport.addEventListener('touchmove', function (e) {
        if (!state.isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('pointermove', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            pointerId: touch.identifier,
        });
        cropViewport.dispatchEvent(mouseEvent);
    }, { passive: false });

    cropViewport.addEventListener('touchend', function (e) {
        if (state.isDragging) {
            e.preventDefault();
            const mouseEvent = new MouseEvent('pointerup', {});
            cropViewport.dispatchEvent(mouseEvent);
        }
    }, { passive: false });

    // Zoom slider
    zoomSlider.addEventListener('input', function () {
        if (!state.uploadedImage) return;
        const zoomFactor = parseFloat(zoomSlider.value);
        zoomValue.textContent = zoomFactor.toFixed(2) + '×';
        state.cropScale = state.minCropScale * zoomFactor;
        constrainCropOffsets();
        renderCropCanvas();
    });

    zoomSlider.addEventListener('change', function () {
        generatePreview();
    });

    resetCropBtn.addEventListener('click', function () {
        if (!state.uploadedImage) return;
        resetCrop();
        renderCropCanvas();
        generatePreview();
    });

    // ---------- Background Toggle ----------
    bgToggleGroup.addEventListener('click', function (e) {
        const btn = e.target.closest('.bg-btn');
        if (!btn) return;
        state.backgroundMode = btn.dataset.bg;
        document.querySelectorAll('.bg-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.bg === state.backgroundMode);
            b.setAttribute('aria-checked', b.dataset.bg === state.backgroundMode ? 'true' : 'false');
        });
        if (state.backgroundMode === 'white') {
            bgHint.textContent = 'Simple edge-based background detection. Works best with solid, uniform backgrounds.';
        } else {
            bgHint.textContent = 'White background uses simple edge-based color detection. Works best with solid-colored backgrounds.';
        }
        generatePreview();
    });

    // ---------- Sheet Copies ----------
    copiesButtons.forEach((btn) => {
        btn.addEventListener('click', function () {
            const copies = btn.dataset.copies;
            document.querySelectorAll('.copy-btn').forEach((b) => {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
            });
            if (copies === 'custom') {
                customCopiesField.hidden = false;
                state.sheetCopies = parseInt(customCopiesInput.value, 10) || 8;
            } else {
                customCopiesField.hidden = true;
                state.sheetCopies = parseInt(copies, 10);
            }
            generateSheetPreview();
        });
    });

    customCopiesInput.addEventListener('change', function () {
        state.customCopies = parseInt(customCopiesInput.value, 10) || 8;
        state.customCopies = clamp(state.customCopies, 1, 50);
        customCopiesInput.value = state.customCopies;
        if (state.sheetCopies !== 4 && state.sheetCopies !== 6 && state.sheetCopies !== 8 && state.sheetCopies !== 12) {
            state.sheetCopies = state.customCopies;
            generateSheetPreview();
        }
    });

    // ---------- Output Format ----------
    formatButtons.forEach((btn) => {
        btn.addEventListener('click', function () {
            const format = btn.dataset.format;
            document.querySelectorAll('.format-btn').forEach((b) => {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
            });
            state.outputFormat = format;
            if (format === 'png') {
                qualityControl.hidden = true;
            } else {
                qualityControl.hidden = false;
            }
            generatePreview();
            generateSheetPreview();
        });
    });

    qualitySlider.addEventListener('input', function () {
        state.jpgQuality = parseInt(qualitySlider.value, 10);
        qualityValue.textContent = state.jpgQuality;
    });

    qualitySlider.addEventListener('change', function () {
        state.jpgQuality = parseInt(qualitySlider.value, 10);
        qualityValue.textContent = state.jpgQuality;
        // Regenerate exports if needed
    });

    // ---------- White Background Processing ----------
    function applyWhiteBackground(sourceCanvas) {
        const ctx = sourceCanvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        const data = imageData.data;
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        // Sample background color from edges (average of corners and edge centers)
        const samples = [];
        const samplePoints = [
            [0, 0],
            [width - 1, 0],
            [0, height - 1],
            [width - 1, height - 1],
            [Math.floor(width / 2), 0],
            [Math.floor(width / 2), height - 1],
            [0, Math.floor(height / 2)],
            [width - 1, Math.floor(height / 2)],
        ];

        for (const [sx, sy] of samplePoints) {
            const idx = (sy * width + sx) * 4;
            samples.push([data[idx], data[idx + 1], data[idx + 2]]);
        }

        // Average the samples
        let avgR = 0,
            avgG = 0,
            avgB = 0;
        for (const s of samples) {
            avgR += s[0];
            avgG += s[1];
            avgB += s[2];
        }
        avgR = Math.round(avgR / samples.length);
        avgG = Math.round(avgG / samples.length);
        avgB = Math.round(avgB / samples.length);

        // Flood fill from edges to identify background pixels
        const visited = new Uint8Array(width * height);
        const queue = [];
        const threshold = 55;
        const featherThreshold = 80;

        function colorDistance(r, g, b, r2, g2, b2) {
            const dr = r - r2,
                dg = g - g2,
                db = b - b2;
            return Math.sqrt(dr * dr + dg * dg + db * db);
        }

        function isBackground(idx) {
            return colorDistance(data[idx], data[idx + 1], data[idx + 2], avgR, avgG, avgB) < threshold;
        }

        // Seed the queue with edge pixels that match background color
        for (let x = 0; x < width; x++) {
            const topIdx = (0 * width + x) * 4;
            const bottomIdx = ((height - 1) * width + x) * 4;
            if (isBackground(topIdx)) {
                queue.push(0 * width + x);
                visited[0 * width + x] = 1;
            }
            if (isBackground(bottomIdx)) {
                queue.push((height - 1) * width + x);
                visited[(height - 1) * width + x] = 1;
            }
        }
        for (let y = 0; y < height; y++) {
            const leftIdx = (y * width + 0) * 4;
            const rightIdx = (y * width + (width - 1)) * 4;
            if (isBackground(leftIdx)) {
                queue.push(y * width + 0);
                visited[y * width + 0] = 1;
            }
            if (isBackground(rightIdx)) {
                queue.push(y * width + (width - 1));
                visited[y * width + (width - 1)] = 1;
            }
        }

        // BFS flood fill
        while (queue.length > 0) {
            const pixel = queue.shift();
            const px = pixel % width;
            const py = Math.floor(pixel / width);
            const neighbors = [
                [px - 1, py],
                [px + 1, py],
                [px, py - 1],
                [px, py + 1],
            ];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                const nPixel = ny * width + nx;
                if (visited[nPixel]) continue;
                const nIdx = nPixel * 4;
                if (isBackground(nIdx)) {
                    visited[nPixel] = 1;
                    queue.push(nPixel);
                }
            }
        }

        // Replace background with white, with feathering at edges
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixel = y * width + x;
                const idx = pixel * 4;
                if (visited[pixel]) {
                    data[idx] = 255;
                    data[idx + 1] = 255;
                    data[idx + 2] = 255;
                } else {
                    // Check if this is a boundary pixel (near a background pixel)
                    let nearBg = false;
                    for (let dy = -2; dy <= 2 && !nearBg; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const nx = x + dx,
                                ny = y + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                if (visited[ny * width + nx]) {
                                    nearBg = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (nearBg) {
                        const dist = colorDistance(data[idx], data[idx + 1], data[idx + 2], avgR, avgG, avgB);
                        if (dist < featherThreshold) {
                            const blend = 1 - (dist / featherThreshold);
                            data[idx] = Math.round(data[idx] + (255 - data[idx]) * blend * 0.7);
                            data[idx + 1] = Math.round(data[idx + 1] + (255 - data[idx + 1]) * blend * 0.7);
                            data[idx + 2] = Math.round(data[idx + 2] + (255 - data[idx + 2]) * blend * 0.7);
                        }
                    }
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return sourceCanvas;
    }

    // ---------- Photo Generation ----------
    function generateProcessedPhoto() {
        if (!state.uploadedImage) return null;
        const canvasSize = getCropCanvasSize();
        const fullW = state.photoWidthPx;
        const fullH = state.photoHeightPx;

        const ratio = fullW / canvasSize.width; // same as fullH / canvasSize.height

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = fullW;
        exportCanvas.height = fullH;
        const ctx = exportCanvas.getContext('2d');

        // Fill with white initially
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, fullW, fullH);

        // Draw the image with the correct transform
        const img = state.uploadedImage;
        const scale = state.cropScale;
        const offsetX = state.cropOffsetX * ratio;
        const offsetY = state.cropOffsetY * ratio;

        ctx.drawImage(img, offsetX, offsetY, img.width * scale, img.height * scale);

        // Apply white background if selected
        if (state.backgroundMode === 'white') {
            applyWhiteBackground(exportCanvas);
        }

        return exportCanvas;
    }

    function generatePreview() {
        const processedCanvas = generateProcessedPhoto();
        if (!processedCanvas) return;

        state.processedPhotoCanvas = processedCanvas;

        // Display preview
        const previewMaxW = 220;
        const previewMaxH = 300;
        const aspectRatio = processedCanvas.width / processedCanvas.height;
        let previewW = previewMaxW;
        let previewH = previewW / aspectRatio;
        if (previewH > previewMaxH) {
            previewH = previewMaxH;
            previewW = previewH * aspectRatio;
        }
        photoPreviewCanvas.width = processedCanvas.width;
        photoPreviewCanvas.height = processedCanvas.height;
        photoPreviewCanvas.style.width = Math.round(previewW) + 'px';
        photoPreviewCanvas.style.height = Math.round(previewH) + 'px';
        const ctx = photoPreviewCanvas.getContext('2d');
        ctx.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
        ctx.drawImage(processedCanvas, 0, 0);

        generateSheetPreview();
    }

    // ---------- Photo Sheet Generation ----------
    function generateSheetPreview() {
        const processedCanvas = state.processedPhotoCanvas;
        if (!processedCanvas) return;

        const copies = state.sheetCopies || 8;
        const dpi = state.dpi;

        // A4 sheet pixel dimensions at current DPI
        const sheetW = mmToPixels(A4_WIDTH_MM, dpi);
        const sheetH = mmToPixels(A4_HEIGHT_MM, dpi);
        const marginPx = mmToPixels(SHEET_MARGIN_MM, dpi);
        const spacingPx = mmToPixels(SHEET_SPACING_MM, dpi);
        const photoW = processedCanvas.width;
        const photoH = processedCanvas.height;

        // Calculate grid layout
        const availableW = sheetW - 2 * marginPx;
        const availableH = sheetH - 2 * marginPx;
        const maxCols = Math.max(1, Math.floor((availableW + spacingPx) / (photoW + spacingPx)));
        const maxRows = Math.max(1, Math.floor((availableH + spacingPx) / (photoH + spacingPx)));

        let cols, rows;
        if (copies <= 4) {
            cols = Math.min(2, maxCols);
            rows = Math.ceil(copies / cols);
            if (rows > maxRows) {
                rows = maxRows;
                cols = Math.ceil(copies / rows);
            }
        } else if (copies <= 6) {
            cols = Math.min(3, maxCols);
            rows = Math.ceil(copies / cols);
            if (rows > maxRows) {
                rows = maxRows;
                cols = Math.ceil(copies / rows);
            }
        } else if (copies <= 8) {
            cols = Math.min(4, maxCols);
            rows = Math.ceil(copies / cols);
            if (rows > maxRows) {
                rows = maxRows;
                cols = Math.ceil(copies / rows);
            }
        } else if (copies <= 12) {
            cols = Math.min(4, maxCols);
            rows = Math.ceil(copies / cols);
            if (rows > maxRows) {
                rows = maxRows;
                cols = Math.ceil(copies / rows);
            }
        } else {
            // Try to fit as many as possible in a balanced grid
            cols = Math.min(maxCols, Math.ceil(Math.sqrt(copies * (availableW / availableH))));
            rows = Math.ceil(copies / cols);
            if (rows > maxRows) {
                rows = maxRows;
                cols = Math.ceil(copies / rows);
            }
            if (cols > maxCols) cols = maxCols;
        }

        // Ensure we don't exceed max
        cols = Math.min(cols, maxCols);
        rows = Math.min(rows, maxRows);

        // Calculate total grid size
        const totalW = cols * photoW + (cols - 1) * spacingPx;
        const totalH = rows * photoH + (rows - 1) * spacingPx;

        // Center the grid
        const startX = (sheetW - totalW) / 2;
        const startY = (sheetH - totalH) / 2;

        // Create sheet canvas
        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = sheetW;
        sheetCanvas.height = sheetH;
        const sheetCtx = sheetCanvas.getContext('2d');

        // White background
        sheetCtx.fillStyle = '#ffffff';
        sheetCtx.fillRect(0, 0, sheetW, sheetH);

        // Draw photos
        let drawn = 0;
        for (let r = 0; r < rows && drawn < copies; r++) {
            for (let c = 0; c < cols && drawn < copies; c++) {
                const x = startX + c * (photoW + spacingPx);
                const y = startY + r * (photoH + spacingPx);
                sheetCtx.drawImage(processedCanvas, x, y, photoW, photoH);
                drawn++;
            }
        }

        state.sheetCanvas = sheetCanvas;

        // Display scaled preview
        const sheetPreviewMaxW = 300;
        const sheetAspect = sheetH / sheetW;
        const sheetPreviewW = sheetPreviewMaxW;
        const sheetPreviewH = sheetPreviewW * sheetAspect;
        sheetPreviewCanvas.width = sheetW;
        sheetPreviewCanvas.height = sheetH;
        sheetPreviewCanvas.style.width = Math.round(sheetPreviewW) + 'px';
        sheetPreviewCanvas.style.height = Math.round(sheetPreviewH) + 'px';
        const previewCtx = sheetPreviewCanvas.getContext('2d');
        previewCtx.clearRect(0, 0, sheetW, sheetH);
        previewCtx.drawImage(sheetCanvas, 0, 0);
    }

    // ---------- Download Functions ----------
    function canvasToBlob(canvas, format, quality) {
        return new Promise((resolve, reject) => {
            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Could not generate image blob.'));
            }, mimeType, quality);
        });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    downloadPhotoBtn.addEventListener('click', async function () {
        if (!state.processedPhotoCanvas) {
            showError(uploadError, 'Please upload a photo first.');
            return;
        }
        try {
            const format = state.outputFormat;
            const quality = format === 'png' ? undefined : state.jpgQuality / 100;
            const blob = await canvasToBlob(state.processedPhotoCanvas, format, quality);
            const ext = format === 'png' ? 'png' : 'jpg';
            downloadBlob(blob, 'passport-photo.' + ext);
        } catch (err) {
            showError(uploadError, 'Could not generate download. ' + err.message);
        }
    });

    downloadSheetBtn.addEventListener('click', async function () {
        if (!state.sheetCanvas) {
            showError(uploadError, 'Please generate a photo sheet first.');
            return;
        }
        try {
            const format = state.outputFormat;
            const quality = format === 'png' ? undefined : state.jpgQuality / 100;
            const blob = await canvasToBlob(state.sheetCanvas, format, quality);
            const ext = format === 'png' ? 'png' : 'jpg';
            downloadBlob(blob, 'passport-photo-a4-sheet.' + ext);
        } catch (err) {
            showError(uploadError, 'Could not generate sheet download. ' + err.message);
        }
    });

    // ---------- Print Function ----------
    printSheetBtn.addEventListener('click', function () {
        if (!state.sheetCanvas) {
            showError(uploadError, 'Please generate a photo sheet first.');
            return;
        }
        // Convert canvas to data URL for printing
        const dataUrl = state.sheetCanvas.toDataURL('image/jpeg', 0.95);
        printImage.src = dataUrl;
        printContainer.hidden = false;
        window.print();
        // Keep print container available but hidden after print
        setTimeout(() => {
            printContainer.hidden = true;
        }, 500);
    });

    // ---------- Reset ----------
    resetBtn.addEventListener('click', function () {
        // Clear state
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
        state.isDragging = false;
        state.processedPhotoCanvas = null;
        state.sheetCanvas = null;

        // Reset UI
        fileInfo.hidden = true;
        hideError(uploadError);
        hideError(sizeError);
        cropCanvas.width = 0;
        cropCanvas.height = 0;
        cropCanvas.style.width = '0px';
        cropCanvas.style.height = '0px';
        photoPreviewCanvas.width = 0;
        photoPreviewCanvas.height = 0;
        photoPreviewCanvas.style.width = '0px';
        photoPreviewCanvas.style.height = '0px';
        sheetPreviewCanvas.width = 0;
        sheetPreviewCanvas.height = 0;
        sheetPreviewCanvas.style.width = '0px';
        sheetPreviewCanvas.style.height = '0px';
        zoomSlider.value = 1;
        zoomValue.textContent = '1.00×';

        // Reset presets to default
        selectPreset('india');
        dpiInput.value = 300;
        state.dpi = 300;

        // Reset background to original
        state.backgroundMode = 'original';
        document.querySelectorAll('.bg-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.bg === 'original');
            b.setAttribute('aria-checked', b.dataset.bg === 'original' ? 'true' : 'false');
        });

        // Reset copies to 8
        state.sheetCopies = 8;
        document.querySelectorAll('.copy-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.copies === '8');
            b.setAttribute('aria-checked', b.dataset.copies === '8' ? 'true' : 'false');
        });
        customCopiesField.hidden = true;

        // Reset format to JPG
        state.outputFormat = 'jpg';
        document.querySelectorAll('.format-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.format === 'jpg');
            b.setAttribute('aria-checked', b.dataset.format === 'jpg' ? 'true' : 'false');
        });
        qualityControl.hidden = false;
        qualitySlider.value = 90;
        qualityValue.textContent = '90';
        state.jpgQuality = 90;

        // Reset background hint
        bgHint.textContent = 'White background uses simple edge-based color detection. Works best with solid-colored backgrounds.';

        // Clear any errors
        hideError(uploadError);
        hideError(sizeError);

        updateSizeDisplay();
    });

    // ---------- Initialization ----------
    function init() {
        selectPreset('india');
        qualityControl.hidden = false;
        updateCropViewportAspect();
        updateSizeDisplay();

        // Handle window resize for crop canvas
        let resizeTimeout;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function () {
                if (state.uploadedImage) {
                    const currentZoom = parseFloat(zoomSlider.value);
                    const canvasSize = getCropCanvasSize();
                    // Recalculate min scale and adjust
                    const img = state.uploadedImage;
                    const scaleX = canvasSize.width / img.width;
                    const scaleY = canvasSize.height / img.height;
                    state.minCropScale = Math.max(scaleX, scaleY);
                    state.cropScale = state.minCropScale * currentZoom;
                    constrainCropOffsets();
                    renderCropCanvas();
                }
            }, 150);
        });
    }

    // Start
    init();
})();