import { loadImage, imageFileToCanvas, buildPdfFromImages, mmToPt, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, rangeField, renderResult, iconMarkup, note } from './ui.js';

const PAGE_OPTIONS = [
    { value: 'a4', label: 'A4 (210 × 297 mm)' },
    { value: 'letter', label: 'US Letter (8.5 × 11 in)' },
    { value: 'legal', label: 'US Legal (8.5 × 14 in)' },
    { value: 'a3', label: 'A3 (297 × 420 mm)' },
    { value: 'a5', label: 'A5 (148 × 210 mm)' },
    { value: 'fit', label: 'Fit each image (no fixed page)' }
];

export function render(panel) {
    const ws = createWorkspace(panel, {
        mode: 'multi',
        accept: 'image/jpeg,image/png,image/webp,image/*',
        prompt: 'Drop images here or click to browse',
        hint: 'JPG, PNG, and WebP photos become PDF pages — order can be changed',
        runLabel: 'Create PDF'
    });

    const state = { items: [], pageSize: 'a4', orientation: 'auto', margin: 8, quality: 0.9, loaded: 0 };

    const sizeSelect = h('select', { class: 'pw-select' }, PAGE_OPTIONS.map((option) => h('option', { value: option.value, text: option.label, selected: option.value === 'a4' })));
    const sizeField = field({ label: 'Page size', control: sizeSelect });
    const orientation = segmented({
        label: 'Orientation',
        value: 'auto',
        options: [
            { value: 'auto', label: 'Auto' },
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' }
        ],
        onChange: (value) => { state.orientation = value; updateSummary(); }
    });
    const marginField = rangeField({
        label: 'Page margin',
        min: 0,
        max: 25,
        value: 8,
        suffix: ' mm',
        onInput: (value) => { state.margin = Number(value); }
    });
    const qualityField = rangeField({
        label: 'Image quality',
        min: 50,
        max: 100,
        value: 90,
        suffix: '%',
        onInput: (value) => { state.quality = Number(value) / 100; }
    });
    const outputName = field({ label: 'Output file name', value: 'images' });
    const summary = h('div', { class: 'pw-inline-note', html: iconMarkup('info') + '<span>Add images to build a document.</span>' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Page layout' }), h('span', { text: 'Applied to every image' })]),
        h('div', { class: 'pw-grid' }, [sizeField, outputName]),
        orientation,
        h('div', { class: 'pw-grid' }, [marginField, qualityField]),
        summary,
        note('Images are re-encoded and embedded on this device. Transparent areas are filled with white.')
    ]));

    sizeSelect.addEventListener('change', () => {
        state.pageSize = sizeSelect.value;
        const fixed = state.pageSize !== 'fit';
        orientation.style.opacity = fixed ? '1' : '0.5';
        marginField.style.opacity = fixed ? '1' : '0.5';
        updateSummary();
    });

    ws.onFiles(async (files) => {
        for (const file of files) {
            if (!/^image\//i.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)) continue;
            const item = { file, name: file.name, size: file.size, width: 0, height: 0, rotation: 0, thumb: '', loading: true, error: '' };
            state.items.push(item);
            renderQueue();
            await prepare(item);
        }
        updateSummary();
    });

    ws.onReset(() => {
        state.items = [];
        ws.queue.innerHTML = '';
        updateSummary();
    });

    async function prepare(item) {
        try {
            const image = await loadImage(item.file);
            item.width = image.naturalWidth || image.width;
            item.height = image.naturalHeight || image.height;
            const scale = Math.min(1, 180 / Math.max(item.width, item.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(item.width * scale));
            canvas.height = Math.max(1, Math.round(item.height * scale));
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            item.thumb = canvas.toDataURL('image/jpeg', 0.8);
        } catch (error) {
            item.error = describeError(error);
        }
        item.loading = false;
        renderQueue();
        updateSummary();
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
                                ? 'Reading image…'
                                : item.width + ' × ' + item.height + ' px · ' + formatBytes(item.size) + (rotation ? ' · ' + rotation + '°' : '')
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
        const label = state.pageSize === 'fit' ? 'fit pages' : PAGE_OPTIONS.find((option) => option.value === state.pageSize).label.split(' (')[0];
        summary.innerHTML = iconMarkup('info') + '<span>' + (ready.length
            ? ready.length + ' image' + (ready.length === 1 ? '' : 's') + ' · ' + ready.length + ' page' + (ready.length === 1 ? '' : 's') + ' · ' + label
            : 'Add images to build a document.') + '</span>';
        ws.setReady(ready.length > 0 && ready.length === state.items.length);
    }

    ws.onRun(async () => {
        if (!state.items.length) return;
        const output = sanitizeName(outputName.control.value, 'images');
        const fixed = state.pageSize !== 'fit';
        ws.setBusy(true, 'Building PDF…');
        ws.setProgress(4, 'Preparing images…');
        try {
            const items = [];
            for (let index = 0; index < state.items.length; index += 1) {
                const item = state.items[index];
                const canvas = await imageFileToCanvas(item.file, 2600);
                items.push({ canvas, rotation: item.rotation });
                ws.setProgress(4 + ((index + 1) / state.items.length) * 60, 'Prepared image ' + (index + 1) + ' of ' + state.items.length);
            }
            ws.setProgress(70, 'Writing PDF pages…');
            const bytes = await buildPdfFromImages(items, {
                pageSize: fixed ? state.pageSize : 'fit',
                orientation: fixed ? state.orientation : undefined,
                margin: fixed ? mmToPt(state.margin) : 0,
                quality: state.quality,
                fit: 'contain',
                background: '#ffffff'
            });
            const filename = output + '.pdf';
            ws.setProgress(100, 'Complete');
            downloadBytes(bytes, filename);
            ws.setBusy(false);
            const label = fixed ? PAGE_OPTIONS.find((option) => option.value === state.pageSize).label.split(' (')[0] + ' · ' + state.orientation : 'Fit to image';
            renderResult(ws.result, {
                title: 'Created a ' + items.length + '-page PDF',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Pages', value: String(items.length) },
                    { label: 'Layout', value: label },
                    { label: 'Size', value: formatBytes(bytes.length) }
                ],
                actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
            });
        } finally {
            ws.setBusy(false);
        }
    });

    updateSummary();
}
