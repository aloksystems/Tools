import { loadPdfLib, openPdf, rangeToIndices, sanitizeName, formatBytes, downloadBytes, zipAndDownload, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, passwordPrompt, renderResult, iconMarkup } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to split',
        hint: 'Choose how you want the pages divided',
        runLabel: 'Split PDF'
    });

    const state = { file: null, doc: null, pages: 0, mode: 'ranges', password: undefined, parts: [] };
    const info = h('div', { class: 'pw-inline-note', html: iconMarkup('info') + '<span>Choose a PDF to see its page count.</span>' });
    const mode = segmented({
        label: 'Split method',
        value: 'ranges',
        options: [
            { value: 'ranges', label: 'Custom ranges' },
            { value: 'every', label: 'Every N pages' },
            { value: 'single', label: 'One page per file' }
        ],
        onChange: (value) => {
            state.mode = value;
            updateFields();
            updateState();
        }
    });
    const ranges = field({ label: 'Ranges', value: '1-3, 4-6', hint: 'Each comma-separated range becomes its own PDF.', wide: true });
    const every = field({ label: 'Pages per file', type: 'number', value: '2', min: '1', max: '500' });
    const outputName = field({ label: 'Base file name', value: 'document' });
    const fieldsWrap = h('div', { class: 'pw-grid' }, [ranges, every, outputName]);
    const preview = h('div', { class: 'pw-empty', text: 'Your split files will be listed here.' });
    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Split settings' }), h('span', { text: 'Ranges use human page numbers' })]),
        mode,
        fieldsWrap,
        info,
        preview
    ]));
    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    ws.onFiles(async (file) => {
        state.file = file;
        state.doc = null;
        state.pages = 0;
        state.password = undefined;
        preview.textContent = 'Reading the first pages…';
        await load();
        ws.setReady(!!state.doc);
    });

    async function load() {
        try {
            state.doc = await openPdf(state.file, state.password);
            state.pages = state.doc.getPageCount();
            passwordBox.hide();
            info.innerHTML = iconMarkup('check-circle') + '<span>' + state.pages + ' pages · ' + formatBytes(state.file.size) + '</span>';
            ws.setStatus('');
            updateFields();
            updateState();
            ws.setReady(true);
        } catch (error) {
            state.doc = null;
            state.pages = 0;
            ws.setReady(false);
            if (error.code === 'PASSWORD_REQUIRED') {
                passwordBox.show();
                info.innerHTML = iconMarkup('lock') + '<span>This PDF is locked.</span>';
                preview.textContent = 'Enter the password to preview the split.';
            } else {
                ws.setStatus(describeError(error), 'error');
            }
        }
    }

    function buildParts() {
        const total = state.pages;
        if (!total) return [];
        if (state.mode === 'single') {
            return Array.from({ length: total }, (_, index) => ({
                pages: [index],
                label: 'page-' + (index + 1),
                name: sanitizeName(outputName.control.value, 'document') + '-page-' + (index + 1) + '.pdf'
            }));
        }
        if (state.mode === 'every') {
            const size = Math.max(1, Math.min(500, Number.parseInt(every.control.value, 10) || 1));
            const parts = [];
            for (let start = 0; start < total; start += size) {
                const end = Math.min(total, start + size);
                const pages = Array.from({ length: end - start }, (_, index) => start + index);
                parts.push({
                    pages,
                    label: (start + 1) + '-' + end,
                    name: sanitizeName(outputName.control.value, 'document') + '-' + (start + 1) + '-' + end + '.pdf'
                });
            }
            return parts;
        }
        const groups = String(ranges.control.value || '').split(',').map((part) => part.trim()).filter(Boolean);
        return groups.map((group, index) => {
            const indices = rangeToIndices(group, total);
            if (!indices.length) return null;
            return {
                pages: indices,
                label: group,
                name: sanitizeName(outputName.control.value, 'document') + '-part-' + (index + 1) + '.pdf'
            };
        }).filter(Boolean);
    }

    function updateFields() {
        ranges.style.display = state.mode === 'ranges' ? '' : 'none';
        every.style.display = state.mode === 'every' ? '' : 'none';
        if (state.mode === 'ranges' && !ranges.control.value) ranges.control.value = '1-';
    }

    function updateState() {
        state.parts = buildParts();
        if (!state.doc) {
            preview.className = 'pw-empty';
            preview.textContent = 'Choose a PDF to see the split preview.';
            ws.setReady(false);
            return;
        }
        preview.className = '';
        preview.innerHTML = '';
        if (!state.parts.length) {
            preview.textContent = 'No valid ranges yet. Try 1-3, 4-6 or 1-';
            ws.setReady(false);
            return;
        }
        preview.appendChild(h('div', { class: 'pw-inline-note', html: iconMarkup('cut') + '<span>' + state.parts.length + ' file' + (state.parts.length === 1 ? '' : 's') + ' will be created.</span>' }));
        const list = h('div', { class: 'pw-item-list' });
        state.parts.slice(0, 40).forEach((part) => {
            list.appendChild(h('div', { class: 'pw-item' }, [
                h('span', { class: 'pw-item__swatch', style: 'background: var(--premium-accent)' }),
                h('span', { class: 'pw-item__body', text: part.name }),
                h('span', { text: part.pages.length + ' page' + (part.pages.length === 1 ? '' : 's') })
            ]));
        });
        if (state.parts.length > 40) list.appendChild(h('p', { class: 'pw-hint', text: '…and ' + (state.parts.length - 40) + ' more files.' }));
        preview.appendChild(list);
        ws.setReady(state.parts.length > 0);
    }

    ws.onReset(() => {
        state.doc = null;
        state.pages = 0;
        state.password = undefined;
        state.parts = [];
        info.innerHTML = iconMarkup('info') + '<span>Choose a PDF to see its page count.</span>';
        preview.className = 'pw-empty';
        preview.textContent = 'Your split files will be listed here.';
        ws.setReady(false);
    });

    ranges.control.addEventListener('input', updateState);
    every.control.addEventListener('input', updateState);
    outputName.control.addEventListener('input', updateState);
    updateFields();
    updateState();

    ws.onRun(async () => {
        if (!state.doc || !state.parts.length) return;
        const pdfLib = await loadPdfLib();
        ws.setBusy(true, 'Splitting…');
        let singleBytes = null;
        const files = [];
        const single = state.parts.length === 1;
        for (let index = 0; index < state.parts.length; index += 1) {
            const part = state.parts[index];
            ws.setProgress(4 + ((index + 1) / state.parts.length) * 82, 'Building ' + (index + 1) + ' of ' + state.parts.length + '…');
            const doc = await pdfLib.PDFDocument.create();
            const copied = await doc.copyPages(state.doc, part.pages);
            copied.forEach((page) => doc.addPage(page));
            const bytes = await doc.save({ useObjectStreams: true });
            if (single) {
                singleBytes = bytes;
                downloadBytes(bytes, part.name);
            } else {
                files.push({ name: part.name, bytes });
            }
        }
        if (files.length) {
            ws.setProgress(92, 'Packaging ZIP…');
            await zipAndDownload(files, sanitizeName(outputName.control.value, 'document') + '-split.zip');
        }
        ws.setProgress(100, 'Complete');
        ws.setBusy(false);
        renderResult(ws.result, {
            title: single ? 'Split complete' : 'Created ' + files.length + ' PDFs',
            subtitle: single ? state.parts[0].name : 'Downloaded as a ZIP archive',
            rows: [
                { label: 'Files', value: String(state.parts.length) },
                { label: 'Source pages', value: String(state.pages) },
                { label: 'Method', value: state.mode === 'ranges' ? 'Custom ranges' : state.mode === 'every' ? 'Every ' + every.control.value + ' pages' : 'One per page' }
            ],
            actions: single
                ? [{ label: 'Download again', primary: true, onClick: () => downloadBytes(singleBytes, state.parts[0].name) }]
                : [{ label: 'Download ZIP again', primary: true, onClick: () => zipAndDownload(files, sanitizeName(outputName.control.value, 'document') + '-split.zip') }]
        });
    });
}
