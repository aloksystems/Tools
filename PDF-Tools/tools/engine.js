const CDN = {
    pdfLib: 'https://unpkg.com/@cantoo/pdf-lib@2.11.1/dist/pdf-lib.min.js',
    pdfJs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfJsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    jszip: 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js',
    html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
};

const scriptPromises = {};
const libPromises = {};

function loadScript(src) {
    if (scriptPromises[src]) return scriptPromises[src];
    scriptPromises[src] = new Promise((resolve, reject) => {
        const existing = Array.from(document.scripts).find((script) => script.src === src);
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(libraryError()), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(libraryError());
        document.head.appendChild(script);
    });
    return scriptPromises[src];
}

function libraryError() {
    const error = new Error('Could not download a processing library. Check your connection and try again.');
    error.code = 'LIBRARY_LOAD';
    return error;
}

export async function loadPdfLib() {
    if (!libPromises.pdfLib) {
        libPromises.pdfLib = loadScript(CDN.pdfLib).then(() => {
            if (!window.PDFLib) throw libraryError();
            return window.PDFLib;
        });
    }
    return libPromises.pdfLib;
}

export async function loadPdfJs() {
    if (!libPromises.pdfJs) {
        libPromises.pdfJs = loadScript(CDN.pdfJs).then(() => {
            if (!window.pdfjsLib) throw libraryError();
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfJsWorker;
            return window.pdfjsLib;
        });
    }
    return libPromises.pdfJs;
}

export async function loadJSZip() {
    if (!libPromises.jszip) {
        libPromises.jszip = loadScript(CDN.jszip).then(() => {
            if (!window.JSZip) throw libraryError();
            return window.JSZip;
        });
    }
    return libPromises.jszip;
}

export async function loadTesseract() {
    if (!libPromises.tesseract) {
        libPromises.tesseract = loadScript(CDN.tesseract).then(() => {
            if (!window.Tesseract) throw libraryError();
            return window.Tesseract;
        });
    }
    return libPromises.tesseract;
}

export async function loadHtml2Pdf() {
    if (!libPromises.html2pdf) {
        libPromises.html2pdf = loadScript(CDN.html2pdf).then(() => {
            if (!window.html2pdf) throw libraryError();
            return window.html2pdf;
        });
    }
    return libPromises.html2pdf;
}

export function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return (index === 0 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)) + ' ' + units[index];
}

export function sanitizeName(value, fallback) {
    const name = String(value || '')
        .replace(/\.pdf$/i, '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);
    return name || fallback || 'document';
}

export function readFileBytes(file) {
    if (file instanceof Uint8Array) return Promise.resolve(file);
    if (file instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(file));
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsArrayBuffer(file);
    });
}

export async function openPdf(input, password) {
    const pdfLib = await loadPdfLib();
    const bytes = await readFileBytes(input);
    const options = { updateMetadata: false };
    if (password !== undefined && password !== null) options.password = password;
    try {
        const doc = await pdfLib.PDFDocument.load(bytes, options);
        doc.__sourceBytes = bytes;
        return doc;
    } catch (error) {
        const message = String(error && error.message ? error.message : '');
        const wrapped = new Error(message);
        if (/password incorrect/i.test(message)) {
            wrapped.code = 'WRONG_PASSWORD';
            wrapped.userMessage = 'That password is not correct. Check it and try again.';
        } else if (/encrypted/i.test(message)) {
            wrapped.code = 'PASSWORD_REQUIRED';
            wrapped.userMessage = 'This PDF is password-protected. Enter its password to continue.';
        } else {
            wrapped.code = 'INVALID_PDF';
            wrapped.userMessage = 'This file could not be read as a PDF. It may be damaged or not a PDF at all.';
        }
        throw wrapped;
    }
}

export async function openPdfJs(input, password) {
    const pdfjsLib = await loadPdfJs();
    const bytes = await readFileBytes(input);
    const options = { data: bytes.slice(0) };
    if (password) options.password = password;
    try {
        return await pdfjsLib.getDocument(options).promise;
    } catch (error) {
        const name = error && error.name;
        if (name === 'PasswordException') {
            const wrapped = new Error('This PDF is password-protected.');
            wrapped.code = 'PASSWORD_REQUIRED';
            wrapped.userMessage = 'This PDF is password-protected. Enter its password to continue.';
            throw wrapped;
        }
        const wrapped = new Error(error && error.message ? error.message : 'Could not open PDF.');
        wrapped.code = 'INVALID_PDF';
        wrapped.userMessage = 'This file could not be read as a PDF. It may be damaged or not a PDF at all.';
        throw wrapped;
    }
}

export async function pdfJsPasswordOk(input, password) {
    try {
        const doc = await openPdfJs(input, password);
        const pages = doc.numPages;
        await doc.destroy();
        return { ok: true, pages };
    } catch (error) {
        return { ok: false, code: error.code };
    }
}

