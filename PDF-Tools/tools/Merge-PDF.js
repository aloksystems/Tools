import { loadPdfLib, openPdf, renderThumbnails, rangeToIndices, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, passwordPrompt, renderResult, icon, iconMarkup } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        mode: 'multi',
        accept: '.pdf,application/pdf',
        prompt: 'Drop PDFs here or click to browse',
        hint: 'Add two or more PDFs — order can be changed after adding',
        runLabel: 'Merge PDFs'
    });

    const state = { items: [], loading: 0 };
    const outputName = field({ label: 'Output file name', value: 'merged', hint: 'Saved as a .pdf file' });
    const summary = h('div', { class: 'pw-inline-note' }, [icon('files'), h('span', { text: 'Add PDFs to see the merge order.' })]);
    const options = h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Output' }), h('span', { text: 'Page ranges are optional' })]),
        h('div', { class: 'pw-grid' }, [outputName]),
        summary
    ]);
    ws.extra.appendChild(options);

    ws.onRun(async () => {
        if (!state.items.length) return;
        const pdfLib = await loadPdfLib();
        ws.setBusy(true, 'Merging…');
        ws.setProgress(6, 'Preparing pages…');
        const merged = await pdfLib.PDFDocument.create();
        const ranges = state.items.map((item) => {
            const indices = item.range.trim() ? rangeToIndices(item.range, item.pages) : Array.from({ length: item.pages }, (_, index) => index);
            return { item, indices };
        }).filter((entry) => entry.indices.length);
        if (!ranges.length) throw new Error('None of the page ranges contain a valid page.');
        let done = 0;
        const total = ranges.reduce((sum, entry) => sum + entry.indices.length, 0);
        for (const entry of ranges) {
            const copied = await merged.copyPages(entry.item.doc, entry.indices);
            copied.forEach((page) => merged.addPage(page));
            done += entry.indices.length;
            ws.setProgress(6 + (done / total) * 88, 'Copied ' + done + ' of ' + total + ' pages…');
        }
        const bytes = await merged.save({ useObjectStreams: true });
        const filename = sanitizeName(outputName.control.value, 'merged') + '.pdf';
        ws.setProgress(100, 'Complete');
        downloadBytes(bytes, filename);
        ws.setBusy(false);
        renderResult(ws.result, {
            title: 'Merged ' + state.items.length + ' PDFs',
            subtitle: filename + ' · ' + formatBytes(bytes.length),
            rows: [
                { label: 'Pages', value: String(total) },
                { label: 'Files', value: String(state.items.length) },
                { label: 'Size', value: formatBytes(bytes.length) }
            ],
            actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
        });
    });

    ws.onReset(() => {
        state.items = [];
        ws.queue.innerHTML = '';
        updateState();
    });

    ws.onFiles(async (files) => {
        for (const file of files) {
            if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') continue;
            const item = {
                file,
                name: file.name,
                size: file.size,
                doc: null,
                pages: 0,
                range: '',
                password: undefined,
                loading: true,
                error: '',
                thumb: ''
            };
            state.items.push(item);
            renderQueue();
            await loadItem(item);
        }
        updateState();
    });

    async function loadItem(item) {
        try {
            item.doc = await openPdf(item.file, item.password);
            item.pages = item.doc.getPageCount();
            item.error = '';
            try {
                const thumbs = await renderThumbnails(item.file, { maxWidth: 80, password: item.password, pages: [1] });
                item.thumb = thumbs.thumbnails[0] ? thumbs.thumbnails[0].url : '';
            } catch (error) {
                item.thumb = '';
            }
        } catch (error) {
            item.doc = null;
            item.pages = 0;
            item.error = error.code === 'PASSWORD_REQUIRED' ? 'PASSWORD_REQUIRED' : describeError(error);
        }
        item.loading = false;
        renderQueue();
        updateState();
    }

    function renderQueue() {
        ws.queue.innerHTML = '';
        state.items.forEach((item, index) => {
            const row = h('div', { class: 'pw-docrow', draggable: 'true' }, [
                h('div', { class: 'pw-docrow__thumb' }, item.thumb ? [h('img', { src: item.thumb, alt: '' })] : [h('span', { text: 'PDF' })]),
                h('div', { class: 'pw-docrow__body' }, [
                    h('strong', { text: item.name }),
                    h('span', {
                        text: item.loading ? 'Reading…' : item.error && item.error !== 'PASSWORD_REQUIRED'
                            ? item.error
                            : item.error === 'PASSWORD_REQUIRED'
                                ? 'Password required'
                                : item.pages + ' pages · ' + formatBytes(item.size)
                    }),
                    item.error === 'PASSWORD_REQUIRED'
                        ? passwordPrompt(h('div'), async (password) => {
                            item.password = password;
                            item.loading = true;
                            renderQueue();
                            await loadItem(item);
                            if (item.error === 'PASSWORD_REQUIRED') throw new Error('Could not unlock this PDF.');
                        })
                        : null
                ]),
                h('label', { class: 'pw-docrow__range' }, [
                    h('span', { text: 'Pages' }),
                    h('input', {
                        class: 'pw-input', type: 'text', placeholder: 'All', value: item.range,
                        oninput: (event) => { item.range = event.target.value; updateState(); }
                    })
                ]),
                h('div', { class: 'pw-docrow__actions' }, [
                    h('button', {
                        type: 'button', class: 'pw-iconbtn', title: 'Move up', html: iconMarkup('arrow-up'),
                        onclick: () => move(index, -1)
                    }),
                    h('button', {
                        type: 'button', class: 'pw-iconbtn', title: 'Move down', html: iconMarkup('arrow-down'),
                        onclick: () => move(index, 1)
                    }),
                    h('button', {
                        type: 'button', class: 'pw-iconbtn pw-iconbtn--danger', title: 'Remove', html: iconMarkup('trash'),
                        onclick: () => { state.items.splice(index, 1); renderQueue(); updateState(); }
                    })
                ])
            ]);
            const prompt = row.querySelector('.pw-password');
            if (prompt) prompt.show();
            row.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', String(index));
                row.classList.add('is-dragging');
            });
            row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
            row.addEventListener('dragover', (event) => event.preventDefault());
            row.addEventListener('drop', (event) => {
                event.preventDefault();
                const from = Number(event.dataTransfer.getData('text/plain'));
                if (!Number.isInteger(from) || from === index) return;
                state.items.splice(index, 0, state.items.splice(from, 1)[0]);
                renderQueue();
                updateState();
            });
            ws.queue.appendChild(row);
        });
    }

    function move(index, direction) {
        const target = index + direction;
        if (target < 0 || target >= state.items.length) return;
        state.items.splice(target, 0, state.items.splice(index, 1)[0]);
        renderQueue();
        updateState();
    }

    function updateState() {
        const ready = state.items.length > 0 && state.items.every((item) => item.doc && !item.loading && item.error !== 'PASSWORD_REQUIRED');
        const total = state.items.reduce((sum, item) => {
            if (!item.doc) return sum;
            const indices = item.range.trim() ? rangeToIndices(item.range, item.pages) : Array.from({ length: item.pages }, (_, index) => index);
            return sum + indices.length;
        }, 0);
        summary.innerHTML = '';
        summary.appendChild(icon('files'));
        summary.appendChild(h('span', {
            text: state.items.length
                ? state.items.length + ' file' + (state.items.length === 1 ? '' : 's') + ' · ' + total + ' page' + (total === 1 ? '' : 's') + ' will be merged'
                : 'Add PDFs to see the merge order.'
        }));
        ws.setReady(ready);
    }

    updateState();
}
