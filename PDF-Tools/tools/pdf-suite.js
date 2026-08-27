const PDF_LIB_URL = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';

function loadScript(src, globalName) {
    if (globalName && window[globalName]) {
        return Promise.resolve(window[globalName]);
    }
    return new Promise((resolve, reject) => {
        const existing = Array.from(document.scripts).find((script) => script.src === src);
        if (existing) {
            existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve(globalName ? window[globalName] : true);
        script.onerror = () => reject(new Error('Unable to load browser processing library.'));
        document.head.appendChild(script);
    });
}

async function getPdfLib() {
    await loadScript(PDF_LIB_URL, 'PDFLib');
    return window.PDFLib;
}

function bytesToSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

function sanitizeFilename(value, fallback) {
    return (value || fallback).replace(/[\\/:*?"<>|]+/g, '-').trim() || fallback;
}

function parsePages(value, total) {
    const input = (value || '').trim();
    if (!input) {
        return Array.from({ length: total }, (_, index) => index);
    }
    const pages = new Set();
    input.split(',').forEach((part) => {
        const section = part.trim();
        if (!section) return;
        if (section.includes('-')) {
            const [startRaw, endRaw] = section.split('-');
            const start = Math.max(1, Number.parseInt(startRaw, 10) || 1);
            const end = Math.min(total, Number.parseInt(endRaw, 10) || total);
            for (let page = start; page <= end; page += 1) pages.add(page - 1);
        } else {
            const page = Number.parseInt(section, 10);
            if (page >= 1 && page <= total) pages.add(page - 1);
        }
    });
    return Array.from(pages);
}

function makeWorkspace(panel, tool, fields, actionLabel) {
    panel.innerHTML = `
        <div class="suite-layout">
            <label class="tool-dropzone" data-dropzone>
                <i class="ti ti-upload"></i>
                <strong>Drop files here or browse</strong>
                <span data-file-summary>PDFs, images, documents, or CSV files depending on the tool.</span>
                <input class="suite-file-input" type="file" data-file-input>
            </label>
            <div class="suite-fields">${fields}</div>
            <div class="progress-track" hidden data-progress><span></span></div>
            <div class="suite-status" data-status role="status">Ready for local processing.</div>
            <div class="tool-actions">
                <button type="button" data-run>${actionLabel}</button>
                <button class="btn btn-ghost" type="button" data-clear>Clear</button>
            </div>
        </div>`;

    const input = panel.querySelector('[data-file-input]');
    const dropzone = panel.querySelector('[data-dropzone]');
    const summary = panel.querySelector('[data-file-summary]');
    const status = panel.querySelector('[data-status]');
    const progress = panel.querySelector('[data-progress]');
    const runButton = panel.querySelector('[data-run]');
    const selectedFiles = [];

    function setStatus(message, type) {
        status.textContent = message;
        status.className = `suite-status ${type ? `is-${type}` : ''}`;
        if (window.PDFStudio && window.PDFStudio.toast && type) {
            window.PDFStudio.toast(message, type);
        }
    }

    function setBusy(isBusy, message) {
        runButton.disabled = isBusy;
        progress.hidden = !isBusy;
        if (message) setStatus(message, 'loading');
    }

    function refreshSummary() {
        const files = selectedFiles.slice();
        summary.textContent = files.length ? files.map((file) => `${file.name} (${bytesToSize(file.size)})`).join(', ') : tool.description;
    }

    dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropzone.classList.remove('dragover');
        selectedFiles.splice(0, selectedFiles.length, ...Array.from(event.dataTransfer.files || []));
        refreshSummary();
    });
    input.addEventListener('change', () => {
        selectedFiles.splice(0, selectedFiles.length, ...Array.from(input.files || []));
        refreshSummary();
    });
    panel.querySelector('[data-clear]').addEventListener('click', () => {
        input.value = '';
        selectedFiles.splice(0, selectedFiles.length);
        refreshSummary();
        setStatus('Ready for local processing.');
    });

    return { input, setStatus, setBusy, panel, getFiles: () => selectedFiles.slice() };
}

async function createBlankPdf(textLines, filename) {
    const { PDFDocument, StandardFonts, rgb } = await getPdfLib();
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([595, 842]);
    let y = 790;
    textLines.forEach((line) => {
        if (y < 60) return;
        page.drawText(line.slice(0, 95), { x: 48, y, size: 11, font, color: rgb(0.08, 0.11, 0.18) });
        y -= 18;
    });
    const bytes = await pdfDoc.save();
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename);
}

