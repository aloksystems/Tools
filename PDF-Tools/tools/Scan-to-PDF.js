import { loadImage, imageFileToCanvas, applyFilterToCanvas, buildPdfFromImages, mmToPt, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, rangeField, checkbox, renderResult, iconMarkup, note } from './ui.js';

const PAGE_OPTIONS = [
    { value: 'a4', label: 'A4 (210 × 297 mm)' },
    { value: 'letter', label: 'US Letter (8.5 × 11 in)' },
    { value: 'legal', label: 'US Legal (8.5 × 14 in)' },
    { value: 'a5', label: 'A5 (148 × 210 mm)' },
    { value: 'fit', label: 'Fit each scan' }
];

const FILTERS = [
    { value: 'none', label: 'Original' },
    { value: 'gray', label: 'Greyscale' },
    { value: 'contrast', label: 'Enhance' },
    { value: 'bw', label: 'B&W' }
];

export function render(panel) {
    const ws = createWorkspace(panel, {
        mode: 'multi',
        accept: 'image/*',
        prompt: 'Drop photos or scans here',
        hint: 'JPG, PNG, and phone photos — camera capture is supported',
        runLabel: 'Build scan PDF'
    });

    const state = { items: [], pageSize: 'a4', margin: 6, quality: 0.88, filter: 'none', trim: true };

    const cameraInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    const cameraButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Take photo' });
    const sizeSelect = h('select', { class: 'pw-select' }, PAGE_OPTIONS.map((option) => h('option', { value: option.value, text: option.label, selected: option.value === 'a4' })));
    const sizeField = field({ label: 'Page size', control: sizeSelect });
    const marginField = rangeField({ label: 'Page margin', min: 0, max: 20, value: 6, suffix: ' mm', onInput: (value) => { state.margin = Number(value); } });
    const qualityField = rangeField({ label: 'Image quality', min: 50, max: 100, value: 88, suffix: '%', onInput: (value) => { state.quality = Number(value) / 100; } });
    const filter = segmented({
        label: 'Clean-up filter',
        value: 'none',
        options: FILTERS,
        onChange: (value) => {
            state.filter = value;
            state.items.forEach((item) => { item.thumb = thumbnail(item.smallCanvas, value); });
            renderQueue();
        }
    });
    const trim = checkbox({ label: 'Trim white edges around each scan', checked: true });
    const outputName = field({ label: 'Output file name', value: 'scans' });
    const summary = h('div', { class: 'pw-inline-note', html: iconMarkup('info') + '<span>Add scans from your camera or gallery.</span>' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Capture' }), h('span', { text: 'Photos stay on this device' })]),
        h('div', { class: 'pw-inline' }, [cameraButton, cameraInput]),
        filter,
        trim,
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Page layout' }), h('span', { text: 'Applied when building the PDF' })]),
        h('div', { class: 'pw-grid' }, [sizeField, outputName]),
        h('div', { class: 'pw-grid' }, [marginField, qualityField]),
        summary,
        note('Good lighting gives the cleanest OCR and print results. B&W works best for documents; keep Original for photos.')
    ]));

    cameraButton.addEventListener('click', () => cameraInput.click());
    cameraInput.addEventListener('change', async () => {
        const files = Array.from(cameraInput.files || []);
        cameraInput.value = '';
        if (files.length) await addImages(files);
    });
    sizeSelect.addEventListener('change', () => {
        state.pageSize = sizeSelect.value;
        marginField.style.opacity = state.pageSize === 'fit' ? '0.5' : '1';
        updateSummary();
    });
    trim.control.addEventListener('change', () => { state.trim = trim.control.checked; });

    ws.onFiles(async (files) => {
        await addImages(files);
    });

    ws.onReset(() => {
        state.items = [];
        ws.queue.innerHTML = '';
        updateSummary();
    });

    async function addImages(files) {
        for (const file of files) {
            if (!/^image\//i.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(file.name)) continue;
            const item = { file, name: file.name, size: file.size, width: 0, height: 0, rotation: 0, thumb: '', smallCanvas: null, loading: true, error: '' };
            state.items.push(item);
            renderQueue();
            await prepare(item);
        }
        updateSummary();
    }

    async function prepare(item) {
        try {
            const image = await loadImage(item.file);
            item.width = image.naturalWidth || image.width;
            item.height = image.naturalHeight || image.height;
            const scale = Math.min(1, 200 / Math.max(item.width, item.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(item.width * scale));
            canvas.height = Math.max(1, Math.round(item.height * scale));
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            item.smallCanvas = canvas;
            item.thumb = thumbnail(canvas, state.filter);
        } catch (error) {
            item.error = describeError(error);
        }
        item.loading = false;
        renderQueue();
        updateSummary();
    }

    function thumbnail(canvas, effect) {
        if (!canvas) return '';
        const filtered = effect && effect !== 'none' ? applyFilterToCanvas(canvas, effect) : canvas;
        return filtered.toDataURL('image/jpeg', 0.78);
    }

    function renderQueue() {
        ws.queue.innerHTML = '';
        state.items.forEach((item, index) => {
            const rotation = ((item.rotation % 360) + 360) % 360;
            const row = h('div', { class: 'pw-docrow', draggable: 'true' }, [
                h('div', { class: 'pw-docrow__thumb' }, item.thumb
                    ? [h('img', { src: item.thumb, alt: '', style: 'transform: rotate(' + rotation + 'deg);' })]
                    : [h('span', { text: item.loading ? '…' : 'IMG' })]),
                h('div', { class: 'pw-docrow__body' }, [
                    h('strong', { text: item.name }),
                    h('span', {
                        text: item.error
                            ? item.error
                            : item.loading
                                ? 'Reading scan…'
                                : item.width + ' × ' + item.height + ' px' + (rotation ? ' · ' + rotation + '°' : '')
                    })
                ]),
                h('div', { class: 'pw-docrow__actions' }, [
                    h('button', {
                        type: 'button', class: 'pw-iconbtn', title: 'Rotate 90°', html: iconMarkup('rotate'),
                        onclick: () => { item.rotation = (rotation + 90) % 360; renderQueue(); }
                    }),
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
                        onclick: () => { state.items.splice(index, 1); renderQueue(); updateSummary(); }
                    })
                ])
            ]);
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
                updateSummary();
            });
            ws.queue.appendChild(row);
        });
    }

    function move(index, direction) {
        const target = index + direction;
        if (target < 0 || target >= state.items.length) return;
        state.items.splice(target, 0, state.items.splice(index, 1)[0]);
        renderQueue();
        updateSummary();
    }

    function updateSummary() {
        const ready = state.items.filter((item) => !item.loading && !item.error);
        const filterLabel = FILTERS.find((option) => option.value === state.filter).label;
        const layout = state.pageSize === 'fit' ? 'fit pages' : PAGE_OPTIONS.find((option) => option.value === state.pageSize).label.split(' (')[0];
        summary.innerHTML = iconMarkup('info') + '<span>' + (ready.length
            ? ready.length + ' scan' + (ready.length === 1 ? '' : 's') + ' · ' + ready.length + ' page' + (ready.length === 1 ? '' : 's') + ' · ' + layout + ' · ' + filterLabel
            : 'Add scans from your camera or gallery.') + '</span>';
        ws.setReady(ready.length > 0 && ready.length === state.items.length);
    }

    ws.onRun(async () => {
        if (!state.items.length) return;
        const fixed = state.pageSize !== 'fit';
        ws.setBusy(true, 'Cleaning up scans…');
        ws.setProgress(4, 'Preparing scans…');
        try {
            const items = [];
            for (let index = 0; index < state.items.length; index += 1) {
                const item = state.items[index];
                let canvas = await imageFileToCanvas(item.file, 3000);
                if (state.filter !== 'none') canvas = applyFilterToCanvas(canvas, state.filter);
                if (state.trim) canvas = trimWhite(canvas, 236, 10);
                items.push({ canvas, rotation: item.rotation });
                ws.setProgress(4 + ((index + 1) / state.items.length) * 66, 'Prepared scan ' + (index + 1) + ' of ' + state.items.length);
            }
            ws.setProgress(74, 'Writing PDF…');
            const bytes = await buildPdfFromImages(items, {
                pageSize: fixed ? state.pageSize : 'fit',
                orientation: fixed ? 'auto' : undefined,
                margin: fixed ? mmToPt(state.margin) : 0,
                quality: state.quality,
                fit: 'contain',
                background: '#ffffff'
            });
            const filename = sanitizeName(outputName.control.value, 'scans') + '.pdf';
            ws.setProgress(100, 'Complete');
            downloadBytes(bytes, filename);
            ws.setBusy(false);
            const layout = fixed ? PAGE_OPTIONS.find((option) => option.value === state.pageSize).label.split(' (')[0] : 'Fit to scan';
            renderResult(ws.result, {
                title: 'Created a ' + items.length + '-page scan PDF',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Pages', value: String(items.length) },
                    { label: 'Layout', value: layout },
                    { label: 'Filter', value: FILTERS.find((option) => option.value === state.filter).label },
                    { label: 'Size', value: formatBytes(bytes.length) }
                ],
                actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
            });
        } finally {
            ws.setBusy(false);
        }
    });

    function trimWhite(source, threshold, padding) {
        const context = source.getContext('2d');
        const width = source.width;
        const height = source.height;
        const pixels = context.getImageData(0, 0, width, height).data;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        const step = Math.max(1, Math.round(Math.max(width, height) / 1400));
        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                const offset = (y * width + x) * 4;
                if (pixels[offset + 3] < 10) continue;
                const luminance = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
                if (luminance >= threshold) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < minX || maxY < minY) return source;
        const pad = padding === undefined ? 10 : padding;
        const left = Math.max(0, minX - pad);
        const top = Math.max(0, minY - pad);
        const right = Math.min(width, maxX + pad + step);
        const bottom = Math.min(height, maxY + pad + step);
        if (right - left < width * 0.2 || bottom - top < height * 0.2) return source;
        if (left === 0 && top === 0 && right === width && bottom === height) return source;
        const trimmed = document.createElement('canvas');
        trimmed.width = right - left;
        trimmed.height = bottom - top;
        const target = trimmed.getContext('2d');
        target.fillStyle = '#ffffff';
        target.fillRect(0, 0, trimmed.width, trimmed.height);
        target.drawImage(source, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
        return trimmed;
    }

    updateSummary();
}
