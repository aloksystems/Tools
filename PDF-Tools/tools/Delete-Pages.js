import { openPdf, renderThumbnails, rangeToIndices, indicesToRanges, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, passwordPrompt, renderResult } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to remove pages from',
        hint: 'Click the pages you want to delete',
        runLabel: 'Delete pages'
    });

    const state = { doc: null, pages: [], selected: new Set() };

    const range = field({ label: 'Pages to delete', value: '', hint: 'Example: 2, 5-8 — or pick thumbnails below' });
    const toolbar = h('div', { class: 'pw-toolbar' }, [
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'All', onclick: () => selectAll('all') }),
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Invert', onclick: () => selectAll('invert') }),
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Clear', onclick: () => selectAll('none') }),
        h('span', { class: 'pw-toolbar__spacer' }),
        h('span', { class: 'pw-toolbar__label', 'data-count': '' })
    ]);
    const outputName = field({ label: 'Output file name', value: 'pages-removed' });
    const summary = h('p', { class: 'pw-note', text: 'Select the pages to remove — everything else stays in the same order.' });
    const gridWrap = h('div', { class: 'pw-empty', text: 'Add a PDF to preview its pages.' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Pages to remove' }), h('span', { text: 'Selected pages will be deleted' })]),
        range,
        toolbar,
        gridWrap,
        outputName
    ]));
    ws.extra.appendChild(summary);

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
        range.control.value = '';
        await load();
    });

    async function load() {
        ws.setReady(false);
        gridWrap.className = 'pw-empty';
        gridWrap.textContent = 'Rendering page previews…';
        try {
            state.doc = await openPdf(ws.file, state.password);
            const thumbs = await renderThumbnails(ws.file, {
                maxWidth: 120,
                password: state.password,
                onProgress: (done, total) => { gridWrap.textContent = 'Rendering page ' + done + ' of ' + total + '…'; }
            });
            state.pages = thumbs.thumbnails;
            passwordBox.hide();
            renderGrid();
            updateState();
            ws.setStatus('');
        } catch (error) {
            state.doc = null;
            state.pages = [];
            gridWrap.className = 'pw-empty';
            gridWrap.textContent = error.code === 'PASSWORD_REQUIRED'
                ? 'This PDF is password-protected. Enter its password to continue.'
                : describeError(error);
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        }
    }

    function renderGrid() {
        gridWrap.innerHTML = '';
        if (!state.pages.length) {
            gridWrap.className = 'pw-empty';
            gridWrap.textContent = 'Add a PDF to preview its pages.';
            return;
        }
        gridWrap.className = '';
        const grid = h('div', { class: 'pw-pagegrid' });
        state.pages.forEach((page) => {
            const selected = state.selected.has(page.page);
            const tile = h('div', {
                class: 'pw-pagetile' + (selected ? ' is-selected' : ''),
                'data-page': page.page,
                role: 'button',
                tabindex: '0',
                'aria-pressed': String(selected),
                'aria-label': 'Page ' + page.page
            }, [
                h('div', { class: 'pw-pagetile__thumb' }, [
                    h('img', { src: page.url, alt: '', loading: 'lazy', draggable: 'false', style: rotationStyle(page.rotation) }),
                    h('span', { class: 'pw-pagetile__num', text: page.page }),
                    h('span', { class: 'pw-pagetile__badge', text: 'Delete' })
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

    function syncFromSelection() {
        const sorted = Array.from(state.selected).sort((a, b) => a - b);
        range.control.value = indicesToRanges(sorted.map((page) => page - 1));
        paintSelection();
    }

    function paintSelection() {
        gridWrap.querySelectorAll('.pw-pagetile').forEach((tile) => {
            const selected = state.selected.has(Number(tile.dataset.page));
            tile.classList.toggle('is-selected', selected);
            tile.setAttribute('aria-pressed', String(selected));
        });
        updateState();
    }

    function selectAll(mode) {
        if (!state.pages.length) return;
        if (mode === 'all') state.pages.forEach((page) => state.selected.add(page.page));
        if (mode === 'none') state.selected.clear();
        if (mode === 'invert') {
            const next = new Set();
            state.pages.forEach((page) => { if (!state.selected.has(page.page)) next.add(page.page); });
            state.selected = next;
        }
        syncFromSelection();
    }

    function updateState() {
        const count = state.selected.size;
        const remaining = state.pages.length - count;
        const label = toolbar.querySelector('[data-count]');
        if (label) label.textContent = count + ' of ' + state.pages.length + ' marked for deletion';
        if (!state.pages.length) {
            summary.textContent = 'Add a PDF to get started.';
            summary.className = 'pw-note';
        } else if (!count) {
            summary.textContent = 'Pick at least one page to delete. ' + state.pages.length + ' pages will be kept.';
            summary.className = 'pw-note';
        } else if (remaining === 0) {
            summary.textContent = 'Every page is selected — a PDF must keep at least one page. Deselect one to continue.';
            summary.className = 'pw-note is-error';
        } else {
            summary.textContent = 'Deleting ' + count + ' page' + (count === 1 ? '' : 's') + ' · ' + remaining + ' page' + (remaining === 1 ? '' : 's') + ' will remain.';
            summary.className = 'pw-note is-success';
        }
        ws.setReady(!!state.doc && count > 0 && remaining > 0);
    }

    function rotationStyle(rotation) {
        const angle = ((rotation || 0) % 360 + 360) % 360;
        if (!angle) return '';
        return 'transform: rotate(' + angle + 'deg)' + (angle === 90 || angle === 270 ? ' scale(0.7)' : '');
    }

    ws.onRun(async () => {
        if (!state.doc || !state.selected.size) return;
        const remaining = state.pages.map((page) => page.page).filter((page) => !state.selected.has(page));
        if (!remaining.length) {
            ws.setStatus('A PDF must keep at least one page.', 'error');
            return;
        }
        const { PDFDocument } = window.PDFLib;
        const base = sanitizeName(outputName.control.value, 'pages-removed');
        ws.setBusy(true, 'Removing pages…');
        ws.setProgress(35, 'Copying ' + remaining.length + ' pages…');
        const doc = await PDFDocument.create();
        const copied = await doc.copyPages(state.doc, remaining.map((page) => page - 1));
        copied.forEach((page) => doc.addPage(page));
        const bytes = await doc.save({ useObjectStreams: true });
        const filename = base + '.pdf';
        downloadBytes(bytes, filename);
        ws.setProgress(100, 'Complete');
        ws.setBusy(false);
        renderResult(ws.result, {
            title: 'Removed ' + state.selected.size + ' page' + (state.selected.size === 1 ? '' : 's'),
            subtitle: filename + ' · ' + formatBytes(bytes.length),
            rows: [
                { label: 'Pages removed', value: String(state.selected.size) },
                { label: 'Pages kept', value: String(remaining.length) },
                { label: 'Size', value: formatBytes(bytes.length) }
            ],
            actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
        });
    });

    ws.onReset(() => {
        state.doc = null;
        state.pages = [];
        state.selected.clear();
        range.control.value = '';
        gridWrap.className = 'pw-empty';
        gridWrap.textContent = 'Add a PDF to preview its pages.';
        updateState();
    });
}
