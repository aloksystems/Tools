(function() {
    'use strict';

    // ===== DOM References =====
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const uploadOverlay = document.getElementById('uploadDragOverlay');
    const chooseBtn = document.getElementById('chooseBtn');
    const originalInfoContainer = document.getElementById('originalInfoContainer');
    const origFileName = document.getElementById('origFileName');
    const origFormat = document.getElementById('origFormat');
    const origDimensions = document.getElementById('origDimensions');
    const origFileSize = document.getElementById('origFileSize');

    const widthInput = document.getElementById('widthInput');
    const heightInput = document.getElementById('heightInput');
    const lockAspectToggle = document.getElementById('lockAspectToggle');
    const presetButtons = document.querySelectorAll('.preset-btn');
    const formatSelect = document.getElementById('formatSelect');
    const qualityGroup = document.getElementById('qualityGroup');
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');
    const settingsNote = document.getElementById('settingsNote');

    const originalPreviewContainer = document.getElementById('originalPreviewContainer');
    const originalPlaceholder = document.getElementById('originalPlaceholder');
    const originalPreviewImg = document.getElementById('originalPreviewImg');
    const originalPreviewStats = document.getElementById('originalPreviewStats');

    const resizedPreviewContainer = document.getElementById('resizedPreviewContainer');
    const resizedPlaceholder = document.getElementById('resizedPlaceholder');
    const resizedPreviewImg = document.getElementById('resizedPreviewImg');
    const resizedPreviewStats = document.getElementById('resizedPreviewStats');

    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');

    const errorBanner = document.getElementById('errorBanner');
    const errorMessage = document.getElementById('errorMessage');
    const errorCloseBtn = document.getElementById('errorCloseBtn');

    const currentYearSpan = document.getElementById('currentYear');

    // ===== State =====
    let originalFile = null;
    let originalImage = null; // HTMLImageElement
    let originalWidth = 0;
    let originalHeight = 0;
    let originalAspectRatio = 1;
    let originalObjectUrl = null; // For original preview
    let resizedBlob = null;
    let resizedPreviewUrl = null;
    let isProcessing = false;
    let resizeGeneration = 0;

    const MAX_DIMENSION = 8000;
    const MAX_PIXELS = 50000000; // 50 megapixels safety limit
    const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const FORMAT_EXTENSIONS = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };

    // ===== Helper Functions =====
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorBanner.hidden = false;
        // Auto-hide after 5 seconds
        clearTimeout(window.errorTimeout);
        window.errorTimeout = setTimeout(() => {
            errorBanner.hidden = true;
        }, 5000);
    }

    function hideError() {
        errorBanner.hidden = true;
        clearTimeout(window.errorTimeout);
    }

    function getFileExtension(mimeType) {
        return FORMAT_EXTENSIONS[mimeType] || 'img';
    }

    function generateDownloadFilename(originalName, width, height, mimeType) {
        const baseName = originalName.replace(/\.[^/.]+$/, ''); // remove extension
        const ext = getFileExtension(mimeType);
        return `${baseName}-${width}x${height}.${ext}`;
    }

    function isValidDimensions(w, h) {
        return Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= MAX_DIMENSION && h <= MAX_DIMENSION;
    }

    function checkPixelLimit(w, h) {
        return w * h <= MAX_PIXELS;
    }

    // ===== Update UI State =====
    function disableAllControls(disabled = true) {
        widthInput.disabled = disabled;
        heightInput.disabled = disabled;
        lockAspectToggle.disabled = disabled;
        formatSelect.disabled = disabled;
        qualitySlider.disabled = disabled;
        presetButtons.forEach(btn => btn.disabled = disabled);
        downloadBtn.disabled = disabled || !resizedBlob;
        if (disabled) {
            settingsNote.hidden = false;
        } else {
            settingsNote.hidden = true;
        }
    }

    function enableControls() {
        disableAllControls(false);
    }

    function resetToInitialState() {
        resizeGeneration++;
        isProcessing = false;
        // Clear file
        if (originalObjectUrl) {
            URL.revokeObjectURL(originalObjectUrl);
            originalObjectUrl = null;
        }
        if (resizedPreviewUrl) {
            URL.revokeObjectURL(resizedPreviewUrl);
            resizedPreviewUrl = null;
        }
        if (resizedBlob) {
            resizedBlob = null;
        }
        originalFile = null;
        originalImage = null;
        originalWidth = 0;
        originalHeight = 0;
        originalAspectRatio = 1;

        // Reset inputs
        fileInput.value = '';
        widthInput.value = 1920;
        heightInput.value = 1080;
        lockAspectToggle.checked = true;
        formatSelect.value = 'image/jpeg';
        qualitySlider.value = 90;
        qualityValue.textContent = '90';
        qualityGroup.style.display = 'flex'; // Ensure visible for default format
        updateQualityVisibility();

        // Clear previews
        originalPreviewImg.hidden = true;
        originalPlaceholder.hidden = false;
        resizedPreviewImg.hidden = true;
        resizedPlaceholder.hidden = false;
        originalPreviewStats.textContent = '—';
        resizedPreviewStats.textContent = '—';
        originalInfoContainer.hidden = true;
        origFileName.textContent = '—';
        origFormat.textContent = '—';
        origDimensions.textContent = '—';
        origFileSize.textContent = '—';

        // Disable controls
        disableAllControls(true);
        settingsNote.textContent = 'Upload an image to enable resize settings.';

        // Reset download button
        downloadBtn.disabled = true;
        hideError();
    }

    function updateQualityVisibility() {
        const format = formatSelect.value;
        if (format === 'image/png') {
            qualityGroup.style.display = 'none';
        } else {
            qualityGroup.style.display = 'flex';
        }
    }

    // ===== Image Loading and Processing =====
    function handleFile(file) {
        hideError();
        // Validate type
        if (!SUPPORTED_TYPES.includes(file.type)) {
            showError('Unsupported file type. Please upload JPG, PNG, or WebP.');
            return;
        }

        // Revoke any previous URLs
        resizeGeneration++;
        isProcessing = false;
        if (originalObjectUrl) URL.revokeObjectURL(originalObjectUrl);
        if (resizedPreviewUrl) URL.revokeObjectURL(resizedPreviewUrl);
        resizedPreviewUrl = null;
        resizedBlob = null;
        downloadBtn.disabled = true;

        originalFile = file;
        // Create object URL for preview
        originalObjectUrl = URL.createObjectURL(file);

        // Load image
        const img = new Image();
        img.onload = function() {
            originalImage = img;
            originalWidth = img.naturalWidth;
            originalHeight = img.naturalHeight;
            if (originalWidth === 0 || originalHeight === 0) {
                showError('Could not read image dimensions. The file may be corrupted.');
                return;
            }
            originalAspectRatio = originalWidth / originalHeight;

            // Display original info
            origFileName.textContent = file.name;
            origFormat.textContent = file.type.replace('image/', '').toUpperCase();
            origDimensions.textContent = `${originalWidth} × ${originalHeight}`;
            origFileSize.textContent = formatFileSize(file.size);
            originalInfoContainer.hidden = false;

            // Show original preview
            originalPreviewImg.src = originalObjectUrl;
            originalPreviewImg.hidden = false;
            originalPlaceholder.hidden = true;
            originalPreviewStats.textContent = `${originalWidth} × ${originalHeight} px · ${formatFileSize(file.size)}`;

            // Set initial width/height based on original but not exceed max? We'll keep original dimensions if within limits
            let initWidth = originalWidth;
            let initHeight = originalHeight;
            if (initWidth > MAX_DIMENSION || initHeight > MAX_DIMENSION) {
                const scale = Math.min(MAX_DIMENSION / initWidth, MAX_DIMENSION / initHeight);
                initWidth = Math.round(initWidth * scale);
                initHeight = Math.round(initHeight * scale);
            }
            widthInput.value = initWidth;
            heightInput.value = initHeight;
            lockAspectToggle.checked = true;

            // Enable controls
            enableControls();
            settingsNote.textContent = 'Adjust dimensions, format, and quality.';
            
            // Generate resized preview
            updateResizedPreview();
        };

        img.onerror = function() {
            showError('Failed to load image. The file may be corrupted or unsupported.');
            resetToInitialState();
        };

        img.src = originalObjectUrl;
    }

    function updateResizedPreview() {
        if (!originalImage) return;
        const w = parseInt(widthInput.value, 10);
        const h = parseInt(heightInput.value, 10);
        if (!isValidDimensions(w, h)) {
            showError('Invalid dimensions. Width and height must be positive integers up to ' + MAX_DIMENSION + '.');
            return;
        }
        if (!checkPixelLimit(w, h)) {
            showError('Requested dimensions exceed the maximum allowed pixel count of 50 million pixels.');
            return;
        }

        isProcessing = true;
        const generation = ++resizeGeneration;
        try {
            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Canvas 2D context not available.');
            }

            // Draw image resized
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(originalImage, 0, 0, w, h);

            const mimeType = formatSelect.value;
            const quality = parseInt(qualitySlider.value, 10) / 100;

            canvas.toBlob(function(blob) {
                if (generation !== resizeGeneration) return;

                if (!blob) {
                    showError('Could not generate resized image in this format. Try a different format.');
                    isProcessing = false;
                    return;
                }

                // Revoke previous resized preview URL
                if (resizedPreviewUrl) URL.revokeObjectURL(resizedPreviewUrl);
                resizedBlob = blob;
                resizedPreviewUrl = URL.createObjectURL(blob);

                // Update resized preview
                resizedPreviewImg.src = resizedPreviewUrl;
                resizedPreviewImg.hidden = false;
                resizedPlaceholder.hidden = true;
                const resizedSize = formatFileSize(blob.size);
                resizedPreviewStats.textContent = `${w} × ${h} px · ${resizedSize}`;

                // Enable download button
                downloadBtn.disabled = false;
                isProcessing = false;
            }, mimeType, quality);

        } catch (err) {
            console.error('Resize error:', err);
            showError('An error occurred while resizing the image. Please try again.');
            if (generation === resizeGeneration) {
                isProcessing = false;
            }
        }
    }

    // ===== Event Listeners =====
    function setupEventListeners() {
        // File input
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFile(e.target.files[0]);
            }
        });

        // Upload area click
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        chooseBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent double triggering
            fileInput.click();
        });

        // Drag and drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, preventDefaults, false);
        });
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        uploadArea.addEventListener('dragenter', () => {
            uploadOverlay.hidden = false;
        });
        uploadArea.addEventListener('dragover', () => {
            uploadOverlay.hidden = false;
        });
        uploadArea.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) {
                uploadOverlay.hidden = true;
            }
        });
        uploadArea.addEventListener('drop', (e) => {
            uploadOverlay.hidden = true;
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFile(files[0]);
            }
        });

        // Keyboard accessibility for upload area
        uploadArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });

        // Width/Height inputs
        widthInput.addEventListener('input', () => {
            const w = parseInt(widthInput.value, 10);
            if (isNaN(w)) return;
            if (lockAspectToggle.checked && originalAspectRatio && w > 0) {
                const newHeight = Math.round(w / originalAspectRatio);
                if (newHeight <= MAX_DIMENSION) {
                    heightInput.value = newHeight;
                }
            }
            updateResizedPreview();
        });

        heightInput.addEventListener('input', () => {
            const h = parseInt(heightInput.value, 10);
            if (isNaN(h)) return;
            if (lockAspectToggle.checked && originalAspectRatio && h > 0) {
                const newWidth = Math.round(h * originalAspectRatio);
                if (newWidth <= MAX_DIMENSION) {
                    widthInput.value = newWidth;
                }
            }
            updateResizedPreview();
        });

        // Lock aspect ratio toggle
        lockAspectToggle.addEventListener('change', () => {
            if (lockAspectToggle.checked) {
                // When turning on lock, adjust height to match current width based on original ratio
                const w = parseInt(widthInput.value, 10);
                if (w > 0) {
                    const newHeight = Math.round(w / originalAspectRatio);
                    if (newHeight <= MAX_DIMENSION) {
                        heightInput.value = newHeight;
                    }
                }
                updateResizedPreview();
            }
            // If unlocked, do nothing special; user can type freely
        });

        // Preset buttons
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const presetW = parseInt(btn.dataset.width, 10);
                const presetH = parseInt(btn.dataset.height, 10);
                widthInput.value = presetW;
                heightInput.value = presetH;
                // If aspect ratio locked, we might want to preserve ratio? But preset is exact, so we keep as set.
                updateResizedPreview();
            });
        });

        // Format select
        formatSelect.addEventListener('change', () => {
            updateQualityVisibility();
            updateResizedPreview();
        });

        // Quality slider
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value;
            updateResizedPreview();
        });

        // Download button
        downloadBtn.addEventListener('click', () => {
            if (!resizedBlob) return;
            const w = parseInt(widthInput.value, 10);
            const h = parseInt(heightInput.value, 10);
            const mimeType = formatSelect.value;
            const filename = generateDownloadFilename(originalFile.name, w, h, mimeType);
            const url = URL.createObjectURL(resizedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Revoke after a short delay to ensure download starts
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        // Reset button
        resetBtn.addEventListener('click', resetToInitialState);

        // Error close
        errorCloseBtn.addEventListener('click', hideError);
    }

    // ===== Initialize =====
    function init() {
        currentYearSpan.textContent = new Date().getFullYear();
        resetToInitialState();
        setupEventListeners();
    }

    init();
})();