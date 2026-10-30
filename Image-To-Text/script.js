(function () {
    'use strict';

    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('fileInput');
    const chooseBtn = document.getElementById('chooseBtn');
    const previewImage = document.getElementById('previewImage');
    const convertBtn = document.getElementById('convertBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');
    const outputText = document.getElementById('outputText');
    const textStats = document.getElementById('textStats');
    const summaryPeriod = document.getElementById('summaryPeriod');
    const loadingAnimation = document.getElementById('loadingAnimation');
    const loadingText = document.getElementById('loadingText');
    const inputError = document.getElementById('inputError');
    const pasteToast = document.getElementById('pasteToast');

    let currentFile = null;
    let previewUrl = null;
    let isBusy = false;
    let hasText = false;
    let errorTimeout = null;
    const copyBtnMarkup = copyBtn.innerHTML;

    function showError(message) {
        inputError.textContent = message;
        inputError.hidden = false;
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => { inputError.hidden = true; }, 6000);
    }

    function hideError() {
        inputError.hidden = true;
        clearTimeout(errorTimeout);
    }

    function updateStats(text) {
        const trimmed = text.trim();
        const characters = text.length;
        const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
        textStats.textContent = `${characters.toLocaleString()} characters · ${words.toLocaleString()} words`;
    }

    function clearResult() {
        hasText = false;
        outputText.value = '';
        updateStats('');
        copyBtn.disabled = true;
        downloadBtn.disabled = true;
        copyBtn.innerHTML = copyBtnMarkup;
    }

    function handleFile(file) {
        hideError();
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showError('That file is not an image. Choose a JPG, PNG, WebP, or BMP file.');
            return;
        }

        currentFile = file;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(file);
        previewImage.src = previewUrl;
        previewImage.hidden = false;
        fileInput.value = '';
        clearResult();
        convertBtn.disabled = false;
        summaryPeriod.textContent = `${file.name} is ready — run “Convert to text”.`;
    }

    function loadingMessage(status, progress) {
        if (status === 'loading tesseract core') return 'Loading OCR engine…';
        if (status === 'loading language traineddata') return 'Loading the English model…';
        if (status === 'initializing api') return 'Starting the OCR engine…';
        if (status === 'recognizing text') return `Extracting text… ${Math.round(progress * 100)}%`;
        return 'Extracting text…';
    }

    function convertToText() {
        if (isBusy || !currentFile) return;
        hideError();
        if (typeof Tesseract === 'undefined') {
            showError('The OCR engine could not load. Check your connection and reload the page.');
            return;
        }

        isBusy = true;
        convertBtn.disabled = true;
        loadingText.textContent = 'Extracting text…';
        loadingAnimation.classList.remove('hidden');
        clearResult();

        Tesseract.recognize(currentFile, 'eng', {
            logger: (message) => {
                if (message && message.status) {
                    loadingText.textContent = loadingMessage(message.status, message.progress || 0);
                }
            }
        }).then(({ data: { text } }) => {
            loadingAnimation.classList.add('hidden');
            isBusy = false;
            convertBtn.disabled = false;
            const cleaned = (text || '').trim();
            if (!cleaned) {
                showError('No readable text was found. Try a sharper image with clearer contrast.');
                summaryPeriod.textContent = 'No text detected in this image.';
                return;
            }
            hasText = true;
            outputText.value = cleaned;
            updateStats(cleaned);
            copyBtn.disabled = false;
            downloadBtn.disabled = false;
            summaryPeriod.textContent = `${currentFile.name} · converted on this device.`;
        }).catch((error) => {
            console.error('OCR error:', error);
            loadingAnimation.classList.add('hidden');
            isBusy = false;
            convertBtn.disabled = false;
            showError('Text extraction failed. Please try again with another image.');
        });
    }

    function copyText() {
        if (!hasText) return;
        const text = outputText.value;
        const done = () => {
            copyBtn.innerHTML = copyBtnMarkup.replace('Copy text', 'Copied');
            clearTimeout(copyBtn._timer);
            copyBtn._timer = setTimeout(() => { copyBtn.innerHTML = copyBtnMarkup; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => {
                outputText.select();
                document.execCommand('copy');
                done();
            });
        } else {
            outputText.select();
            document.execCommand('copy');
            done();
        }
    }

    function downloadText() {
        if (!hasText) return;
        const base = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '').replace(/[^\w.-]+/g, '-') : 'image';
        const blob = new Blob([outputText.value], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${base || 'image'}-text.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    dropArea.addEventListener('click', () => fileInput.click());
    chooseBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        fileInput.click();
    });
    dropArea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        handleFile(file);
    });

    dropArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropArea.classList.add('active');
    });
    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('active');
    });
    dropArea.addEventListener('drop', (event) => {
        event.preventDefault();
        dropArea.classList.remove('active');
        const file = event.dataTransfer.files[0];
        handleFile(file);
    });

    document.addEventListener('paste', (event) => {
        const items = event.clipboardData ? event.clipboardData.items : [];
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    event.preventDefault();
                    const extension = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
                    handleFile(new File([file], `pasted-image.${extension}`, { type: item.type }));
                    showPasteToast();
                    return;
                }
            }
        }
    });

    function showPasteToast() {
        inputError.hidden = true;
        pasteToast.hidden = false;
        clearTimeout(pasteToast._timer);
        pasteToast._timer = setTimeout(() => { pasteToast.hidden = true; }, 2600);
    }

    convertBtn.addEventListener('click', convertToText);
    copyBtn.addEventListener('click', copyText);
    downloadBtn.addEventListener('click', downloadText);

    updateStats('');
})();
