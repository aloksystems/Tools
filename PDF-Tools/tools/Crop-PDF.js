import { openPdf, openPdfJs, renderPageToCanvas, rangeToIndices, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, passwordPrompt, renderResult, pageBar, note } from './ui.js';

const MM_PER_PT = 25.4 / 72;
const MIN_CROP = 20;

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to crop',
        hint: 'Drag the crop box or type exact margins',
        runLabel: 'Crop PDF'
    });

    const state = {
        doc: null,
        pdfjs: null,
        pageCount: 0,
        page: 1,
        password: undefined,
        unit: 'pt',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        pageSize: { width: 595, height: 842 }
    };

    const pageNav = pageBar((page) => {
        state.page = page;
        renderPreview();
    });
    const unitSwitch = segmented({
        label: 'Units',
        value: 'pt',
        options: [{ value: 'pt', label: 'Points' }, { value: 'mm', label: 'Millimetres' }],
        onChange: (value) => {
            state.unit = value;
            updateLabels();
            syncInputs();
        }
    });
    const topField = field({ label: 'Top (pt)', type: 'number', value: 0, min: 0, step: 1 });
    const rightField = field({ label: 'Right (pt)', type: 'number', value: 0, min: 0, step: 1 });
    const bottomField = field({ label: 'Bottom (pt)', type: 'number', value: 0, min: 0, step: 1 });
    const leftField = field({ label: 'Left (pt)', type: 'number', value: 0, min: 0, step: 1 });
    const autoButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Auto trim this page', onclick: autoTrim });
    const resetButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Reset crop', onclick: () => { state.margins = { top: 0, right: 0, bottom: 0, left: 0 }; syncInputs(); updateOverlay(); } });
    const range = field({ label: 'Apply to pages', value: 'all', hint: 'Use all, odd, even, or a range like 1-4' });
    const outputName = field({ label: 'Output file name', value: 'cropped' });

    const canvasWrap = h('div', { class: 'pw-canvas-wrap' });
    const preview = h('div', { class: 'pw-preview' }, [h('div', { class: 'pw-empty', text: 'Add a PDF to position the crop box.' })]);
    const sizeLabel = h('p', { class: 'pw-note', text: '' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Crop box' }), h('span', { text: 'Live page preview' })]),
        pageNav.root,
        h('div', { class: 'pw-columns' }, [
            h('div', { class: 'pw-col' }, [
                preview,
                sizeLabel
            ]),
            h('div', { class: 'pw-col' }, [
                unitSwitch,
                h('div', { class: 'pw-grid' }, [topField, bottomField, leftField, rightField]),
                h('div', { class: 'pw-inline' }, [autoButton, resetButton]),
                range,
                outputName,
                note('Dragging the box updates the margins. Auto trim detects the printed content and adds a small safety margin.')
            ])
        ])
    ]));
    ws.extra.appendChild(note('The crop is written into the PDF page box, so the hidden margins are truly removed. The first page is used for auto trim.'));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    [topField, rightField, bottomField, leftField].forEach((input, index) => {
        input.control.addEventListener('input', () => {
            const keys = ['top', 'right', 'bottom', 'left'];
            const key = keys[index];
            const raw = Number(input.control.value);
            if (!Number.isFinite(raw)) return;
            state.margins[key] = raw * (state.unit === 'mm' ? 1 / MM_PER_PT : 1);
            clampMargins();
            updateOverlay();
        });
    });

    ws.onFiles(async (file) => {
        state.password = undefined;
        state.margins = { top: 0, right: 0, bottom: 0, left: 0 };
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
            state.page = 1;
            pageNav.set(state.pageCount, state.page);
            passwordBox.hide();
            await renderPreview();
            ws.setStatus('');
            ws.setReady(true);
            syncInputs();
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
        const box = h('div', { class: 'pw-cropbox' }, [
            h('span', { class: 'pw-cropbox__handle pw-cropbox__handle--nw', 'data-handle': 'nw' }),
            h('span', { class: 'pw-cropbox__handle pw-cropbox__handle--ne', 'data-handle': 'ne' }),
            h('span', { class: 'pw-cropbox__handle pw-cropbox__handle--sw', 'data-handle': 'sw' }),
            h('span', { class: 'pw-cropbox__handle pw-cropbox__handle--se', 'data-handle': 'se' })
        ]);
        canvasWrap.appendChild(box);
        preview.innerHTML = '';
        preview.appendChild(canvasWrap);
        clampMargins();
        updateOverlay();
        attachBoxEvents(box);
    }

    function attachBoxEvents(box) {
        let mode = null;
        let handleName = '';
        let start = null;
        box.addEventListener('pointerdown', (event) => {
            const handle = event.target.closest('[data-handle]');
            if (handle) {
                mode = 'resize';
                handleName = handle.dataset.handle;
            } else {
                mode = 'move';
            }
            start = { x: event.clientX, y: event.clientY, margins: { ...state.margins } };
            box.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
        });
        box.addEventListener('pointermove', (event) => {
            if (!mode || !start) return;
            const rect = canvasWrap.getBoundingClientRect();
            const dx = (event.clientX - start.x) / rect.width * state.pageSize.width;
            const dy = (event.clientY - start.y) / rect.height * state.pageSize.height;
            const m = { ...start.margins };
            if (mode === 'move') {
                m.left = start.margins.left + dx;
                m.top = start.margins.top + dy;
            } else {
                if (handleName.includes('w')) m.left = start.margins.left + dx;
                if (handleName.includes('e')) m.right = start.margins.right - dx;
                if (handleName.includes('n')) m.top = start.margins.top + dy;
                if (handleName.includes('s')) m.bottom = start.margins.bottom - dy;
            }
            state.margins = m;
            clampMargins();
            updateOverlay();
            syncInputs();
        });
        const end = () => { mode = null; start = null; };
        box.addEventListener('pointerup', end);
        box.addEventListener('pointercancel', end);
    }

    function clampMargins() {
        const { width, height } = state.pageSize;
        const m = state.margins;
        m.left = Math.max(0, Math.min(width - MIN_CROP, m.left));
        m.right = Math.max(0, Math.min(width - m.left - MIN_CROP, m.right));
        m.top = Math.max(0, Math.min(height - MIN_CROP, m.top));
        m.bottom = Math.max(0, Math.min(height - m.top - MIN_CROP, m.bottom));
    }

    function updateOverlay() {
        const box = canvasWrap.querySelector('.pw-cropbox');
        if (!box) return;
        const { width, height } = state.pageSize;
        const m = state.margins;
        box.style.left = (m.left / width * 100) + '%';
        box.style.top = (m.top / height * 100) + '%';
        box.style.width = (Math.max(0, 1 - (m.left + m.right) / width) * 100) + '%';
        box.style.height = (Math.max(0, 1 - (m.top + m.bottom) / height) * 100) + '%';
        sizeLabel.textContent = 'Page ' + Math.round(width) + ' × ' + Math.round(height) + ' pt · crop ' +
            Math.round(Math.max(0, width - m.left - m.right)) + ' × ' +
            Math.round(Math.max(0, height - m.top - m.bottom)) + ' pt';
    }

    function syncInputs() {
        const factor = state.unit === 'mm' ? MM_PER_PT : 1;
        const set = (inputElement, key) => {
            const value = Math.round(state.margins[key] * factor * 10) / 10;
            inputElement.control.value = String(value);
        };
        set(topField, 'top');
        set(rightField, 'right');
        set(bottomField, 'bottom');
        set(leftField, 'left');
    }

    function updateLabels() {
        const unit = state.unit === 'mm' ? 'mm' : 'pt';
        const labels = [topField, rightField, bottomField, leftField];
        ['Top', 'Right', 'Bottom', 'Left'].forEach((name, index) => {
            const label = labels[index].querySelector('.pw-label');
            if (label) label.textContent = name + ' (' + unit + ')';
        });
    }

    async function autoTrim() {
        if (!state.pdfjs) return;
        ws.setStatus('Detecting content on page ' + state.page + '…');
        const canvas = document.createElement('canvas');
        const rendered = await renderPageToCanvas(state.pdfjs, state.page, { maxWidth: 1000, canvas });
        const context = canvas.getContext('2d');
        const { width, height } = canvas;
        const pixels = context.getImageData(0, 0, width, height).data;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = (y * width + x) * 4;
                const r = pixels[index];
                const g = pixels[index + 1];
                const b = pixels[index + 2];
                if (r < 244 || g < 244 || b < 244) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < minX || maxY < minY) {
            ws.setStatus('No printed content was detected on this page.', 'error');
            return;
        }
        const padding = 6;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(width - 1, maxX + padding);
        maxY = Math.min(height - 1, maxY + padding);
        const scale = rendered.pageWidth / width;
        state.margins = {
            left: minX * scale,
            top: minY * scale,
            right: (width - 1 - maxX) * scale,
            bottom: (height - 1 - maxY) * scale
        };
        clampMargins();
        syncInputs();
        updateOverlay();
        ws.setStatus('Content detected — margins updated for the selected page.', 'success');
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const indices = rangeToIndices(range.control.value, state.pageCount);
        if (!indices.length) {
            ws.setStatus('That page range does not include any pages.', 'error');
            return;
        }
        const base = sanitizeName(outputName.control.value, 'cropped');
        ws.setBusy(true, 'Cropping…');
        try {
            indices.forEach((index, order) => {
                const page = state.doc.getPage(index);
                const { width, height } = page.getSize();
                const m = state.margins;
                const cropWidth = width - m.left - m.right;
                const cropHeight = height - m.top - m.bottom;
                if (cropWidth < MIN_CROP || cropHeight < MIN_CROP) {
                    throw new Error('The crop box is too small on page ' + (index + 1) + '. Reduce the margins.');
                }
                page.setMediaBox(m.left, m.bottom, cropWidth, cropHeight);
                page.setCropBox(m.left, m.bottom, cropWidth, cropHeight);
                if (order % 10 === 0) ws.setProgress((order / indices.length) * 90, 'Cropping page ' + (index + 1) + '…');
            });
            const bytes = await state.doc.save({ useObjectStreams: true });
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'PDF cropped',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Pages cropped', value: String(indices.length) },
                    { label: 'Crop size', value: Math.round(state.pageSize.width - state.margins.left - state.margins.right) + ' × ' + Math.round(state.pageSize.height - state.margins.top - state.margins.bottom) + ' pt' },
                    { label: 'Size', value: formatBytes(bytes.length) }
                ],
                actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
            });
        } catch (error) {
            ws.setBusy(false);
            throw error;
        }
    });

    updateLabels();
    syncInputs();
}