export function rangeToIndices(input, total) {
    const text = String(input || '').trim().toLowerCase();
    if (!text || text === 'all') return Array.from({ length: total }, (_, index) => index);
    const pages = new Set();
    text.split(',').forEach((rawPart) => {
        const part = rawPart.trim();
        if (!part) return;
        if (part === 'odd') {
            for (let page = 1; page <= total; page += 2) pages.add(page - 1);
            return;
        }
        if (part === 'even') {
            for (let page = 2; page <= total; page += 2) pages.add(page - 1);
            return;
        }
        const match = part.match(/^(\d+)?\s*-\s*(\d+)?$/);
        if (match) {
            const start = Math.max(1, Number.parseInt(match[1], 10) || 1);
            const end = Math.min(total, Number.parseInt(match[2], 10) || total);
            for (let page = start; page <= end; page += 1) pages.add(page - 1);
            return;
        }
        const page = Number.parseInt(part, 10);
        if (page >= 1 && page <= total) pages.add(page - 1);
    });
    return Array.from(pages).sort((a, b) => a - b);
}

export function indicesToRanges(indices) {
    const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
    const parts = [];
    let start = null;
    let previous = null;
    sorted.forEach((index) => {
        if (start === null) {
            start = index;
            previous = index;
            return;
        }
        if (index === previous + 1) {
            previous = index;
            return;
        }
        parts.push(start === previous ? String(start + 1) : (start + 1) + '-' + (previous + 1));
        start = index;
        previous = index;
    });
    if (start !== null) parts.push(start === previous ? String(start + 1) : (start + 1) + '-' + (previous + 1));
    return parts.join(', ');
}

export async function renderPageToCanvas(pdfDocument, pageNumber, options) {
    const settings = options || {};
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    let scale = settings.scale || 1;
    if (settings.maxWidth) scale = Math.min(scale, settings.maxWidth / baseViewport.width);
    if (settings.maxHeight) scale = Math.min(scale, settings.maxHeight / baseViewport.height);
    const viewport = page.getViewport({ scale });
    const canvas = settings.canvas || document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = settings.background || '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return { canvas, width: canvas.width, height: canvas.height, pageWidth: baseViewport.width, pageHeight: baseViewport.height };
}

export async function renderThumbnails(input, options) {
    const settings = options || {};
    const pdfjsLib = await loadPdfJs();
    const bytes = await readFileBytes(input);
    const loading = { data: bytes.slice(0) };
    if (settings.password) loading.password = settings.password;
    const doc = await pdfjsLib.getDocument(loading).promise;
    const requested = settings.pages && settings.pages.length ? settings.pages : Array.from({ length: doc.numPages }, (_, index) => index + 1);
    const thumbnails = [];
    for (let index = 0; index < requested.length; index += 1) {
        const pageNumber = requested[index];
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const scale = (settings.maxWidth || 150) / viewport.width;
        const canvas = document.createElement('canvas');
        const sized = page.getViewport({ scale });
        canvas.width = Math.max(1, Math.floor(sized.width));
        canvas.height = Math.max(1, Math.floor(sized.height));
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: sized }).promise;
        const rotation = (page.rotate || 0) % 360;
        thumbnails.push({
            page: pageNumber,
            url: canvas.toDataURL('image/jpeg', 0.78),
            width: canvas.width,
            height: canvas.height,
            rotation,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height
        });
        if (settings.onProgress) settings.onProgress(index + 1, requested.length);
        page.cleanup();
    }
    const total = doc.numPages;
    await doc.destroy();
    return { thumbnails, total };
}

export async function getPdfSummary(input, password) {
    const doc = await openPdfJs(input, password);
    const pages = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
        const page = await doc.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        pages.push({ page: number, width: viewport.width, height: viewport.height, rotation: page.rotate || 0 });
        page.cleanup();
    }
    const metadata = await doc.getMetadata().catch(() => null);
    const result = {
        pageCount: doc.numPages,
        pages,
        info: metadata && metadata.info ? metadata.info : {},
        metadata: metadata && metadata.metadata ? metadata.metadata : null
    };
    await doc.destroy();
    return result;
}

export function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type || 'image/png', quality);
    });
}

export function dataUrlToBytes(dataUrl) {
    const base64 = String(dataUrl).split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function downloadBytes(bytes, filename, type) {
    downloadBlob(new Blob([bytes], { type: type || 'application/pdf' }), filename);
}

export async function zipAndDownload(entries, filename) {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    entries.forEach((entry) => zip.file(entry.name, entry.blob ? entry.blob : entry.bytes));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    downloadBlob(blob, filename);
    return blob;
}

export function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('That image could not be loaded.'));
        if (typeof source === 'string') {
            image.src = source;
        } else {
            const url = URL.createObjectURL(source);
            image.onload = () => {
                resolve(image);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
            image.src = url;
        }
    });
}

