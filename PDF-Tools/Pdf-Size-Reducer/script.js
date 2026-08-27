// PDF Size Reducer – Alok Systems Tools
// All processing is done locally in the browser.

(function() {
    'use strict';

    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const chooseFileBtn = document.getElementById('choose-file-btn');
    const fileInfo = document.getElementById('file-info');
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');
    const filePagesEl = document.getElementById('file-pages');
    const changeFileBtn = document.getElementById('change-file-btn');
    const uploadError = document.getElementById('upload-error');

    const presetButtons = document.querySelectorAll('.preset-btn');
    const customSizeInput = document.getElementById('custom-size');
    const sizeUnitSelect = document.getElementById('size-unit');
    const targetDisplay = document.getElementById('target-display');
    const targetDisplayText = document.getElementById('target-display-text');

    const compressionRadios = document.querySelectorAll('input[name="compression-level"]');

    const reduceBtn = document.getElementById('reduce-btn');
    const resetBtn = document.getElementById('reset-btn');

    const progressSection = document.getElementById('progress-section');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    const resultSection = document.getElementById('result-section');
    const resultOriginal = document.getElementById('result-original');
    const resultTarget = document.getElementById('result-target');
    const resultCompressed = document.getElementById('result-compressed');
    const resultReduced = document.getElementById('result-reduced');
    const resultPercent = document.getElementById('result-percent');
    const resultStatus = document.getElementById('result-status');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const resultNote = document.getElementById('result-note');
    const downloadBtn = document.getElementById('download-btn');

    // State
    let originalFile = null;
    let originalArrayBuffer = null;
    let originalSizeBytes = 0;
    let pageCount = 0;
    let targetKB = 0; // target in kilobytes
    let compressedBlob = null;
    let compressedBytes = 0;
    let isProcessing = false;

    // Utility: format bytes to human readable
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Utility: convert KB to bytes
    function kbToBytes(kb) {
        return kb * 1024;
    }

    // Utility: convert bytes to KB
    function bytesToKB(bytes) {
        return bytes / 1024;
    }

    // Utility: parse custom target input to KB
    function parseCustomTargetToKB() {
        const value = parseFloat(customSizeInput.value);
        if (isNaN(value) || value <= 0) return 0;
        const unit = sizeUnitSelect.value;
        if (unit === 'mb') return value * 1024;
        return value;
    }

    // Update target display
    function updateTargetDisplay() {
        if (targetKB > 0) {
            targetDisplay.classList.remove('hidden');
            targetDisplayText.textContent = formatBytes(kbToBytes(targetKB));
        } else {
            targetDisplay.classList.add('hidden');
        }
    }

    // Set active preset button
    function setActivePreset(button) {
        presetButtons.forEach(btn => btn.classList.remove('active'));
        if (button) button.classList.add('active');
        // If custom input is used, clear preset active
        if (button) {
            customSizeInput.value = '';
        } else {
            presetButtons.forEach(btn => btn.classList.remove('active'));
        }
    }

    // Clear all target inputs
    function clearTargetSelection() {
        targetKB = 0;
        presetButtons.forEach(btn => btn.classList.remove('active'));
        customSizeInput.value = '';
        updateTargetDisplay();
    }

    // Reset everything to initial state
    function resetAll() {
        originalFile = null;
        originalArrayBuffer = null;
        originalSizeBytes = 0;
        pageCount = 0;
        targetKB = 0;
        compressedBlob = null;
        compressedBytes = 0;
        isProcessing = false;

        fileInput.value = '';
        fileInfo.classList.add('hidden');
        uploadError.classList.add('hidden');
        clearTargetSelection();
        progressSection.classList.add('hidden');
        resultSection.classList.add('hidden');
        downloadBtn.disabled = false;
        reduceBtn.disabled = true;
        resetBtn.disabled = true;
        progressBar.style.width = '0%';
        progressText.textContent = '';
        resultOriginal.textContent = '—';
        resultTarget.textContent = '—';
        resultCompressed.textContent = '—';
        resultReduced.textContent = '—';
        resultPercent.textContent = '—';
        statusIcon.textContent = '';
        statusText.textContent = '';
        resultNote.textContent = '';
    }

    // Enable/disable reduce button based on file and target
    function updateReduceButtonState() {
        reduceBtn.disabled = !(originalFile && targetKB > 0) || isProcessing;
    }

    // Enable/disable reset button
    function updateResetButtonState() {
        resetBtn.disabled = !originalFile && !compressedBlob;
    }

    // Show error message
    function showError(message) {
        uploadError.textContent = message;
        uploadError.classList.remove('hidden');
    }

    function hideError() {
        uploadError.classList.add('hidden');
    }

    // Get compression level value
    function getCompressionLevel() {
        const selected = document.querySelector('input[name="compression-level"]:checked');
        return selected ? selected.value : 'balanced';
    }

    // Load PDF with pdf-lib and attempt compression without rasterization
    async function compressWithPdfLib(arrayBuffer, level) {
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        // Remove metadata maybe
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');
        pdfDoc.setCreationDate(new Date(0));
        pdfDoc.setModificationDate(new Date(0));

        // Try different save options to minimize size
        const optionsList = [
            { useObjectStreams: true },
            { useObjectStreams: false },
            { useObjectStreams: true, addDefaultPage: false },
            { useObjectStreams: false, addDefaultPage: false },
        ];

        let bestBytes = null;
        let bestUint8Array = null;
        for (const opts of optionsList) {
            try {
                const bytes = await pdfDoc.save(opts);
                if (!bestBytes || bytes.length < bestBytes) {
                    bestBytes = bytes.length;
                    bestUint8Array = bytes;
                }
            } catch (e) {
                // ignore
            }
        }
        return bestUint8Array;
    }

    // Rasterize pages and compress images to target size
    async function rasterizeAndCompress(arrayBuffer, targetBytes, level) {
        // Use pdf.js to get page count and render each page
        const pdfjsLib = window.pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;

        // Determine initial scale factor based on level
        let scale = level === 'maximum' ? 1.0 : level === 'strong' ? 1.5 : 2.0;
        let jpegQuality = level === 'maximum' ? 0.5 : level === 'strong' ? 0.65 : 0.8;

        let bestResult = null;
        let bestBytes = Infinity;

        for (let attempt = 0; attempt < 8; attempt++) {
            // Create a new PDF with pdf-lib
            const newPdf = await PDFLib.PDFDocument.create();

            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport: viewport }).promise;

                // Convert canvas to JPEG data URL
                const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
                const jpegImageBytes = await fetch(dataUrl).then(res => res.arrayBuffer());

                // Embed image in new PDF
                const embeddedImage = await newPdf.embedJpg(jpegImageBytes);
                const newPage = newPdf.addPage([viewport.width, viewport.height]);
                newPage.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width: viewport.width,
                    height: viewport.height,
                });
            }

            const pdfBytes = await newPdf.save({ useObjectStreams: true });
            const currentSize = pdfBytes.length;

            if (currentSize < bestBytes) {
                bestBytes = currentSize;
                bestResult = pdfBytes;
            }

            // If we've reached target or close, break
            if (currentSize <= targetBytes) {
                break;
            }

            // Adjust scale and quality for next attempt
            if (attempt % 2 === 0) {
                scale *= 0.8;
            } else {
                jpegQuality *= 0.85;
            }
            if (scale < 0.3) break;
            if (jpegQuality < 0.2) break;
        }

        return bestResult;
    }

    // Main compression function
    async function compressPDF(arrayBuffer, targetBytes, level) {
        progressText.textContent = 'Preparing PDF...';
        progressBar.style.width = '10%';

        // First try with pdf-lib only (preserving text/vector)
        progressText.textContent = 'Optimizing structure...';
        progressBar.style.width = '30%';
        let pdfLibResult;
        try {
            pdfLibResult = await compressWithPdfLib(arrayBuffer, level);
        } catch (e) {
            console.warn('pdf-lib compression failed:', e);
        }

        if (pdfLibResult && pdfLibResult.length <= targetBytes) {
            progressBar.style.width = '90%';
            return pdfLibResult;
        }

        // If still above target, rasterize if necessary
        progressText.textContent = 'Reducing pdf quality...';
        progressBar.style.width = '60%';
        let rasterResult = await rasterizeAndCompress(arrayBuffer, targetBytes, level);

        // Choose the smaller of the two results
        if (pdfLibResult && rasterResult) {
            if (pdfLibResult.length <= rasterResult.length) {
                progressBar.style.width = '90%';
                return pdfLibResult;
            } else {
                progressBar.style.width = '90%';
                return rasterResult;
            }
        } else if (rasterResult) {
            progressBar.style.width = '90%';
            return rasterResult;
        } else if (pdfLibResult) {
            progressBar.style.width = '90%';
            return pdfLibResult;
        } else {
            throw new Error('Compression failed. The PDF might be corrupted or unsupported.');
        }
    }

    // Handle file selection
    function handleFile(file) {
        hideError();

        if (!file) return;

        // Validate file type
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            showError('Please select a valid PDF file.');
            return;
        }

        // Size limit (100 MB)
        if (file.size > 100 * 1024 * 1024) {
            showError('File is too large. Maximum size is 100 MB.');
            return;
        }

        originalFile = file;
        originalSizeBytes = file.size;

        // Read file as ArrayBuffer
        const reader = new FileReader();
        reader.onload = async function(e) {
            originalArrayBuffer = e.target.result;

            // Try to get page count using pdf.js
            try {
                const pdfjsLib = window.pdfjsLib;
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                const loadingTask = pdfjsLib.getDocument({ data: originalArrayBuffer.slice(0) });
                const pdf = await loadingTask.promise;
                pageCount = pdf.numPages;
                // Check if encrypted
                if (pdf.isEncrypted) {
                    showError('This PDF is password-protected. Please remove the password and try again.');
                    return;
                }
            } catch (err) {
                console.error('PDF.js error:', err);
                showError('Unable to read PDF. The file may be corrupted or invalid.');
                return;
            }

            // Update file info display
            fileNameEl.textContent = file.name;
            fileSizeEl.textContent = formatBytes(file.size);
            filePagesEl.textContent = pageCount ? pageCount + ' pages' : 'Pages unknown';
            fileInfo.classList.remove('hidden');
            reduceBtn.disabled = false;
            updateResetButtonState();

            // If target already set, enable reduce
            updateReduceButtonState();
        };
        reader.onerror = function() {
            showError('Error reading file.');
        };
        reader.readAsArrayBuffer(file);
    }

    // Event listeners

    // Drag and drop
    dropZone.addEventListener('click', () => fileInput.click());
    chooseFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    changeFileBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Preset buttons
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const kb = parseFloat(btn.dataset.kb);
            if (!isNaN(kb)) {
                targetKB = kb;
                setActivePreset(btn);
                customSizeInput.value = '';
                updateTargetDisplay();
                updateReduceButtonState();
            }
        });
    });

    // Custom size input
    customSizeInput.addEventListener('input', () => {
        const customKB = parseCustomTargetToKB();
        if (customKB > 0) {
            targetKB = customKB;
            setActivePreset(null);
            updateTargetDisplay();
        } else {
            targetKB = 0;
            updateTargetDisplay();
        }
        updateReduceButtonState();
    });

    sizeUnitSelect.addEventListener('change', () => {
        if (customSizeInput.value) {
            const customKB = parseCustomTargetToKB();
            if (customKB > 0) {
                targetKB = customKB;
                updateTargetDisplay();
                updateReduceButtonState();
            }
        }
    });

    // Reduce button
    reduceBtn.addEventListener('click', async () => {
        if (!originalFile || !originalArrayBuffer || targetKB <= 0 || isProcessing) return;

        isProcessing = true;
        reduceBtn.disabled = true;
        resetBtn.disabled = true;
        progressSection.classList.remove('hidden');
        resultSection.classList.add('hidden');
        progressBar.style.width = '5%';

        const targetBytes = kbToBytes(targetKB);

        // Check if target is larger than original
        if (targetBytes >= originalSizeBytes) {
            progressSection.classList.add('hidden');
            resultSection.classList.remove('hidden');
            resultOriginal.textContent = formatBytes(originalSizeBytes);
            resultTarget.textContent = formatBytes(targetBytes);
            resultCompressed.textContent = formatBytes(originalSizeBytes);
            resultReduced.textContent = '0 Bytes';
            resultPercent.textContent = '0%';
            statusIcon.textContent = '⚠️';
            statusText.textContent = 'Compression unnecessary';
            resultNote.textContent = 'The target size is larger than or equal to the original PDF. No compression needed.';
            compressedBlob = new Blob([originalArrayBuffer], { type: 'application/pdf' });
            compressedBytes = originalSizeBytes;
            isProcessing = false;
            updateReduceButtonState();
            updateResetButtonState();
            return;
        }

        try {
            const compressedArrayBuffer = await compressPDF(originalArrayBuffer, targetBytes, getCompressionLevel());
            progressBar.style.width = '100%';
            compressedBytes = compressedArrayBuffer.byteLength;
            compressedBlob = new Blob([compressedArrayBuffer], { type: 'application/pdf' });

            // Update result
            resultOriginal.textContent = formatBytes(originalSizeBytes);
            resultTarget.textContent = formatBytes(targetBytes);
            resultCompressed.textContent = formatBytes(compressedBytes);
            const reducedBytes = originalSizeBytes - compressedBytes;
            resultReduced.textContent = reducedBytes > 0 ? formatBytes(reducedBytes) : '0 Bytes';
            const percent = reducedBytes > 0 ? Math.round((reducedBytes / originalSizeBytes) * 100) : 0;
            resultPercent.textContent = percent + '%';

            // Determine status
            const ratio = compressedBytes / targetBytes;
            if (compressedBytes <= targetBytes) {
                statusIcon.textContent = '✅';
                statusText.textContent = 'Target reached';
                resultNote.textContent = 'The PDF was compressed to or below the target size.';
            } else if (ratio <= 1.15) {
                statusIcon.textContent = '🔶';
                statusText.textContent = 'Very close to target';
                resultNote.textContent = 'The result is slightly above the target size, but very close.';
            } else {
                statusIcon.textContent = '❌';
                statusText.textContent = 'Target could not be reached';
                resultNote.textContent = 'Further compression would cause unacceptable quality loss. The result is the smallest reasonable size.';
            }

            resultSection.classList.remove('hidden');
            downloadBtn.disabled = false;
        } catch (err) {
            console.error(err);
            showError('Compression failed: ' + err.message);
            progressSection.classList.add('hidden');
        } finally {
            isProcessing = false;
            progressSection.classList.add('hidden');
            updateReduceButtonState();
            updateResetButtonState();
        }
    });

    // Download button
    downloadBtn.addEventListener('click', () => {
        if (!compressedBlob) return;
        const originalName = originalFile ? originalFile.name.replace(/\.pdf$/i, '') : 'document';
        const downloadName = originalName + '-compressed.pdf';
        const url = URL.createObjectURL(compressedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Reset button
    resetBtn.addEventListener('click', resetAll);

    // Initial state
    resetAll();
})();