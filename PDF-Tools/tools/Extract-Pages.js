import { openPdf, renderThumbnails, rangeToIndices, indicesToRanges, sanitizeName, formatBytes, downloadBytes, zipAndDownload, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, passwordPrompt, renderResult, icon } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to extract pages from',
        hint: 'Click page thumbnails to pick the pages you need',
        runLabel: 'Extract pages'
    });

    const state = { file: null, doc: null, password: undefined, pages: [], selected: new Set(), loading: false, output: 'single' };

    const range = field({ label: 'Pages', value: '', hint: 'Example: 1-3, 6, 9-12' });
    const selectButtons = h('div', { class: 'pw-toolbar' }, [
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'All', onclick: () => selectAll('all') }),
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Odd', onclick: () => selectAll('odd') }),
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Even', onclick: () => selectAll('even') }),
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Clear', onclick: () => selectAll('none') }),
        h('span', { class: 'pw-toolbar__spacer' }),
        h('span', { class: 'pw-toolbar__label', 'data-count': '' })
    ]);
    const outputMode = segmented({
        label: 'Output',
        value: 'single',
        options: [
            { value: 'single', label: 'One combined PDF' },
            { value: 'separate', label: 'Separate PDF per page' }
        ],
        onChange: (value) => { state.output = value; }
    });
    const outputName = field({ label: 'Output file name', value: 'extracted' });
    const gridWrap = h('div', { class: 'pw-empty', text: 'Add a PDF to preview its pages.' });
    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Pages to extract' }), h('span', { text: 'Selection order follows the document' })]),
        range,
        selectButtons,
        gridWrap,
        h('div', { class: 'pw-grid' }, [outputMode, outputName])
    ]));
    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    range.control.addEventListener('input', () => {
        if (!state.pages.length) return;
        state.selected = new Set(rangeToIndices(range.control.value, state.pages.length).map((index) => index + 1));
        paintSelection();
    });

    ws.onFiles(async (file) => {
        state.file = file;
        state.password = undefined;
        state.selected.clear();
        await load();
    });

    async function load() {
        state.loading = true;
        ws.setReady(false);
        gridWrap.className = 'pw-empty';
        gridWrap.textContent = 'Rendering page previews…';
        try {
            state.doc = await openPdf(state.file, state.password);
            const thumbs = await renderThumbnails(state.file, {
                maxWidth: 120,
                password: state.password,
                onProgress: (done, total) => { gridWrap.textContent = 'Rendering page ' + done + ' of ' + total + '…'; }
            });
            state.pages = thumbs.thumbnails;
            passwordBox.hide();
            renderGrid();
            updateCount();
            ws.setStatus('');
        } catch (error) {
            state.doc = null;
            state.pages = [];
            gridWrap.className = 'pw-empty';
            gridWrap.textContent = error.code === 'PASSWORD_REQUIRED' ? 'This PDF is password-protected. Enter its password to continue.' : describeError(error);
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        } finally {
            state.loading = false;
        }
    }

    function renderGrid() {
        gridWrap.className = '';
        gridWrap.innerHTML = '';
        if (!state.pages.length) {
            gridWrap.classList.add('pw-empty');
            gridWrap.textContent = 'Add a PDF to preview its pages.';
            return;
        }
        const grid = h('div', { class: 'pw-pagegrid' });
        state.pages.forEach((page) => {
            const tile = h('div', {
                class: 'pw-pagetile' + (state.selected.has(page.page) ? ' is-selected' : ''),
                role: 'button',
                tabindex: '0',
                'aria-pressed': String(state.selected.has(page.page)),
                'aria-label': 'Page ' + page.page
            }, [
                h('div', { class: 'pw-pagetile__thumb' }, [
                    h('img', { src: page.url, alt: '', loading: 'lazy', draggable: 'false', style: rotationStyle(page.rotation) }),
                    h('span', { class: 'pw-pagetile__num', text: page.page })
                ])
            ]);
            const toggle = () => {
                if (state.selected.has(page.page)) state.selected.delete(page.page);
                else state.selected.add(page.page);
                syncFromSelection();
            };
            tile.addEventListener('click', toggle);
            tile.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggle();
                }
            });
            grid.appendChild(tile);
        });
        gridWrap.appendChild(grid);
    }

    function paintSelection() {
        gridWrap.querySelectorAll('.pw-pagetile').forEach((tile) => {
            const page = Number(tile.dataset.page || tile.querySelector('.pw-pagetile__num').textContent);
            const selected = state.selected.has(page);
            tile.classList.toggle('is-selected', selected);
            tile.setAttribute('aria-pressed', String(selected));
        });
        updateCount();
    }

    function syncFromSelection() {
        const selected = Array.from(state.selected).sort((a, b) => a - b);
        range.control.value = indicesToRanges(selected.map((page) => page - 1));
        paintSelection();
    }

    function selectAll(mode) {
        if (!state.pages.length) return;
        state.selected.clear();
        state.pages.forEach((page) => {
            if (mode === 'all') state.selected.add(page.page);
            if (mode === 'odd' && page.page % 2 === 1) state.selected.add(page.page);
            if (mode === 'even' && page.page % 2 === 0) state.selected.add(page.page);
        });
        syncFromSelection();
        renderGrid();
    }

    function updateCount() {
        const count = state.selected.size;
        const label = selectButtons.querySelector('[data-count]');
        if (label) label.textContent = count + ' of ' + state.pages.length + ' selected';
        ws.setReady(count > 0 && !!state.doc);
    }

    function rotationStyle(rotation) {
        const angle = ((rotation || 0) % 360 + 360) % 360;
        if (!angle) return '';
        return 'transform: rotate(' + angle + 'deg)' + (angle === 90 || angle === 270 ? ' scale(0.7)' : '');
    }

    ws.onRun(async () => {
        if (!state.doc || !state.selected.size) return;
        const { PDFDocument } = window.PDFLib;
        const selected = Array.from(state.selected).sort((a, b) => a - b);
        const base = sanitizeName(outputName.control.value, 'extracted');
        ws.setBusy(true, 'Extracting…');
        if (state.output === 'single') {
            ws.setProgress(30, 'Copying ' + selected.length + ' pages…');
            const doc = await PDFDocument.create();
            const copied = await doc.copyPages(state.doc, selected.map((page) => page - 1));
            copied.forEach((page) => doc.addPage(page));
            const bytes = await doc.save({ useObjectStreams: true });
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'Extracted ' + selected.length + ' pages',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Pages kept', value: String(selected.length) },
                    { label: 'Source pages', value: String(state.pages.length) },
                    { label: 'Size', value: formatBytes(bytes.length) }
                ],
                actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
            });
            return;
        }
        const files = [];
        for (let index = 0; index < selected.length; index += 1) {
            ws.setProgress(10 + (index / selected.length) * 75, 'Building file ' + (index + 1) + ' of ' + selected.length + '…');
            const doc = await PDFDocument.create();
            const copied = await doc.copyPages(state.doc, [selected[index] - 1]);
            copied.forEach((page) => doc.addPage(page));
            files.push({ name: base + '-page-' + selected[index] + '.pdf', bytes: await doc.save({ useObjectStreams: true }) });
        }
        ws.setProgress(92, 'Packaging ZIP…');
        await zipAndDownload(files, base + '-pages.zip');
        ws.setProgress(100, 'Complete');
        ws.setBusy(false);
        renderResult(ws.result, {
            title: 'Created ' + files.length + ' PDFs',
            subtitle: 'Downloaded as ' + base + '-pages.zip',
            actions: [{ label: 'Download ZIP again', primary: true, onClick: () => zipAndDownload(files, base + '-pages.zip') }]
        });
    });

    ws.onReset(() => {
        state.file = null;
        state.doc = null;
        state.pages = [];
        state.selected.clear();
        range.control.value = '';
        gridWrap.className = 'pw-empty';
        gridWrap.textContent = 'Add a PDF to preview its pages.';
        updateCount();
    });
}