export async function imageFileToCanvas(file, maxDimension) {
    const image = await loadImage(file);
    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;
    const limit = maxDimension || 2600;
    if (Math.max(width, height) > limit) {
        const scale = limit / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
}

export function trimCanvas(canvas, padding) {
    const context = canvas.getContext('2d');
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha > 8) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX || maxY < minY) return canvas;
    const pad = padding || 8;
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    const right = Math.min(width, maxX + pad);
    const bottom = Math.min(height, maxY + pad);
    const trimmed = document.createElement('canvas');
    trimmed.width = right - left;
    trimmed.height = bottom - top;
    trimmed.getContext('2d').drawImage(canvas, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
    return trimmed;
}

export const PAGE_SIZES = {
    a4: [595.28, 841.89],
    letter: [612, 792],
    legal: [612, 1008],
    a3: [841.89, 1190.55],
    a5: [419.53, 595.28]
};

export function mmToPt(mm) {
    return (mm * 72) / 25.4;
}

export async function buildPdfFromImages(items, options) {
    const pdfLib = await loadPdfLib();
    const settings = options || {};
    const { PDFDocument, rgb } = pdfLib;
    const doc = await PDFDocument.create();
    const background = settings.background || '#ffffff';
    const rgbColor = hexToRgb(background);
    for (const item of items) {
        const rotation = ((item.rotation || 0) % 360 + 360) % 360;
        const canvas = rotation ? rotateCanvas(item.canvas, rotation) : item.canvas;
        let pageWidth;
        let pageHeight;
        if (settings.pageSize && settings.pageSize !== 'fit') {
            const size = PAGE_SIZES[settings.pageSize] || PAGE_SIZES.a4;
            pageWidth = size[0];
            pageHeight = size[1];
            const landscape = settings.orientation === 'landscape'
                || (settings.orientation === 'auto' && canvas.width > canvas.height);
            if (landscape) [pageWidth, pageHeight] = [pageHeight, pageWidth];
        } else {
            pageWidth = (canvas.width * 72) / 96;
            pageHeight = (canvas.height * 72) / 96;
        }
        const margin = settings.margin || 0;
        const availableWidth = Math.max(1, pageWidth - margin * 2);
        const availableHeight = Math.max(1, pageHeight - margin * 2);
        const fitScale = settings.fit === 'cover'
            ? Math.max(availableWidth / canvas.width, availableHeight / canvas.height)
            : Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
        const drawWidth = canvas.width * fitScale;
        const drawHeight = canvas.height * fitScale;
        const page = doc.addPage([pageWidth, pageHeight]);
        const pageRgb = rgbColor ? rgb(rgbColor[0], rgbColor[1], rgbColor[2]) : rgb(1, 1, 1);
        page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: pageRgb });
        const imageBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', settings.quality || 0.9));
        const embedded = await doc.embedJpg(imageBytes);
        page.drawImage(embedded, {
            x: (pageWidth - drawWidth) / 2,
            y: (pageHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight
        });
    }
    return doc.save({ useObjectStreams: true });
}

export function rotateCanvas(source, degrees) {
    const rotation = ((degrees % 360) + 360) % 360;
    if (!rotation) return source;
    const canvas = document.createElement('canvas');
    const swap = rotation === 90 || rotation === 270;
    canvas.width = swap ? source.height : source.width;
    canvas.height = swap ? source.width : source.height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas;
}

export function applyFilterToCanvas(source, filter) {
    if (!filter || filter === 'none') return source;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d');
    context.filter = filter === 'gray' ? 'grayscale(1) contrast(1.1)'
        : filter === 'contrast' ? 'contrast(1.45) brightness(1.05)'
        : filter === 'bw' ? 'grayscale(1) contrast(2.2) brightness(1.08)'
        : 'none';
    context.drawImage(source, 0, 0);
    return canvas;
}

function hexToRgb(hex) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return [1, 1, 1];
    return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255];
}

export function hexColor(hex, pdfLib) {
    const rgb = hexToRgb(hex);
    return pdfLib.rgb(rgb[0], rgb[1], rgb[2]);
}

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

export function describeError(error) {
    if (!error) return 'Something went wrong. Please try again.';
    if (error.code === 'PASSWORD_REQUIRED') return 'This PDF is password-protected. Enter its password and try again.';
    if (error.code === 'WRONG_PASSWORD') return 'That password is not correct.';
    if (error.code === 'LIBRARY_LOAD') return 'Could not download a processing library. Check your connection and try again.';
    if (error.userMessage) return error.userMessage;
    return error.message || 'Something went wrong. Please try again.';
}

export function waitForUi() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
}

export { CDN };