async function modifyPdf(file, callback, filename) {
    const { PDFDocument } = await getPdfLib();
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    await callback(pdfDoc, window.PDFLib);
    const output = await pdfDoc.save({ useObjectStreams: true });
    downloadBlob(new Blob([output], { type: 'application/pdf' }), filename);
}

const handlers = {
    'crop-pdf': async ({ getFiles, panel, setStatus, setBusy }) => {
        const file = getFiles()[0];
        if (!file) throw new Error('Choose a PDF to crop.');
        const margin = Number(panel.querySelector('[name="margin"]').value || 24);
        setBusy(true, 'Cropping pages locally...');
        await modifyPdf(file, (pdfDoc) => {
            pdfDoc.getPages().forEach((page) => {
                const { width, height } = page.getSize();
                page.setCropBox(margin, margin, Math.max(10, width - margin * 2), Math.max(10, height - margin * 2));
            });
        }, `cropped-${sanitizeFilename(file.name, 'document.pdf')}`);
        setStatus('Cropped PDF downloaded.', 'success');
    },
    'highlight-pdf': async ({ getFiles, panel, setStatus, setBusy }) => {
        const file = getFiles()[0];
        if (!file) throw new Error('Choose a PDF to highlight.');
        const pagesValue = panel.querySelector('[name="pages"]').value;
        const text = panel.querySelector('[name="note"]').value || 'Review';
        setBusy(true, 'Adding highlights...');
        await modifyPdf(file, (pdfDoc, PDFLib) => {
            const pages = pdfDoc.getPages();
            parsePages(pagesValue, pages.length).forEach((pageIndex) => {
                const page = pages[pageIndex];
                const { width, height } = page.getSize();
                page.drawRectangle({ x: 48, y: height - 150, width: width - 96, height: 34, color: PDFLib.rgb(1, 0.9, 0.25), opacity: 0.45 });
                page.drawText(text.slice(0, 70), { x: 56, y: height - 137, size: 11, color: PDFLib.rgb(0.18, 0.13, 0.02) });
            });
        }, `highlighted-${sanitizeFilename(file.name, 'document.pdf')}`);
        setStatus('Highlighted PDF downloaded.', 'success');
    },
    'edit-pdf-text': async ({ getFiles, panel, setStatus, setBusy }) => {
        const file = getFiles()[0];
        if (!file) throw new Error('Choose a PDF to edit.');
        const replacement = panel.querySelector('[name="text"]').value.trim();
        if (!replacement) throw new Error('Enter replacement text.');
        setBusy(true, 'Applying text overlay...');
        await modifyPdf(file, (pdfDoc, PDFLib) => {
            const page = pdfDoc.getPage(0);
            const { width, height } = page.getSize();
            page.drawRectangle({ x: 42, y: height - 112, width: width - 84, height: 48, color: PDFLib.rgb(1, 1, 1), opacity: 0.92 });
            page.drawText(replacement.slice(0, 120), { x: 54, y: height - 92, size: 14, color: PDFLib.rgb(0.07, 0.09, 0.15) });
        }, `edited-${sanitizeFilename(file.name, 'document.pdf')}`);
        setStatus('Edited PDF downloaded.', 'success');
    },
    'protect-pdf': async ({ getFiles, panel, setStatus, setBusy }) => {
        const file = getFiles()[0];
        if (!file) throw new Error('Choose a PDF to protect.');
        const owner = panel.querySelector('[name="owner"]').value || 'PDF Studio';
        setBusy(true, 'Creating protected copy metadata...');
        await modifyPdf(file, (pdfDoc) => {
            pdfDoc.setAuthor(owner);
            pdfDoc.setSubject('Protected local copy. For password encryption, use a browser with WebCrypto PDF encryption support.');
            pdfDoc.setKeywords(['protected', 'local', 'pdf-studio']);
            pdfDoc.setModificationDate(new Date());
        }, `protected-${sanitizeFilename(file.name, 'document.pdf')}`);
        setStatus('Protected-copy metadata added. Native PDF password encryption is limited in current browser libraries.', 'success');
    },
    'scan-to-pdf': async ({ getFiles, setStatus, setBusy }) => {
        const files = getFiles().filter((file) => file.type.startsWith('image/'));
        if (!files.length) throw new Error('Choose one or more scan images.');
        setBusy(true, 'Building scan PDF...');
        const { PDFDocument } = await getPdfLib();
        const pdfDoc = await PDFDocument.create();
        for (const file of files) {
            const bytes = await file.arrayBuffer();
            const image = file.type.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        }
        const output = await pdfDoc.save();
        downloadBlob(new Blob([output], { type: 'application/pdf' }), 'scans.pdf');
        setStatus('Scan PDF downloaded.', 'success');
    },
    'ocr-pdf': async ({ getFiles, setStatus, setBusy }) => {
        const file = getFiles()[0];
        if (!file) throw new Error('Choose a PDF or image.');
        setBusy(true, 'Checking browser OCR support...');
        const detector = window.TextDetector ? new window.TextDetector() : null;
        if (!detector || !file.type.startsWith('image/')) {
            downloadBlob(new Blob(['OCR requires the browser TextDetector API and image input in this lightweight local workflow.'], { type: 'text/plain' }), 'ocr-result.txt');
            setStatus('OCR fallback text downloaded. This browser does not expose full local OCR for PDF pages.', 'error');
            return;
        }
        const bitmap = await createImageBitmap(file);
        const results = await detector.detect(bitmap);
        const text = results.map((item) => item.rawValue).join('\n');
        downloadBlob(new Blob([text || 'No text recognized.'], { type: 'text/plain' }), 'ocr-result.txt');
        setStatus('OCR text downloaded.', 'success');
    }
};

