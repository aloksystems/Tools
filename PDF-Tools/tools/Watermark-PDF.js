import { openPdf, renderThumbnails, rangeToIndices, sanitizeName, formatBytes, downloadBytes, hexColor, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, colorField, rangeField, passwordPrompt, renderResult, note } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to watermark',
        hint: 'Add a text or image watermark with full control',
        runLabel: 'Apply watermark'
    });

    const state = { doc: null, pages: 0, password: undefined, type: 'text', image: null, thumb: null, imageName: '' };

    const typeTabs = segmented({
        label: 'Watermark type',
        value: 'text',
        options: [{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }],
        onChange: (value) => {
            state.type = value;
            textGroup.hidden = value !== 'text';
            imageGroup.hidden = value !== 'image';
            updatePreview();
        }
    });

    const textInput = field({ label: 'Watermark text', value: 'CONFIDENTIAL' });
    const fontSize = field({ label: 'Font size', type: 'number', value: 48, min: 8, max: 160 });
    const textColor = colorField({ label: 'Colour', value: '#dc2626' });
    const textGroup = h('div', { class: 'pw-stack' }, [
        textInput,
        h('div', { class: 'pw-grid' }, [fontSize, textColor])
    ]);

    const imageInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
    const imageButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost', text: 'Choose image', onclick: () => imageInput.click() });
    const imageName = h('span', { class: 'pw-hint', text: 'PNG with transparency works best.' });
    const imageScale = rangeField({ label: 'Image width', value: 40, min: 5, max: 100, suffix: '%', onInput: updatePreview });
    const imageGroup = h('div', { class: 'pw-stack', hidden: true }, [
        h('div', { class: 'pw-inline' }, [imageButton, imageName]),
        imageInput,
        imageScale
    ]);

    const rotation = rangeField({ label: 'Rotation', value: -35, min: -90, max: 90, suffix: '°', onInput: updatePreview });
    const opacity = rangeField({ label: 'Opacity', value: 35, min: 5, max: 100, suffix: '%', onInput: updatePreview });
    const layout = segmented({
        label: 'Layout',
        value: 'center',
        options: [{ value: 'center', label: 'Centred' }, { value: 'tile', label: 'Tiled' }],
        onChange: updatePreview
    });
    const range = field({ label: 'Pages', value: 'all', hint: 'Use all, odd, even, or a range like 1-5' });
    const outputName = field({ label: 'Output file name', value: 'watermarked' });

    const previewEmpty = h('div', { class: 'pw-empty', text: 'Add a PDF to preview the watermark.' });
    const previewImage = h('img', { alt: 'Watermark preview', hidden: true });
    const previewBox = h('div', { class: 'pw-num-preview', hidden: true }, [previewImage]);
    const preview = h('div', { class: 'pw-col' }, [previewEmpty, previewBox]);
    const previewNote = h('p', { class: 'pw-note', text: 'Tiled layout is shown in full only in the exported PDF.' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Watermark' }), h('span', { text: 'Text or image' })]),
        h('div', { class: 'pw-columns' }, [
            h('div', { class: 'pw-col' }, [
                typeTabs,
                textGroup,
                imageGroup,
                h('div', { class: 'pw-grid' }, [rotation, opacity]),
                layout,
                range,
                outputName
            ]),
            h('div', { class: 'pw-col' }, [preview, previewNote])
        ])
    ]));
    ws.extra.appendChild(note('Watermarks are drawn above the page content. Lower opacity keeps the document readable.'));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    [textInput.control, fontSize.control, textColor.control, range.control].forEach((control) => {
        control.addEventListener('input', updatePreview);
        control.addEventListener('change', updatePreview);
    });
    imageInput.addEventListener('change', async () => {
        const file = imageInput.files && imageInput.files[0];
        if (!file) return;
        try {
            state.image = await imageToData(file);
            state.imageName = file.name;
            imageName.textContent = file.name;
            updatePreview();
        } catch (error) {
            ws.setStatus(describeError(error), 'error');
        }
    });

    ws.onFiles(async (file) => {
        state.password = undefined;
        state.thumb = null;
        await load();
    });

    async function load() {
        ws.setReady(false);
        previewEmpty.hidden = false;
        previewEmpty.textContent = 'Reading pages…';
        previewBox.hidden = true;
        try {
            state.doc = await openPdf(ws.file, state.password);
            state.pages = state.doc.getPageCount();
            const thumbs = await renderThumbnails(ws.file, { maxWidth: 340, pages: [1], password: state.password });
            state.thumb = thumbs.thumbnails[0] || null;
            passwordBox.hide();
            buildPreview();
            ws.setStatus('');
            ws.setReady(true);
        } catch (error) {
            state.doc = null;
            previewEmpty.hidden = false;
            previewEmpty.textContent = error.code === 'PASSWORD_REQUIRED' ? 'This PDF is password-protected. Enter its password to continue.' : describeError(error);
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        }
    }

    function buildPreview() {
        if (!state.thumb) return;
        previewEmpty.hidden = true;
        previewBox.hidden = false;
        previewImage.src = state.thumb.url;
        updatePreview();
    }

    function updatePreview() {
        if (!state.thumb || previewBox.hidden) return;
        const existing = previewBox.querySelector('.pw-wm');
        if (existing) existing.remove();
        const pageWidth = state.thumb.viewportWidth;
        const pageHeight = state.thumb.viewportHeight;
        const thumbWidth = state.thumb.width;
        if (state.type === 'text') {
            const element = h('span', {
                class: 'pw-wm',
                text: textInput.control.value || 'Watermark',
                style: [
                    'font-size:' + Math.max(6, (Number(fontSize.control.value) || 48) / pageWidth * thumbWidth) + 'px',
                    'color:' + textColor.control.value,
                    'opacity:' + (Number(opacity.control.value) / 100),
                    'transform:translate(-50%,-50%) rotate(' + Number(rotation.control.value) + 'deg)'
                ].join(';')
            });
            previewBox.appendChild(element);
        } else if (state.image) {
            const widthPercent = Number(imageScale.control.value);
            const element = h('img', {
                class: 'pw-wm',
                src: state.image.dataUrl,
                alt: 'Watermark preview',
                style: [
                    'width:' + widthPercent + '%',
                    'opacity:' + (Number(opacity.control.value) / 100),
                    'transform:translate(-50%,-50%) rotate(' + Number(rotation.control.value) + 'deg)'
                ].join(';')
            });
            previewBox.appendChild(element);
        }
    }

    function imageToData(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
                const maxWidth = 1200;
                const scale = Math.min(1, maxWidth / image.naturalWidth);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve({ dataUrl: canvas.toDataURL('image/png'), aspect: canvas.width / canvas.height });
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('That image could not be read.'));
            };
            image.src = url;
        });
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const indices = rangeToIndices(range.control.value, state.pages);
        if (!indices.length) {
            ws.setStatus('That page range does not include any pages.', 'error');
            return;
        }
        if (state.type === 'image' && !state.image) {
            ws.setStatus('Choose a watermark image first.', 'error');
            return;
        }
        const base = sanitizeName(outputName.control.value, 'watermarked');
        const { degrees } = window.PDFLib;
        ws.setBusy(true, 'Applying watermark…');
        try {
            let embeddedImage = null;
            let font = null;
            if (state.type === 'image') {
                embeddedImage = await state.doc.embedPng(state.image.dataUrl);
            } else {
                font = await state.doc.embedFont(window.PDFLib.StandardFonts.HelveticaBold);
            }
            const color = hexColor(textColor.control.value, window.PDFLib);
            const angle = Number(rotation.control.value) || 0;
            const alpha = Math.max(0.05, Math.min(1, Number(opacity.control.value) / 100));
            const size = Math.max(8, Number(fontSize.control.value) || 48);
            indices.forEach((index, order) => {
                const page = state.doc.getPage(index);
                const { width, height } = page.getSize();
                if (state.type === 'text') {
                    const text = textInput.control.value || 'Watermark';
                    const textWidth = font.widthOfTextAtSize(text, size);
                    if (layout.value === 'tile') {
                        const stepX = Math.max(textWidth + size * 2, width / 3);
                        const stepY = size * 3.4;
                        for (let y = size; y < height + stepY; y += stepY) {
                            for (let x = -size; x < width + stepX; x += stepX) {
                                page.drawText(text, { x, y, size, font, color, opacity: alpha, rotate: degrees(angle) });
                            }
                        }
                    } else {
                        page.drawText(text, {
                            x: width / 2 - textWidth / 2,
                            y: height / 2 - size / 3,
                            size,
                            font,
                            color,
                            opacity: alpha,
                            rotate: degrees(angle)
                        });
                    }
                } else {
                    const imageWidth = width * (Number(imageScale.control.value) / 100);
                    const imageHeight = imageWidth / state.image.aspect;
                    if (layout.value === 'tile') {
                        const stepX = imageWidth * 1.35;
                        const stepY = imageHeight * 1.7;
                        for (let y = -imageHeight; y < height + stepY; y += stepY) {
                            for (let x = -imageWidth; x < width + stepX; x += stepX) {
                                page.drawImage(embeddedImage, { x, y, width: imageWidth, height: imageHeight, opacity: alpha, rotate: degrees(angle) });
                            }
                        }
                    } else {
                        page.drawImage(embeddedImage, {
                            x: (width - imageWidth) / 2,
                            y: (height - imageHeight) / 2,
                            width: imageWidth,
                            height: imageHeight,
                            opacity: alpha,
                            rotate: degrees(angle)
                        });
                    }
                }
                if (order % 10 === 0) ws.setProgress((order / indices.length) * 90, 'Watermarking page ' + (index + 1) + '…');
            });
            const bytes = await state.doc.save({ useObjectStreams: true });
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'Watermark applied',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Pages', value: String(indices.length) },
                    { label: 'Type', value: state.type === 'text' ? 'Text' : 'Image' },
                    { label: 'Layout', value: layout.value === 'tile' ? 'Tiled' : 'Centred' },
                    { label: 'Opacity', value: opacity.control.value + '%' }
                ],
                actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
            });
        } catch (error) {
            ws.setBusy(false);
            throw error;
        }
    });
}
