import { openPdf, openPdfJs, renderPageToCanvas, dataUrlToBytes, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, checkbox, colorField, rangeField, passwordPrompt, renderResult, pageBar, note } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop the PDF you need to sign',
        hint: 'Draw, type, or upload a signature — then drag it into place',
        runLabel: 'Apply signature'
    });

    const state = {
        doc: null,
        pdfjs: null,
        pageCount: 0,
        page: 1,
        password: undefined,
        signature: null,
        placement: { x: 0.6, y: 0.72, w: 0.3 },
        pageSize: { width: 595, height: 842 },
        source: 'draw',
        allPages: false,
        addDate: false
    };

    // Signature source tabs
    const sourceTabs = segmented({
        label: 'Signature source',
        value: 'draw',
        options: [
            { value: 'draw', label: 'Draw' },
            { value: 'type', label: 'Type' },
            { value: 'upload', label: 'Upload' }
        ],
        onChange: (value) => {
            state.source = value;
            drawWrap.hidden = value !== 'draw';
            typeWrap.hidden = value !== 'type';
            uploadWrap.hidden = value !== 'upload';
            refreshSignature();
        }
    });

    // Draw
    const drawCanvas = h('canvas', { class: 'pw-signature', width: 620, height: 200, style: 'background:#fff;height:auto' });
    const drawContext = drawCanvas.getContext('2d');
    drawContext.lineWidth = 2.6;
    drawContext.lineCap = 'round';
    drawContext.lineJoin = 'round';
    const clearDraw = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Clear drawing', onclick: () => { drawContext.clearRect(0, 0, drawCanvas.width, drawCanvas.height); refreshSignature(); } });
    const drawWrap = h('div', { class: 'pw-signature-wrap' }, [
        drawCanvas,
        h('div', { class: 'pw-inline' }, [clearDraw, h('span', { class: 'pw-hint', text: 'Draw with a mouse, pen, or finger.' })])
    ]);

    // Type
    const typeText = field({ label: 'Signature text', value: '', placeholder: 'Your name' });
    const typeFont = h('select', { class: 'pw-select' }, [
        h('option', { value: '"Brush Script MT", "Segoe Script", cursive', text: 'Signature (script)' }),
        h('option', { value: 'Georgia, "Times New Roman", serif', text: 'Classic (serif)' }),
        h('option', { value: '"Segoe Print", "Comic Sans MS", cursive', text: 'Handwritten' }),
        h('option', { value: 'Helvetica, Arial, sans-serif', text: 'Clean (sans)' })
    ]);
    const typeColor = colorField({ label: 'Signature colour', value: '#111827' });
    const typePreview = h('canvas', { class: 'pw-signature', width: 620, height: 170, style: 'background:#fff;height:auto', hidden: true });
    const typeWrap = h('div', { class: 'pw-signature-wrap', hidden: true }, [
        typeText,
        h('div', { class: 'pw-grid' }, [field({ label: 'Style', control: typeFont }), typeColor]),
        typePreview
    ]);

    // Upload
    const uploadInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
    const uploadLabel = h('span', { class: 'pw-hint', text: 'Use a transparent PNG for the cleanest result.' });
    const uploadButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost', text: 'Choose signature image', onclick: () => uploadInput.click() });
    const uploadPreview = h('canvas', { class: 'pw-signature', width: 620, height: 170, style: 'background:#fff;height:auto', hidden: true });
    const uploadWrap = h('div', { class: 'pw-signature-wrap', hidden: true }, [h('div', { class: 'pw-inline' }, [uploadButton, uploadLabel]), uploadInput, uploadPreview]);
    let uploadedImage = null;

    const signatureColor = colorField({ label: 'Ink colour', value: '#111827' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: '1. Create a signature' }), h('span', { text: 'Transparent background' })]),
        sourceTabs,
        drawWrap,
        typeWrap,
        uploadWrap,
        signatureColor,
        note('The signature is embedded as an image. Your PDF and signature never leave this browser.')
    ]));

    // Placement
    const pageNav = pageBar((page) => {
        state.page = page;
        renderPreview();
    });
    const canvasWrap = h('div', { class: 'pw-canvas-wrap' });
    const preview = h('div', { class: 'pw-preview' }, [h('div', { class: 'pw-empty', text: 'Add a PDF to place your signature.' })]);
    const widthSlider = rangeField({ label: 'Signature width', value: 30, min: 10, max: 70, suffix: '%', onInput: (value) => {
        state.placement.w = Number(value) / 100;
        clampPlacement();
        positionOverlay();
    } });
    const allPages = checkbox({ label: 'Apply to every page at the same position' });
    const addDate = checkbox({ label: 'Add today’s date under the signature' });
    const outputName = field({ label: 'Output file name', value: 'signed' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: '2. Place it on the page' }), h('span', { text: 'Drag the signature to move it' })]),
        pageNav.root,
        preview,
        h('div', { class: 'pw-grid' }, [widthSlider, outputName]),
        allPages,
        addDate,
        note('Drag the signature box or its corner handle. Applying to every page uses this exact relative position.')
    ]));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    // Build signature overlay inside canvas wrap
    let overlay = null;

    ws.onFiles(async (file) => {
        state.password = undefined;
        state.signature = null;
        await load();
    });

    async function load() {
        ws.setReady(false);
        preview.innerHTML = '';
        preview.appendChild(h('div', { class: 'pw-empty', text: 'Reading pages…' }));
        try {
            state.doc = await openPdf(ws.file, state.password);
            state.pdfjs = await openPdfJs(ws.file, state.password);
            state.pageCount = state.pdfjs.numPages;
            state.page = Math.min(state.page, state.pageCount) || 1;
            pageNav.set(state.pageCount, state.page);
            passwordBox.hide();
            await renderPreview();
            ws.setStatus('');
            refreshSignature();
        } catch (error) {
            state.doc = null;
            state.pdfjs = null;
            preview.innerHTML = '';
            preview.appendChild(h('div', { class: 'pw-empty', text: error.code === 'PASSWORD_REQUIRED' ? 'This PDF is password-protected. Enter its password to continue.' : describeError(error) }));
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        }
    }

    async function renderPreview() {
        if (!state.pdfjs) return;
        const canvas = document.createElement('canvas');
        const rendered = await renderPageToCanvas(state.pdfjs, state.page, { maxWidth: 680, canvas });
        state.pageSize = { width: rendered.pageWidth, height: rendered.pageHeight };
        canvasWrap.innerHTML = '';
        canvasWrap.appendChild(canvas);
        overlay = h('div', { class: 'pw-sigbox', tabindex: '0', 'aria-label': 'Signature placement' }, [
            h('img', { alt: 'Signature preview', draggable: 'false' }),
            h('span', { class: 'pw-sigbox__handle', title: 'Resize signature' })
        ]);
        canvasWrap.appendChild(overlay);
        preview.innerHTML = '';
        preview.appendChild(canvasWrap);
        attachOverlayEvents();
        positionOverlay();
        refreshSignature();
    }

    function attachOverlayEvents() {
        if (!overlay) return;
        const handle = overlay.querySelector('.pw-sigbox__handle');
        let mode = null;
        let start = null;
        overlay.addEventListener('pointerdown', (event) => {
            if (event.target === handle) return;
            mode = 'move';
            start = { x: event.clientX, y: event.clientY, left: state.placement.x, top: state.placement.y };
            overlay.setPointerCapture(event.pointerId);
            overlay.classList.add('is-dragging');
            event.preventDefault();
        });
        handle.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            mode = 'resize';
            start = { x: event.clientX, width: state.placement.w };
            overlay.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        overlay.addEventListener('pointermove', (event) => {
            if (!mode || !start) return;
            const rect = canvasWrap.getBoundingClientRect();
            if (mode === 'move') {
                state.placement.x = start.left + (event.clientX - start.x) / rect.width;
                state.placement.y = start.top + (event.clientY - start.y) / rect.height;
            } else {
                state.placement.w = start.width + (event.clientX - start.x) / rect.width;
            }
            clampPlacement();
            positionOverlay();
        });
        const end = () => {
            mode = null;
            start = null;
            if (overlay) overlay.classList.remove('is-dragging');
            if (overlay) overlay.querySelector('img').style.opacity = '';
        };
        overlay.addEventListener('pointerup', end);
        overlay.addEventListener('pointercancel', end);
        overlay.addEventListener('keydown', (event) => {
            const step = event.shiftKey ? 0.02 : 0.005;
            if (event.key === 'ArrowLeft') { state.placement.x -= step; event.preventDefault(); }
            else if (event.key === 'ArrowRight') { state.placement.x += step; event.preventDefault(); }
            else if (event.key === 'ArrowUp') { state.placement.y -= step; event.preventDefault(); }
            else if (event.key === 'ArrowDown') { state.placement.y += step; event.preventDefault(); }
            else return;
            clampPlacement();
            positionOverlay();
        });
    }

    function signatureHeightFraction() {
        if (!state.signature) return 0.1;
        const { width, height } = state.pageSize;
        return (state.placement.w * width / state.signature.aspect) / height;
    }

    function clampPlacement() {
        state.placement.w = Math.max(0.08, Math.min(0.9, state.placement.w));
        const heightFraction = signatureHeightFraction();
        state.placement.x = Math.max(0, Math.min(1 - state.placement.w, state.placement.x));
        state.placement.y = Math.max(0, Math.min(Math.max(0, 1 - heightFraction), state.placement.y));
    }

    function positionOverlay() {
        if (!overlay) return;
        const heightFraction = signatureHeightFraction();
        overlay.style.left = (state.placement.x * 100) + '%';
        overlay.style.top = (state.placement.y * 100) + '%';
        overlay.style.width = (state.placement.w * 100) + '%';
        overlay.style.height = (heightFraction * 100) + '%';
    }

    // Drawing events
    let drawing = false;
    let lastPoint = null;
    function canvasPoint(event) {
        const rect = drawCanvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (drawCanvas.width / rect.width),
            y: (event.clientY - rect.top) * (drawCanvas.height / rect.height)
        };
    }
    drawCanvas.addEventListener('pointerdown', (event) => {
        drawing = true;
        drawCanvas.setPointerCapture(event.pointerId);
        lastPoint = canvasPoint(event);
        drawContext.strokeStyle = signatureColor.control.value;
        drawContext.beginPath();
        drawContext.moveTo(lastPoint.x, lastPoint.y);
        event.preventDefault();
    });
    drawCanvas.addEventListener('pointermove', (event) => {
        if (!drawing) return;
        const point = canvasPoint(event);
        drawContext.lineTo(point.x, point.y);
        drawContext.stroke();
        lastPoint = point;
        event.preventDefault();
    });
    const stopDrawing = () => {
        if (!drawing) return;
        drawing = false;
        refreshSignature();
    };
    drawCanvas.addEventListener('pointerup', stopDrawing);
    drawCanvas.addEventListener('pointercancel', stopDrawing);

    // Typed signature
    [typeText.control, typeFont, typeColor.control].forEach((control) => {
        control.addEventListener('input', refreshSignature);
        control.addEventListener('change', refreshSignature);
    });
    uploadInput.addEventListener('change', async () => {
        const file = uploadInput.files && uploadInput.files[0];
        if (!file) return;
        uploadedImage = await loadImageElement(file);
        uploadLabel.textContent = file.name;
        refreshSignature();
    });
    signatureColor.control.addEventListener('input', () => {
        if (state.source === 'draw') {
            drawContext.strokeStyle = signatureColor.control.value;
        }
        refreshSignature();
    });
    allPages.control.addEventListener('change', () => { state.allPages = allPages.control.checked; });
    addDate.control.addEventListener('change', () => { state.addDate = addDate.control.checked; });

    function loadImageElement(file) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const url = URL.createObjectURL(file);
            image.onload = () => {
                resolve(image);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('That signature image could not be read.'));
            };
            image.src = url;
        });
    }

    function refreshSignature() {
        let canvas = null;
        if (state.source === 'draw') {
            canvas = drawCanvas;
            typePreview.hidden = true;
            uploadPreview.hidden = true;
            state.signature = canvasHasInk(drawCanvas) ? { dataUrl: drawCanvas.toDataURL('image/png'), aspect: drawCanvas.width / drawCanvas.height } : null;
        } else if (state.source === 'type') {
            const text = typeText.control.value.trim();
            typePreview.hidden = !text;
            if (text) {
                const fontSpec = '96px ' + typeFont.value;
                const measure = typePreview.getContext('2d');
                measure.font = fontSpec;
                const width = Math.ceil(measure.measureText(text).width) + 80;
                typePreview.width = Math.max(300, Math.min(1600, width));
                typePreview.height = 200;
                const context = typePreview.getContext('2d');
                context.clearRect(0, 0, typePreview.width, typePreview.height);
                context.font = fontSpec;
                context.fillStyle = typeColor.control.value;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(text, typePreview.width / 2, typePreview.height / 2);
                state.signature = { dataUrl: typePreview.toDataURL('image/png'), aspect: typePreview.width / typePreview.height };
            } else {
                state.signature = null;
            }
            uploadPreview.hidden = true;
        } else {
            drawWrap.hidden = state.source !== 'draw';
            typePreview.hidden = true;
            uploadPreview.hidden = !uploadedImage;
            if (uploadedImage) {
                const maxWidth = 1200;
                const scale = Math.min(1, maxWidth / uploadedImage.naturalWidth);
                uploadPreview.width = Math.max(1, Math.round(uploadedImage.naturalWidth * scale));
                uploadPreview.height = Math.max(1, Math.round(uploadedImage.naturalHeight * scale));
                const context = uploadPreview.getContext('2d');
                context.clearRect(0, 0, uploadPreview.width, uploadPreview.height);
                context.drawImage(uploadedImage, 0, 0, uploadPreview.width, uploadPreview.height);
                state.signature = { dataUrl: uploadPreview.toDataURL('image/png'), aspect: uploadPreview.width / uploadPreview.height };
            } else {
                state.signature = null;
            }
        }
        if (overlay) {
            const img = overlay.querySelector('img');
            if (state.signature) {
                img.src = state.signature.dataUrl;
                img.hidden = false;
                overlay.classList.remove('is-empty');
            } else {
                img.removeAttribute('src');
                img.hidden = true;
                overlay.classList.add('is-empty');
            }
            positionOverlay();
        }
        ws.setReady(!!state.doc && !!state.signature);
    }

    function canvasHasInk(canvas) {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < data.length; index += 4) {
            if (data[index] !== 0) return true;
        }
        return false;
    }

    ws.onRun(async () => {
        if (!state.doc || !state.signature) return;
        if (!state.pdfjs) return;
        ws.setBusy(true, 'Signing…');
        try {
            const image = await state.doc.embedPng(dataUrlToBytes(state.signature.dataUrl));
            const { StandardFonts } = window.PDFLib;
            const dateFont = state.addDate ? await state.doc.embedFont(StandardFonts.Helvetica) : null;
            const pages = state.allPages
                ? state.doc.getPages().map((page, index) => index)
                : [state.page - 1];
            pages.forEach((index, order) => {
                const page = state.doc.getPage(index);
                const { width, height } = page.getSize();
                const sigWidth = state.placement.w * width;
                const sigHeight = sigWidth / state.signature.aspect;
                const x = state.placement.x * width;
                const top = state.placement.y * height;
                const y = height - top - sigHeight;
                page.drawImage(image, { x, y, width: sigWidth, height: sigHeight });
                if (state.addDate) {
                    const dateText = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                    page.drawText(dateText, { x, y: Math.max(4, y - 12), size: 9, font: dateFont, color: window.PDFLib.rgb(0.25, 0.3, 0.38) });
                }
                if (order % 10 === 0) ws.setProgress((order / pages.length) * 90, 'Signing page ' + (index + 1) + '…');
            });
            const bytes = await state.doc.save({ useObjectStreams: true });
            const filename = sanitizeName(outputName.control.value, 'signed') + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'PDF signed',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Pages signed', value: String(pages.length) },
                    { label: 'Placement', value: Math.round(state.placement.x * 100) + '% from left' },
                    { label: 'Size', value: formatBytes(bytes.length) }
                ],
                actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
            });
        } catch (error) {
            ws.setBusy(false);
            throw error;
        }
    });
}
