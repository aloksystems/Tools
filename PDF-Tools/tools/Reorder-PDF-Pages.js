import { openPdf, renderThumbnails, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, passwordPrompt, renderResult } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to rearrange its pages',
        hint: 'Drag thumbnails, or use the arrows to move a page',
        runLabel: 'Save new order'
    });

    const state = { doc: null, pages: [], order: [], dragIndex: null, selected: null };

    const toolbar = h('div', { class: 'pw-toolbar' }, [
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Reverse order', onclick: reverse }),
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Restore original', onclick: restore }),
        h('span', { class: 'pw-toolbar__spacer' }),
        h('span', { class: 'pw-toolbar__label', 'data-count': '' })
    ]);
    const moveField = field({ label: 'Move selected page to position', value: '', placeholder: 'e.g. 1', type: 'number', min: 1, inputmode: 'numeric' });
    const moveButton = h('button', {
        type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Move', disabled: true,
        onclick: () => moveSelected(Number(moveField.control.value))
    });
    moveField.control.addEventListener('input', () => {
        moveButton.disabled = !state.selected || !moveField.control.value;
    });
    const outputName = field({ label: 'Output file name', value: 'reordered' });
    const gridWrap = h('div', { class: 'pw-empty', text: 'Add a PDF to preview its pages.' });
    const summary = h('p', { class: 'pw-note', text: 'Drag a thumbnail onto another page to insert it at that position.' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Page order' }), h('span', { text: 'The first thumbnail becomes page 1' })]),
        toolbar,
        gridWrap,
        h('div', { class: 'pw-grid' }, [
            h('div', { class: 'pw-inline' }, [moveField, moveButton]),
            outputName
        ])
    ]));
    ws.extra.appendChild(summary);

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    ws.onFiles(async (file) => {
        state.password = undefined;
        state.selected = null;
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
            state.order = state.pages.map((page) => page.page);
            passwordBox.hide();
            renderGrid();
            updateState();
            ws.setStatus('');
        } catch (error) {
            state.doc = null;
            state.pages = [];
            state.order = [];
            gridWrap.className = 'pw-empty';
            gridWrap.textContent = error.code === 'PASSWORD_REQUIRED'
                ? 'This PDF is password-protected. Enter its password to continue.'
                : describeError(error);
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        }
    }

    function pageInfo(pageNumber) {
        return state.pages.find((page) => page.page === pageNumber);
    }

    function renderGrid() {
        gridWrap.innerHTML = '';
        if (!state.order.length) {
            gridWrap.className = 'pw-empty';
            gridWrap.textContent = 'Add a PDF to preview its pages.';
            return;
        }
        gridWrap.className = '';
        const grid = h('div', { class: 'pw-pagegrid' });
        state.order.forEach((pageNumber, index) => {
            const page = pageInfo(pageNumber);
            const selected = state.selected === pageNumber;
            const tile = h('div', {
                class: 'pw-pagetile pw-pagetile--reorder' + (selected ? ' is-selected' : ''),
                'data-page': pageNumber,
                'data-index': index,
                draggable: 'true',
                role: 'button',
                tabindex: '0',
                'aria-pressed': String(selected),
                'aria-label': 'Page ' + pageNumber + ', position ' + (index + 1)
            }, [
                h('div', { class: 'pw-pagetile__thumb' }, [
                    h('img', { src: page.url, alt: '', loading: 'lazy', draggable: 'false', style: rotationStyle(page.rotation) }),
                    h('span', { class: 'pw-pagetile__num', text: pageNumber }),
                    h('span', { class: 'pw-pagetile__badge', text: '#' + (index + 1) })
                ]),
                h('div', { class: 'pw-pagetile__actions' }, [
                    h('button', {
                        type: 'button', class: 'pw-iconbtn', title: 'Move left', disabled: index === 0 ? true : null,
                        html: window.PDFStudio ? window.PDFStudio.iconSvg('arrow-left') : '&#8592;',
                        onclick: (event) => { event.stopPropagation(); move(index, index - 1); }
                    }),
                    h('button', {
                        type: 'button', class: 'pw-iconbtn', title: 'Move right', disabled: index === state.order.length - 1 ? true : null,
                        html: window.PDFStudio ? window.PDFStudio.iconSvg('arrow-right') : '&#8594;',
                        onclick: (event) => { event.stopPropagation(); move(index, index + 1); }
                    })
                ])
            ]);
            tile.addEventListener('click', (event) => {
                if (event.target.closest('button')) return;
                state.selected = state.selected === pageNumber ? null : pageNumber;
                moveButton.disabled = !state.selected || !moveField.control.value;
                renderGrid();
                updateState();
            });
            tile.addEventListener('keydown', (event) => {
                if (event.target.closest('button')) return;
                if (event.key === 'ArrowLeft') { event.preventDefault(); move(index, index - 1); }
                if (event.key === 'ArrowRight') { event.preventDefault(); move(index, index + 1); }
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    state.selected = state.selected === pageNumber ? null : pageNumber;
                    renderGrid();
                    updateState();
                }
            });
            tile.addEventListener('dragstart', (event) => {
                state.dragIndex = index;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(index));
                tile.classList.add('is-dragging');
            });
            tile.addEventListener('dragend', () => {
                state.dragIndex = null;
                tile.classList.remove('is-dragging');
            });
            tile.addEventListener('dragover', (event) => {
                event.preventDefault();
                tile.classList.add('is-drop-target');
            });
            tile.addEventListener('dragleave', () => tile.classList.remove('is-drop-target'));
            tile.addEventListener('drop', (event) => {
                event.preventDefault();
                tile.classList.remove('is-drop-target');
                const from = state.dragIndex !== null ? state.dragIndex : Number(event.dataTransfer.getData('text/plain'));
                if (!Number.isInteger(from) || from === index) return;
                const [moved] = state.order.splice(from, 1);
                state.order.splice(index, 0, moved);
                state.dragIndex = null;
                renderGrid();
                updateState();
            });
            grid.appendChild(tile);
        });
        gridWrap.appendChild(grid);
    }

    function move(from, to) {
        if (to < 0 || to >= state.order.length || from === to) return;
        const [moved] = state.order.splice(from, 1);
        state.order.splice(to, 0, moved);
        renderGrid();
        updateState();
    }

    function moveSelected(position) {
        if (!state.selected) return;
        const from = state.order.indexOf(state.selected);
        if (from < 0) return;
        const target = Math.max(0, Math.min(state.order.length, position - 1));
        move(from, target);
        moveField.control.value = '';
        moveButton.disabled = true;
    }

    function reverse() {
        if (!state.order.length) return;
        state.order.reverse();
        renderGrid();
        updateState();
    }

    function restore() {
        if (!state.pages.length) return;
        state.order = state.pages.map((page) => page.page);
        renderGrid();
        updateState();
    }

    function isChanged() {
        return state.order.some((page, index) => page !== index + 1);
    }

    function updateState() {
        const label = toolbar.querySelector('[data-count]');
        if (label) label.textContent = state.order.length + ' page' + (state.order.length === 1 ? '' : 's');
        if (!state.order.length) {
            summary.textContent = 'Add a PDF to get started.';
            summary.className = 'pw-note';
        } else if (isChanged()) {
            summary.textContent = state.selected
                ? 'Page ' + state.selected + ' selected — drag it, use the arrows, or type a new position.'
                : 'Order changed. Drag any thumbnail to fine-tune, then save.';
            summary.className = 'pw-note is-success';
        } else {
            summary.textContent = 'Drag a thumbnail onto another page to insert it at that position.';
            summary.className = 'pw-note';
        }
        ws.setReady(!!state.doc && isChanged());
    }

    function rotationStyle(rotation) {
        const angle = ((rotation || 0) % 360 + 360) % 360;
        if (!angle) return '';
        return 'transform: rotate(' + angle + 'deg)' + (angle === 90 || angle === 270 ? ' scale(0.7)' : '');
    }

    ws.onRun(async () => {
        if (!state.doc || !state.order.length) return;
        const { PDFDocument } = window.PDFLib;
        const base = sanitizeName(outputName.control.value, 'reordered');
        ws.setBusy(true, 'Reordering pages…');
        ws.setProgress(35, 'Copying ' + state.order.length + ' pages in the new order…');
        const doc = await PDFDocument.create();
        const copied = await doc.copyPages(state.doc, state.order.map((page) => page - 1));
        copied.forEach((page) => doc.addPage(page));
        const bytes = await doc.save({ useObjectStreams: true });
        const filename = base + '.pdf';
        downloadBytes(bytes, filename);
        ws.setProgress(100, 'Complete');
        ws.setBusy(false);
        renderResult(ws.result, {
            title: 'Pages reordered',
            subtitle: filename + ' · ' + formatBytes(bytes.length),
            rows: [
                { label: 'Pages', value: String(state.order.length) },
                { label: 'New first page', value: 'Page ' + state.order[0] },
                { label: 'Size', value: formatBytes(bytes.length) }
            ],
            actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
        });
    });

    ws.onReset(() => {
        state.doc = null;
        state.pages = [];
        state.order = [];
        state.selected = null;
        state.dragIndex = null;
        moveField.control.value = '';
        moveButton.disabled = true;
        gridWrap.className = 'pw-empty';
        gridWrap.textContent = 'Add a PDF to preview its pages.';
        updateState();
    });
}
