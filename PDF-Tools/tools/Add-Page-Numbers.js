import { openPdf, renderThumbnails, rangeToIndices, sanitizeName, formatBytes, downloadBytes, hexColor, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, checkbox, colorField, passwordPrompt, renderResult, note } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to add page numbers',
        hint: 'Numbers stay editable — the original pages are untouched',
        runLabel: 'Add page numbers'
    });

    const state = { doc: null, pages: 0, password: undefined, thumb: null };

    const position = h('select', { class: 'pw-select' }, [
        h('option', { value: 'bottom-center', text: 'Bottom centre', selected: true }),
        h('option', { value: 'bottom-left', text: 'Bottom left' }),
        h('option', { value: 'bottom-right', text: 'Bottom right' }),
        h('option', { value: 'top-center', text: 'Top centre' }),
        h('option', { value: 'top-left', text: 'Top left' }),
        h('option', { value: 'top-right', text: 'Top right' })
    ]);
    const format = h('select', { class: 'pw-select' }, [
        h('option', { value: '1', text: '1', selected: true }),
        h('option', { value: 'Page 1', text: 'Page 1' }),
        h('option', { value: '1 of N', text: '1 of N' }),
        h('option', { value: 'Page 1 of N', text: 'Page 1 of N' }),
        h('option', { value: '- 1 -', text: '- 1 -' })
    ]);
    const startNumber = field({ label: 'Start at', type: 'number', value: 1, min: 1 });
    const fontSize = field({ label: 'Font size', type: 'number', value: 12, min: 6, max: 72 });
    const margin = field({ label: 'Margin (pt)', type: 'number', value: 28, min: 4, max: 200 });
    const font = segmented({
        label: 'Font',
        value: 'regular',
        options: [{ value: 'regular', label: 'Regular' }, { value: 'bold', label: 'Bold' }]
    });
    const color = colorField({ label: 'Colour', value: '#111827' });
    const range = field({ label: 'Pages', value: 'all', hint: 'Use all, odd, even, or a range like 2-10' });
    const skipFirst = checkbox({ label: 'Skip the first page (cover)' });
    const outputName = field({ label: 'Output file name', value: 'numbered' });

    const previewWrap = h('div', { class: 'pw-num-preview', hidden: true });
    const previewEmpty = h('div', { class: 'pw-empty', text: 'Add a PDF to preview the number position.' });
    const summary = h('p', { class: 'pw-note', text: 'A live preview appears after loading a PDF.' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Number style' }), h('span', { text: 'Live preview of page 1' })]),
        h('div', { class: 'pw-columns' }, [
            h('div', { class: 'pw-col' }, [
                h('div', { class: 'pw-grid' }, [field({ label: 'Position', control: position }), field({ label: 'Format', control: format })]),
                h('div', { class: 'pw-grid' }, [startNumber, fontSize, margin]),
                font,
                h('div', { class: 'pw-grid' }, [color, outputName]),
                range,
                skipFirst,
                summary
            ]),
            h('div', { class: 'pw-col' }, [previewEmpty, previewWrap])
        ])
    ]));
    ws.extra.appendChild(note('Page numbers are drawn on top of the page. Use a page range or “skip first page” to leave covers unnumbered.'));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    ['click', 'change', 'input'].forEach((eventName) => {
        [position, format, startNumber.control, fontSize.control, margin.control, color.control, range.control, skipFirst.control]
            .forEach((control) => control.addEventListener(eventName, updatePreview));
    });

    ws.onFiles(async (file) => {
        state.password = undefined;
        state.thumb = null;
        previewWrap.hidden = true;
        previewEmpty.hidden = false;
        await load();
    });

    async function load() {
        ws.setReady(false);
        previewEmpty.hidden = false;
        previewEmpty.textContent = 'Reading pages…';
        try {
            state.doc = await openPdf(ws.file, state.password);
            state.pages = state.doc.getPageCount();
            const thumbs = await renderThumbnails(ws.file, { maxWidth: 300, pages: [1], password: state.password });
            state.thumb = thumbs.thumbnails[0] || null;
            passwordBox.hide();
            buildPreview();
            updatePreview();
            ws.setStatus('');
            ws.setReady(true);
        } catch (error) {
            state.doc = null;
            previewEmpty.hidden = false;
            previewEmpty.textContent = describeError(error);
            ws.setReady(false);
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
        }
    }

    function sampleText() {
        const number = Number(startNumber.control.value) || 1;
        return format.value.replace('N', state.pages).replace('1', number);
    }

    function buildPreview() {
        previewWrap.innerHTML = '';
        if (!state.thumb) return;
        previewEmpty.hidden = true;
        previewWrap.hidden = false;
        previewWrap.appendChild(h('img', { src: state.thumb.url, alt: 'First page preview' }));
        previewWrap.appendChild(h('span', { class: 'pw-num-overlay', 'data-label': '' }));
        updatePreview();
    }

    function updatePreview() {
        if (!state.thumb || previewWrap.hidden) return;
        const label = previewWrap.querySelector('[data-label]');
        if (!label) return;
        const pageWidth = state.thumb.viewportWidth;
        const pageHeight = state.thumb.viewportHeight;
        const px = state.thumb.width;
        const fontPx = Math.max(6, (Number(fontSize.control.value) || 12) / pageWidth * px);
        const marginPx = Math.max(1, (Number(margin.control.value) || 28) / pageHeight * px);
        const value = position.value;
        label.textContent = sampleText();
        label.style.fontSize = fontPx + 'px';
        label.style.color = color.control.value;
        label.style.left = label.style.right = label.style.top = label.style.bottom = 'auto';
        label.style.transform = 'none';
        if (value === 'bottom-left' || value === 'bottom-center' || value === 'bottom-right') label.style.bottom = marginPx + 'px';
        else label.style.top = marginPx + 'px';
        if (value === 'bottom-left' || value === 'top-left') label.style.left = marginPx + 'px';
        else if (value === 'bottom-right' || value === 'top-right') label.style.right = marginPx + 'px';
        else {
            label.style.left = '50%';
            label.style.transform = 'translateX(-50%)';
        }
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const { StandardFonts } = window.PDFLib;
        const start = Math.max(1, Number(startNumber.control.value) || 1);
        const size = Math.max(6, Math.min(72, Number(fontSize.control.value) || 12));
        const marginValue = Math.max(4, Math.min(200, Number(margin.control.value) || 28));
        let indices = rangeToIndices(range.control.value, state.pages);
        if (skipFirst.control.checked) indices = indices.filter((index) => index !== 0);
        if (!indices.length) {
            ws.setStatus('That page range does not include any pages.', 'error');
            return;
        }
        const base = sanitizeName(outputName.control.value, 'numbered');
        ws.setBusy(true, 'Adding numbers…');
        try {
            const embeddedFont = await state.doc.embedFont(font.value === 'bold' ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
            const rgb = hexColor(color.control.value, window.PDFLib);
            indices.forEach((index, order) => {
                const page = state.doc.getPage(index);
                const { width, height } = page.getSize();
                const number = start + order;
                const text = format.value.replace('N', state.pages).replace('1', number);
                const textWidth = embeddedFont.widthOfTextAtSize(text, size);
                let x = marginValue;
                if (position.value.endsWith('center')) x = (width - textWidth) / 2;
                if (position.value.endsWith('right')) x = width - marginValue - textWidth;
                const y = position.value.startsWith('top') ? height - marginValue - size : marginValue;
                page.drawText(text, { x, y, size, font: embeddedFont, color: rgb });
                if (order % 25 === 0) ws.setProgress((order / indices.length) * 90, 'Numbering page ' + (index + 1) + '…');
            });
            const bytes = await state.doc.save({ useObjectStreams: true });
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'Page numbers added',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Pages numbered', value: String(indices.length) },
                    { label: 'First number', value: String(start) },
                    { label: 'Last number', value: String(start + indices.length - 1) },
                    { label: 'Size', value: formatBytes(bytes.length) }
                ],
                actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
            });
        } catch (error) {
            ws.setBusy(false);
            throw error;
        }
    });
}