const fieldTemplates = {
    'crop-pdf': '<div class="tool-field"><label>Crop margin in points</label><input class="tool-input" name="margin" type="number" min="0" max="180" value="24"></div>',
    'highlight-pdf': '<div class="tool-field"><label>Pages</label><input class="tool-input" name="pages" placeholder="All pages, or 1,3-5"></div><div class="tool-field"><label>Highlight note</label><input class="tool-input" name="note" value="Review"></div>',
    'edit-pdf-text': '<div class="tool-field"><label>Replacement text overlay</label><input class="tool-input" name="text" placeholder="Approved for release"></div>',
    'protect-pdf': '<div class="tool-field"><label>Owner / author</label><input class="tool-input" name="owner" value="PDF Studio"></div>',
    'scan-to-pdf': '<p class="suite-note">Upload camera scans or images. Multi-select is supported.</p>',
    'ocr-pdf': '<p class="suite-note">Uses native browser text detection when available. Unsupported browsers receive a clear fallback file.</p>'
};

export function render(panel, context) {
    const tool = context.tool;
    const fields = fieldTemplates[tool.id] || '<p class="suite-note">This browser workflow runs locally.</p>';
    const workspace = makeWorkspace(panel, tool, fields, tool.title);
    const input = workspace.input;
    input.multiple = tool.id === 'scan-to-pdf';
    input.accept = tool.id === 'scan-to-pdf' || tool.id === 'ocr-pdf' ? 'image/*,.pdf' : '.pdf,.txt,.csv';
    panel.querySelector('[data-run]').addEventListener('click', async () => {
        try {
            await handlers[tool.id](workspace);
        } catch (error) {
            workspace.setStatus(error.message || 'Unable to complete this operation.', 'error');
        } finally {
            workspace.setBusy(false);
        }
    });
}
