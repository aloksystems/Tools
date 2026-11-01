import { openPdf, renderThumbnails, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, passwordPrompt, renderResult, icon } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to rotate',
        hint: 'Click a page to rotate it 90°',
        runLabel: 'Save rotated PDF'
    });

    const state = { file: null, doc: null, password: undefined, pages: [], rotations: new Map(), loading: false };

    const toolbar = h('div', { class: 'pw-toolbar' }, [
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: '↺ Rotate all left', onclick: () => rotateAll(-90) }),
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: '↻ Rotate all right', onclick: () => rotateAll(90) }),
        h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Reset', onclick: () => { state.rotations.clear(); renderGrid(); } }),
        h('span', { class: 'pw-toolbar__spacer' }),
        h('span', { class: 'pw-toolbar__label', text: 'Click a page to rotate' })
    ]);
    const outputName = field({ label: 'Output file name', value: 'rotated' });
    const gridWrap = h('div', { class: 'pw-empty', text: 'Add a PDF to preview its pages.' });
    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Pages' }), h('span', { text: 'Preview updates as you rotate' })]),
        toolbar,
        gridWrap,
        h('div', { class: 'pw-grid' }, [outputName])
    ]));
    toolbar.style.display = 'none';
    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        if (!state.file) return;
        state.password = password;
        state.loading = true;
        await load();
    });

    ws.onFiles(async (file) => {
        state.file = file;
        state.password = undefined;
        state.rotations.clear();
        state.pages = [];
        await load();
    });

    async function load() {
        state.loading = true;
        ws.setReady(false);
        gridWrap.className = 'pw-empty';
        gridWrap.textContent = 'Reading pages…';
        try {
            state.doc = await openPdf(state.file, state.password);
            const thumbs = await renderThumbnails(state.file, {
                maxWidth: 130,
                password: state.password,
                onProgress: (done, total) => {
                    gridWrap.textContent = 'Rendering page ' + done + ' of ' + total + '…';
                }
            });
            state.pages = thumbs.thumbnails;
            state.rotations.clear();
            passwordBox.hide();
            toolbar.style.display = '';
            renderGrid();
            ws.setStatus('');
            ws.setReady(true);
        } catch (error) {
            state.doc = null;
            state.pages = [];
            ws.setReady(false);
            if (error.code === 'PASSWORD_REQUIRED') {
                passwordBox.show();
                gridWrap.textContent = 'This PDF is password-protected.';
            } else {
                gridWrap.textContent = describeError(error);
                ws.setStatus(describeError(error), 'error');
            }
        } finally {
            state.loading = false;
        }
    }

    function deltaFor(page) {
        return state.rotations.get(page) || 0;
    }

    function angleClass(angle) {
        return 'transform: rotate(' + angle + 'deg) ' + (angle === 90 || angle === 270 ? 'scale(0.7)' : '');
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
            const delta = deltaFor(page.page);
            const total = ((page.rotation + delta) % 360 + 360) % 360;
            const tile = h('div', { class: 'pw-pagetile', role: 'button', tabindex: '0', 'aria-label': 'Rotate page ' + page.page }, [
                h('div', { class: 'pw-pagetile__thumb' }, [
                    h('img', { src: page.url, alt: '', loading: 'lazy', draggable: 'false', style: angleClass(total) }),
                    h('span', { class: 'pw-pagetile__num', text: page.page }),
                    delta ? h('span', { class: 'pw-pagetile__badge', text: (delta > 0 ? '+' : '') + delta + '°' }) : null
                ])
            ]);
            const rotate = () => {
                state.rotations.set(page.page, ((delta + 90) % 360 + 360) % 360);
                renderGrid();
            };
            tile.addEventListener('click', rotate);
            tile.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    rotate();
                }
            });
            grid.appendChild(tile);
        });
        gridWrap.appendChild(grid);
    }

    function rotateAll(amount) {
        state.pages.forEach((page) => {
            const current = deltaFor(page.page);
            state.rotations.set(page.page, ((current + amount) % 360 + 360) % 360);
        });
        renderGrid();
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        ws.setBusy(true, 'Rotating pages…');
        ws.setProgress(25, 'Applying rotation…');
        const { degrees } = window.PDFLib;
        const pages = state.doc.getPages();
        let changed = 0;
        pages.forEach((page, index) => {
            const delta = state.rotations.get(index + 1) || 0;
            if (!delta) return;
            const current = page.getRotation();
            page.setRotation(degrees(((current.angle + delta) % 360 + 360) % 360));
            changed += 1;
        });
        ws.setProgress(75, 'Saving…');
        const bytes = await state.doc.save({ useObjectStreams: true });
        const filename = sanitizeName(outputName.control.value, 'rotated') + '.pdf';
        downloadBytes(bytes, filename);
        ws.setProgress(100, 'Complete');
        ws.setBusy(false);
        renderResult(ws.result, {
            title: changed ? 'Rotated ' + changed + ' page' + (changed === 1 ? '' : 's') : 'No rotation applied',
            subtitle: filename + ' · ' + formatBytes(bytes.length),
            rows: [
                { label: 'Pages', value: String(pages.length) },
                { label: 'Changed', value: String(changed) },
                { label: 'Size', value: formatBytes(bytes.length) }
            ],
            actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
        });
    });

    ws.onReset(() => {
        state.file = null;
        state.doc = null;
        state.pages = [];
        state.rotations.clear();
        toolbar.style.display = 'none';
        gridWrap.className = 'pw-empty';
        gridWrap.textContent = 'Add a PDF to preview its pages.';
    });
}
