import { openPdfJs, renderPageToCanvas, rangeToIndices, sanitizeName, formatBytes, downloadBlob, canvasToBlob, zipAndDownload, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, rangeField, passwordPrompt, renderResult, iconMarkup } from './ui.js';

const FORMATS = {
    jpg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG', lossy: true },
    png: { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false },
    webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true }
};

const PREVIEW_LIMIT = 12;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to convert',
        hint: 'Pages become JPG, PNG, or WebP images — rendered on this device',
        runLabel: 'Export images'
    });

    const state = { doc: null, pages: 0, password: undefined, format: 'jpg', dpi: 150, quality: 0.9, range: '', mode: 'zip', base: 'pages', busy: false, last: null };

    const format = segmented({
        label: 'Image format',
        value: 'jpg',
        options: [
            { value: 'jpg', label: 'JPG' },
            { value: 'png', label: 'PNG' },
            { value: 'webp', label: 'WebP' }
        ],
        onChange: (value) => {
            state.format = value;
            qualityField.control.disabled = !FORMATS[value].lossy;
            qualityField.style.opacity = FORMATS[value].lossy ? '1' : '0.5';
            updateSummary();
        }
    });
    const dpi = segmented({
        label: 'Resolution',
        value: '150',
        options: [
            { value: '72', label: '72 DPI' },
            { value: '150', label: '150 DPI' },
            { value: '300', label: '300 DPI' }
        ],
        onChange: (value) => { state.dpi = Number(value); updateSummary(); }
    });
    const qualityField = rangeField({
        label: 'Image quality',
        min: 40,
        max: 100,
        value: 90,
        suffix: '%',
        onInput: (value) => { state.quality = Number(value) / 100; }
    });
    const rangeInput = field({ label: 'Pages to export', placeholder: 'All pages — e.g. 1-3, 5', hint: 'Use commas for single pages and dashes for ranges.' });
    const mode = segmented({
        label: 'Download as',
        value: 'zip',
        options: [
            { value: 'zip', label: 'ZIP archive' },
            { value: 'files', label: 'Separate files' }
        ],
        onChange: (value) => { state.mode = value; }
    });
    const outputName = field({ label: 'Output file name', value: 'pages' });
    const summary = h('div', { class: 'pw-inline-note', html: iconMarkup('info') + '<span>Add a PDF to choose pages.</span>' });
    const preview = h('div', { class: 'pw-thumbs' });
    const previewNote = h('p', { class: 'pw-hint', text: '' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Output' }), h('span', { text: 'Rendered from the PDF vector layer' })]),
        format,
        dpi,
        h('div', { class: 'pw-grid' }, [rangeInput, outputName]),
        qualityField,
        mode,
        summary,
        previewNote,
        preview
    ]));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    rangeInput.control.addEventListener('input', () => { state.range = rangeInput.control.value; updateSummary(); });

    ws.onFiles(async () => {
        state.password = undefined;
        await load();
    });

    ws.onReset(() => {
        if (state.doc) state.doc.destroy();
        state.doc = null;
        state.pages = 0;
        state.last = null;
        preview.innerHTML = '';
        previewNote.textContent = '';
        ws.setProgress(null);
    });

    async function load() {
        if (state.doc) {
            await state.doc.destroy();
            state.doc = null;
        }
        if (state.busy) return;
        ws.setReady(false);
        ws.setStatus('');
        state.last = null;
        preview.innerHTML = '';
        previewNote.textContent = '';
        state.base = sanitizeName(ws.file.name, 'pages');
        outputName.control.value = state.base;
        summary.innerHTML = iconMarkup('info') + '<span>Reading document…</span>';
        try {
            state.doc = await openPdfJs(ws.file, state.password);
            state.pages = state.doc.numPages;
            passwordBox.hide();
            ws.setStatus('');
            updateSummary();
            await renderPreview();
            ws.setReady(true);
        } catch (error) {
            if (error.code === 'PASSWORD_REQUIRED') {
                passwordBox.show();
                summary.innerHTML = iconMarkup('info') + '<span>Enter the PDF password to continue.</span>';
                return;
            }
            ws.showError(error);
            summary.innerHTML = iconMarkup('info') + '<span>' + describeError(error) + '</span>';
        }
    }

    async function renderPreview() {
        const total = Math.min(state.pages, PREVIEW_LIMIT);
        for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
            const { canvas } = await renderPageToCanvas(state.doc, pageNumber, { maxWidth: 150, background: '#ffffff' });
            const url = canvas.toDataURL('image/jpeg', 0.7);
            preview.appendChild(h('div', { class: 'pw-thumb' }, [
                h('div', { class: 'pw-thumb__image' }, [h('img', { src: url, alt: '', loading: 'lazy' })]),
                h('div', { class: 'pw-thumb__meta' }, [
                    h('strong', { text: 'Page ' + pageNumber }),
                    h('span', { text: canvas.width + ' × ' + canvas.height + ' px preview' })
                ])
            ]));
        }
        previewNote.textContent = state.pages > PREVIEW_LIMIT
            ? 'Showing the first ' + PREVIEW_LIMIT + ' of ' + state.pages + ' pages. All selected pages are exported.'
            : '';
    }

    function selectedIndices() {
        if (!state.range.trim()) return Array.from({ length: state.pages }, (_, index) => index);
        return rangeToIndices(state.range, state.pages);
    }

    function updateSummary() {
        if (!state.pages) return;
        const indices = selectedIndices();
        const suffix = FORMATS[state.format];
        summary.innerHTML = iconMarkup('info') + '<span>' + state.pages + ' pages · exporting ' + indices.length + ' ' + suffix.label
            + ' image' + (indices.length === 1 ? '' : 's') + ' at ' + state.dpi + ' DPI</span>';
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const indices = selectedIndices();
        if (!indices.length) throw new Error('That page range does not include any pages.');
        const suffix = FORMATS[state.format];
        const scale = state.dpi / 72;
        const base = sanitizeName(outputName.control.value, state.base);
        state.busy = true;
        ws.setBusy(true, 'Rendering pages…');
        ws.setProgress(2, 'Starting…');
        try {
            const entries = [];
            for (let index = 0; index < indices.length; index += 1) {
                const pageNumber = indices[index] + 1;
                const rendered = await renderPageToCanvas(state.doc, pageNumber, { scale, background: '#ffffff' });
                const blob = await canvasToBlob(rendered.canvas, suffix.mime, suffix.lossy ? state.quality : undefined);
                if (!blob) throw new Error('This browser could not encode the ' + suffix.label + ' image.');
                if (suffix.mime !== 'image/png' && blob.type !== suffix.mime) {
                    throw new Error('This browser does not support ' + suffix.label + ' export. Try JPG or PNG.');
                }
                entries.push({
                    name: base + '-page-' + String(pageNumber).padStart(2, '0') + '.' + suffix.ext,
                    blob,
                    page: pageNumber,
                    width: rendered.canvas.width,
                    height: rendered.canvas.height
                });
                ws.setProgress(2 + ((index + 1) / indices.length) * 93, 'Rendered page ' + pageNumber + ' of ' + state.pages);
            }
            let zipName = '';
            if (entries.length === 1) {
                downloadBlob(entries[0].blob, entries[0].name);
            } else if (state.mode === 'zip') {
                zipName = base + '-' + suffix.ext + '.zip';
                await zipAndDownload(entries, zipName);
            } else {
                for (const entry of entries) {
                    downloadBlob(entry.blob, entry.name);
                    await sleep(350);
                }
            }
            const totalBytes = entries.reduce((sum, entry) => sum + entry.blob.size, 0);
            const filename = entries.length === 1 ? entries[0].name : state.mode === 'zip' ? zipName : entries.length + ' image files';
            state.last = { entries, zipName, suffix, base };
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            ws.setStatus('');
            renderResult(ws.result, {
                title: 'Exported ' + entries.length + ' page' + (entries.length === 1 ? '' : 's'),
                subtitle: filename + ' · ' + formatBytes(totalBytes),
                rows: [
                    { label: 'Images', value: String(entries.length) },
                    { label: 'Format', value: suffix.label + ' · ' + state.dpi + ' DPI' },
                    { label: 'First image', value: entries[0].width + ' × ' + entries[0].height + ' px' },
                    { label: 'Size', value: formatBytes(totalBytes) }
                ],
                actions: [{
                    label: 'Download again',
                    primary: true,
                    onClick: async () => {
                        if (entries.length === 1) downloadBlob(entries[0].blob, entries[0].name);
                        else if (state.mode === 'zip') await zipAndDownload(entries, zipName);
                        else entries.forEach((entry) => downloadBlob(entry.blob, entry.name));
                    }
                }]
            });
        } finally {
            state.busy = false;
            ws.setBusy(false);
        }
    });

    updateSummary();
}
