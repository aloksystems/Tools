import { openPdf, openPdfJs, renderPageToCanvas, sanitizeName, formatBytes, downloadBytes, hexColor, describeError } from './engine.js';
import { createWorkspace, h, field, rangeField, passwordPrompt, renderResult, pageBar, note } from './ui.js';

const COLORS = ['#facc15', '#4ade80', '#f472b6', '#60a5fa', '#fb923c'];

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to highlight',
        hint: 'Drag across the page to draw a highlight',
        runLabel: 'Save highlights'
    });

    const state = {
        doc: null,
        pdfjs: null,
        pageCount: 0,
        page: 1,
        password: undefined,
        highlights: {},
        color: COLORS[0],
        opacity: 0.35
    };

    const pageNav = pageBar((page) => {
        state.page = page;
        renderPreview();
    });

    const swatches = h('div', { class: 'pw-swatches' });
    COLORS.forEach((value, index) => {
        const button = h('button', {
            type: 'button',
            class: 'pw-swatch' + (index === 0 ? ' is-active' : ''),
            style: 'background:' + value,
            title: 'Highlight colour ' + (index + 1),
            'data-color': value,
            onclick: () => {
                state.color = value;
                swatches.querySelectorAll('.pw-swatch').forEach((swatch) => swatch.classList.toggle('is-active', swatch.dataset.color === value));
            }
        });
        swatches.appendChild(button);
    });

    const opacity = rangeField({
        label: 'Opacity',
        value: 35,
        min: 10,
        max: 70,
        suffix: '%',
        onInput: (value) => { state.opacity = Number(value) / 100; }
    });

    const countLabel = h('span', { class: 'pw-toolbar__label', text: 'No highlights yet' });
    const undoButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Undo', onclick: undo });
    const clearPageButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Clear page', onclick: clearPage });
    const clearAllButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Clear all', onclick: clearAll });
    const toolbar = h('div', { class: 'pw-toolbar' }, [swatches, opacity, h('span', { class: 'pw-toolbar__spacer' }), undoButton, clearPageButton, clearAllButton, countLabel]);

    const canvasWrap = h('div', { class: 'pw-canvas-wrap' });
    const preview = h('div', { class: 'pw-preview' }, [h('div', { class: 'pw-empty', text: 'Add a PDF to start highlighting.' })]);
    const outputName = field({ label: 'Output file name', value: 'highlighted' });
    const summary = h('p', { class: 'pw-note', text: 'Drag on the page to mark an area. Each highlight keeps the colour and opacity it was drawn with.' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Highlight' }), h('span', { text: 'Draw directly on the page' })]),
        pageNav.root,
        toolbar,
        preview,
        outputName,
        summary
    ]));
    ws.extra.appendChild(note('Highlights are drawn as translucent shapes on the page. They are not editable PDF annotations, but they print and display everywhere.'));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    ws.onFiles(async (file) => {
        state.password = undefined;
        state.highlights = {};
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
            updateCount();
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
        await renderPageToCanvas(state.pdfjs, state.page, { maxWidth: 680, canvas });
        canvasWrap.innerHTML = '';
        canvasWrap.appendChild(canvas);
        const layer = h('div', { class: 'pw-overlay-layer' });
        canvasWrap.appendChild(layer);
        preview.innerHTML = '';
        preview.appendChild(canvasWrap);
        layer.addEventListener('pointerdown', (event) => startDraw(event, layer));
        renderBoxes(layer);
        updateCount();
    }

    function startDraw(event, layer) {
        if (event.button !== 0) return;
        const rect = canvasWrap.getBoundingClientRect();
        const start = {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
        };
        const box = h('div', { class: 'pw-hl', style: 'background:' + state.color + ';opacity:' + state.opacity });
        layer.appendChild(box);
        layer.setPointerCapture(event.pointerId);
        const move = (moveEvent) => {
            const current = {
                x: Math.min(1, Math.max(0, (moveEvent.clientX - rect.left) / rect.width)),
                y: Math.min(1, Math.max(0, (moveEvent.clientY - rect.top) / rect.height))
            };
            const x = Math.min(start.x, current.x);
            const y = Math.min(start.y, current.y);
            const width = Math.abs(current.x - start.x);
            const height = Math.abs(current.y - start.y);
            box.style.left = x * 100 + '%';
            box.style.top = y * 100 + '%';
            box.style.width = width * 100 + '%';
            box.style.height = height * 100 + '%';
            box.dataset.geometry = JSON.stringify({ x, y, width, height });
        };
        const up = () => {
            layer.removeEventListener('pointermove', move);
            layer.removeEventListener('pointerup', up);
            layer.removeEventListener('pointercancel', up);
            const geometry = box.dataset.geometry ? JSON.parse(box.dataset.geometry) : null;
            box.remove();
            if (geometry && geometry.width > 0.005 && geometry.height > 0.005) {
                if (!state.highlights[state.page]) state.highlights[state.page] = [];
                state.highlights[state.page].push({ ...geometry, color: state.color, opacity: state.opacity });
                renderBoxes(layer);
                updateCount();
            }
        };
        layer.addEventListener('pointermove', move);
        layer.addEventListener('pointerup', up);
        layer.addEventListener('pointercancel', up);
        event.preventDefault();
    }

    function renderBoxes(layer) {
        layer.querySelectorAll('.pw-hl').forEach((box) => box.remove());
        (state.highlights[state.page] || []).forEach((item) => {
            layer.appendChild(h('div', {
                class: 'pw-hl',
                style: 'left:' + item.x * 100 + '%;top:' + item.y * 100 + '%;width:' + item.width * 100 + '%;height:' + item.height * 100 + '%;background:' + item.color + ';opacity:' + item.opacity
            }));
        });
    }

    function undo() {
        const list = state.highlights[state.page];
        if (!list || !list.length) return;
        list.pop();
        if (!list.length) delete state.highlights[state.page];
        renderPreview();
    }

    function clearPage() {
        delete state.highlights[state.page];
        renderPreview();
    }

    function clearAll() {
        state.highlights = {};
        renderPreview();
    }

    function totalHighlights() {
        return Object.values(state.highlights).reduce((sum, list) => sum + list.length, 0);
    }

    function updateCount() {
        const total = totalHighlights();
        countLabel.textContent = total === 0 ? 'No highlights yet' : total + ' highlight' + (total === 1 ? '' : 's') + ' on ' + Object.keys(state.highlights).length + ' page' + (Object.keys(state.highlights).length === 1 ? '' : 's');
        undoButton.disabled = !(state.highlights[state.page] && state.highlights[state.page].length);
        clearPageButton.disabled = !(state.highlights[state.page] && state.highlights[state.page].length);
        clearAllButton.disabled = total === 0;
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const total = totalHighlights();
        if (!total) {
            ws.setStatus('Draw at least one highlight before saving.', 'error');
            return;
        }
        const base = sanitizeName(outputName.control.value, 'highlighted');
        ws.setBusy(true, 'Drawing highlights…');
        try {
            Object.keys(state.highlights).forEach((pageKey) => {
                const pageIndex = Number(pageKey) - 1;
                const page = state.doc.getPage(pageIndex);
                const { width, height } = page.getSize();
                (state.highlights[pageKey] || []).forEach((item) => {
                    page.drawRectangle({
                        x: item.x * width,
                        y: height - (item.y + item.height) * height,
                        width: item.width * width,
                        height: item.height * height,
                        color: hexColor(item.color, window.PDFLib),
                        opacity: item.opacity
                    });
                });
            });
            const bytes = await state.doc.save({ useObjectStreams: true });
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'Highlights saved',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Highlights', value: String(total) },
                    { label: 'Pages marked', value: String(Object.keys(state.highlights).length) },
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
