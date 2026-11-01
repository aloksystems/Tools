import { openPdf, openPdfJs, renderPageToCanvas, sanitizeName, formatBytes, downloadBytes, hexColor, describeError } from './engine.js';
import { createWorkspace, h, field, colorField, checkbox, passwordPrompt, renderResult, pageBar, note } from './ui.js';

const FONT_OPTIONS = [
    { value: 'helvetica', label: 'Helvetica', standard: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
    { value: 'helvetica-bold', label: 'Helvetica Bold', standard: 'HelveticaBold', css: 'Helvetica, Arial, sans-serif' },
    { value: 'times', label: 'Times Roman', standard: 'TimesRoman', css: '"Times New Roman", Times, serif' },
    { value: 'courier', label: 'Courier', standard: 'Courier', css: '"Courier New", Courier, monospace' }
];

const DEFAULT_TEXT = 'New text';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to add text',
        hint: 'Original text stays untouched — new text is drawn on top',
        runLabel: 'Save text edits'
    });

    const state = {
        doc: null,
        pdfjs: null,
        pageCount: 0,
        page: 1,
        password: undefined,
        displayWidth: 0,
        displayHeight: 0,
        items: {},
        selectedId: null,
        nextId: 1
    };

    const pageNav = pageBar((page) => {
        state.page = page;
        state.selectedId = null;
        renderPreview();
    });

    const textarea = h('textarea', { class: 'pw-textarea', rows: '2', placeholder: 'Type the text to place' });
    textarea.value = DEFAULT_TEXT;
    const fontSelect = h('select', { class: 'pw-select' }, FONT_OPTIONS.map((option) => h('option', { value: option.value, text: option.label })));
    const sizeInput = h('input', { class: 'pw-input', type: 'number', min: '6', max: '96', step: '1', value: '16' });
    const colorInput = h('input', { class: 'pw-color', type: 'color', value: '#111827' });
    const whiteoutInput = h('input', { type: 'checkbox' });
    const whiteoutCheck = h('label', { class: 'pw-check' }, [whiteoutInput, h('span', { text: 'White box behind the text (covers old content)' })]);

    const addButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Add text', onclick: addAtCentre });
    const deleteButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Delete selected', disabled: true, onclick: deleteSelected });
    const clearPageButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Clear page', onclick: clearPage });
    const clearAllButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Clear all', onclick: clearAll });
    const countLabel = h('span', { class: 'pw-toolbar__label', text: 'No text boxes yet' });
    const toolbar = h('div', { class: 'pw-toolbar' }, [addButton, deleteButton, clearPageButton, clearAllButton, h('span', { class: 'pw-toolbar__spacer' }), countLabel]);

    const canvasWrap = h('div', { class: 'pw-canvas-wrap' });
    const preview = h('div', { class: 'pw-preview' }, [h('div', { class: 'pw-empty', text: 'Add a PDF, then click the page to place text.' })]);
    const outputName = field({ label: 'Output file name', value: 'edited-text' });

    const styleGrid = h('div', { class: 'pw-grid' }, [
        field({ label: 'Font', control: fontSelect }),
        field({ label: 'Size (pt)', control: sizeInput }),
        field({ label: 'Colour', control: colorInput }),
        field({ label: 'Whiteout', control: whiteoutInput })
    ]);

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Place text' }), h('span', { text: 'Click the page, drag to move' })]),
        pageNav.root,
        toolbar,
        preview,
        field({ label: 'Text', control: textarea }),
        styleGrid,
        whiteoutCheck,
        outputName,
        note('Click anywhere on the page to add a text box. Select a box to edit its text, font, size, colour, or whiteout. Multi-line text is supported.')
    ]));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    textarea.addEventListener('input', applyStyleToSelected);
    fontSelect.addEventListener('change', applyStyleToSelected);
    sizeInput.addEventListener('change', applyStyleToSelected);
    colorInput.addEventListener('input', applyStyleToSelected);
    whiteoutInput.addEventListener('change', applyStyleToSelected);

    ws.onFiles(async () => {
        state.password = undefined;
        state.items = {};
        state.selectedId = null;
        await load();
    });

    ws.onReset(() => {
        state.doc = null;
        state.pdfjs = null;
        state.items = {};
        state.selectedId = null;
        state.displayWidth = 0;
        preview.innerHTML = '';
        preview.appendChild(h('div', { class: 'pw-empty', text: 'Add a PDF, then click the page to place text.' }));
        updateCount();
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
        } catch (error) {
            state.doc = null;
            state.pdfjs = null;
            preview.innerHTML = '';
            preview.appendChild(h('div', { class: 'pw-empty', text: describeError(error) }));
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        }
    }

    async function renderPreview() {
        if (!state.pdfjs) return;
        const result = await renderPageToCanvas(state.pdfjs, state.page, { maxWidth: 680 });
        state.displayWidth = result.pageWidth;
        state.displayHeight = result.pageHeight;
        canvasWrap.innerHTML = '';
        canvasWrap.appendChild(result.canvas);
        const layer = h('div', { class: 'pw-overlay-layer' });
        canvasWrap.appendChild(layer);
        preview.innerHTML = '';
        preview.appendChild(canvasWrap);
        layer.addEventListener('pointerdown', (event) => {
            if (event.target !== layer) return;
            addBox(event, layer);
        });
        paintBoxes(layer);
        updateCount();
    }

    function currentPageItems() {
        if (!state.items[state.page]) state.items[state.page] = [];
        return state.items[state.page];
    }

    function addAtCentre() {
        if (!state.pdfjs) {
            ws.setStatus('Add a PDF before placing text.', 'error');
            return;
        }
        const layer = canvasWrap.querySelector('.pw-overlay-layer');
        if (!layer) return;
        const rect = canvasWrap.getBoundingClientRect();
        const fakeEvent = {
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            target: layer
        };
        addBox(fakeEvent, layer);
    }

    function addBox(event, layer) {
        if (!textarea.value.trim()) {
            ws.setStatus('Type some text before placing it on the page.', 'error');
            textarea.focus();
            return;
        }
        const rect = canvasWrap.getBoundingClientRect();
        const x = Math.min(0.9, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(0.95, Math.max(0, (event.clientY - rect.top) / rect.height));
        const item = {
            id: state.nextId++,
            text: textarea.value || DEFAULT_TEXT,
            x,
            y,
            size: clampSize(sizeInput.value),
            font: fontSelect.value,
            color: colorInput.value,
            whiteout: whiteoutInput.checked
        };
        currentPageItems().push(item);
        state.selectedId = item.id;
        paintBoxes(layer);
        updateCount();
    }

    function clampSize(value) {
        return Math.max(6, Math.min(96, Number(value) || 16));
    }

    function findSelected() {
        return currentPageItems().find((item) => item.id === state.selectedId) || null;
    }

    function applyStyleToSelected() {
        const item = findSelected();
        if (!item) return;
        item.text = textarea.value;
        item.size = clampSize(sizeInput.value);
        item.font = fontSelect.value;
        item.color = colorInput.value;
        item.whiteout = whiteoutInput.checked;
        const layer = canvasWrap.querySelector('.pw-overlay-layer');
        if (layer) paintBoxes(layer);
        updateCount();
    }

    function syncControls(item) {
        textarea.value = item.text;
        sizeInput.value = item.size;
        fontSelect.value = item.font;
        colorInput.value = item.color;
        whiteoutInput.checked = item.whiteout;
    }

    function paintBoxes(layer) {
        layer.querySelectorAll('.pw-textbox').forEach((box) => box.remove());
        const rect = canvasWrap.getBoundingClientRect();
        const scale = rect.width / (state.displayWidth || 1);
        currentPageItems().forEach((item) => {
            const option = FONT_OPTIONS.find((entry) => entry.value === item.font) || FONT_OPTIONS[0];
            const box = h('div', {
                class: 'pw-textbox' + (item.whiteout ? ' is-whiteout' : '') + (item.id === state.selectedId ? ' is-selected' : ''),
                'data-id': item.id,
                title: 'Drag to move',
                style: 'left:' + item.x * 100 + '%;top:' + item.y * 100 + '%;font-family:' + option.css + ';font-size:' + Math.max(4, item.size * scale) + 'px;color:' + item.color
            }, item.text);
            box.addEventListener('pointerdown', (event) => startDrag(event, item, layer, box));
            layer.appendChild(box);
        });
        deleteButton.disabled = !findSelected();
    }

    function startDrag(event, item, layer, box) {
        event.stopPropagation();
        state.selectedId = item.id;
        syncControls(item);
        layer.querySelectorAll('.pw-textbox').forEach((element) => {
            element.classList.toggle('is-selected', Number(element.dataset.id) === item.id);
        });
        deleteButton.disabled = false;
        const rect = canvasWrap.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const startItemX = item.x;
        const startItemY = item.y;
        box.setPointerCapture(event.pointerId);
        const move = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / rect.width;
            const dy = (moveEvent.clientY - startY) / rect.height;
            item.x = Math.min(0.94, Math.max(0, startItemX + dx));
            item.y = Math.min(0.97, Math.max(0, startItemY + dy));
            box.style.left = item.x * 100 + '%';
            box.style.top = item.y * 100 + '%';
        };
        const up = () => {
            box.removeEventListener('pointermove', move);
            box.removeEventListener('pointerup', up);
            box.removeEventListener('pointercancel', up);
        };
        box.addEventListener('pointermove', move);
        box.addEventListener('pointerup', up);
        box.addEventListener('pointercancel', up);
        event.preventDefault();
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        const items = currentPageItems().filter((item) => item.id !== state.selectedId);
        state.items[state.page] = items;
        state.selectedId = null;
        const layer = canvasWrap.querySelector('.pw-overlay-layer');
        if (layer) paintBoxes(layer);
        updateCount();
    }

    function clearPage() {
        state.items[state.page] = [];
        state.selectedId = null;
        const layer = canvasWrap.querySelector('.pw-overlay-layer');
        if (layer) paintBoxes(layer);
        updateCount();
    }

    function clearAll() {
        state.items = {};
        state.selectedId = null;
        const layer = canvasWrap.querySelector('.pw-overlay-layer');
        if (layer) paintBoxes(layer);
        updateCount();
    }

    function totalItems() {
        return Object.values(state.items).reduce((sum, list) => sum + list.length, 0);
    }

    function updateCount() {
        const total = totalItems();
        const pages = Object.values(state.items).filter((list) => list.length).length;
        countLabel.textContent = total === 0 ? 'No text boxes yet' : total + ' box' + (total === 1 ? '' : 'es') + ' on ' + pages + ' page' + (pages === 1 ? '' : 's');
        clearPageButton.disabled = !currentPageItems().length;
        clearAllButton.disabled = total === 0;
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const total = totalItems();
        if (!total) {
            ws.setStatus('Place at least one text box before saving.', 'error');
            return;
        }
        const base = sanitizeName(outputName.control.value, 'edited-text');
        const pdfLib = window.PDFLib;
        const embeddedFonts = {};
        ws.setBusy(true, 'Drawing text…');
        try {
            const entries = Object.keys(state.items).filter((key) => state.items[key].length);
            for (const pageKey of entries) {
                const pageNumber = Number(pageKey);
                const page = state.doc.getPage(pageNumber - 1);
                const pdfPage = await state.pdfjs.getPage(pageNumber);
                const viewport = pdfPage.getViewport({ scale: 1 });
                const rotation = ((page.getRotation().angle % 360) + 360) % 360;
                const displayWidth = viewport.width;
                const displayHeight = viewport.height;
                for (const item of state.items[pageKey]) {
                    const option = FONT_OPTIONS.find((entry) => entry.value === item.font) || FONT_OPTIONS[0];
                    if (!embeddedFonts[option.standard]) {
                        embeddedFonts[option.standard] = await state.doc.embedFont(pdfLib.StandardFonts[option.standard]);
                    }
                    const font = embeddedFonts[option.standard];
                    const size = clampSize(item.size);
                    const lines = String(item.text || '').split('\n');
                    let textWidth = 1;
                    try {
                        lines.forEach((line) => {
                            textWidth = Math.max(textWidth, font.widthOfTextAtSize(line, size));
                        });
                    } catch (error) {
                        throw new Error('Some characters in “' + item.text.slice(0, 24) + '” are not supported by the selected font. Try Latin text or another font.');
                    }
                    if (item.whiteout) {
                        const pad = size * 0.22;
                        const boxWidth = textWidth + pad * 2;
                        const boxHeight = size * 1.22 * lines.length + pad * 2;
                        const left = Math.max(0, item.x * displayWidth - pad);
                        const top = Math.max(0, item.y * displayHeight - pad);
                        const [x1, y1] = viewport.convertToPdfPoint(left, top);
                        const [x2, y2] = viewport.convertToPdfPoint(left + boxWidth, top + boxHeight);
                        page.drawRectangle({
                            x: Math.min(x1, x2),
                            y: Math.min(y1, y2),
                            width: Math.abs(x2 - x1),
                            height: Math.abs(y2 - y1),
                            color: pdfLib.rgb(1, 1, 1)
                        });
                    }
                    const color = hexColor(item.color, pdfLib);
                    lines.forEach((line, index) => {
                        if (!line) return;
                        const [x, y] = viewport.convertToPdfPoint(
                            item.x * displayWidth,
                            item.y * displayHeight + size * 0.85 + index * size * 1.22
                        );
                        page.drawText(line, { x, y, size, font, color, rotate: pdfLib.degrees(rotation) });
                    });
                }
                ws.setProgress((entries.indexOf(pageKey) + 1) / entries.length * 90, 'Placing text…');
            }
            const bytes = await state.doc.save({ useObjectStreams: true });
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'Text added',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Text boxes', value: String(total) },
                    { label: 'Pages', value: String(Object.keys(state.items).length) },
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
