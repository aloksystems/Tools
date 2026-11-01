import { loadPdfLib, openPdf, openPdfJs, renderPageToCanvas, renderThumbnails, sanitizeName, formatBytes, downloadBytes, describeError, waitForUi } from './engine.js';
import { createWorkspace, h, field, segmented, passwordPrompt, renderResult, iconMarkup } from './ui.js';

const LEVELS = {
    light: { scale: 2, quality: 0.82, label: 'Light' },
    balanced: { scale: 1.65, quality: 0.72, label: 'Balanced' },
    strong: { scale: 1.35, quality: 0.6, label: 'Strong' },
    extreme: { scale: 1.0, quality: 0.45, label: 'Extreme' }
};

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to reduce',
        hint: 'Pick a target size — the file never leaves your browser',
        runLabel: 'Reduce PDF'
    });

    const state = { file: null, pdfLib: null, pdfjs: null, pages: 0, password: undefined, level: 'balanced', target: '200kb', custom: 200, unit: 'kb' };

    const targetSelect = h('select', { class: 'pw-select' }, [
        h('option', { value: 'none', text: 'Smallest possible (no target)' }),
        h('option', { value: '100kb', text: '100 KB' }),
        h('option', { value: '200kb', text: '200 KB', selected: true }),
        h('option', { value: '500kb', text: '500 KB' }),
        h('option', { value: '1mb', text: '1 MB' }),
        h('option', { value: '2mb', text: '2 MB' }),
        h('option', { value: '5mb', text: '5 MB' }),
        h('option', { value: 'custom', text: 'Custom target…' })
    ]);
    const targetField = field({ label: 'Target size', control: targetSelect });
    const customInput = field({ label: 'Custom size', type: 'number', value: 200, min: 20 });
    const unitSelect = h('select', { class: 'pw-select' }, [
        h('option', { value: 'kb', text: 'KB' }),
        h('option', { value: 'mb', text: 'MB' })
    ]);
    const customUnit = field({ label: 'Unit', control: unitSelect });
    const customWrap = h('div', { class: 'pw-grid', hidden: true }, [customInput, customUnit]);
    const level = segmented({
        label: 'Quality',
        value: 'balanced',
        options: [
            { value: 'light', label: 'Light' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'strong', label: 'Strong' },
            { value: 'extreme', label: 'Extreme' }
        ],
        onChange: (value) => { state.level = value; updateEstimate(); }
    });
    const outputName = field({ label: 'Output file name', value: 'compressed' });
    const info = h('div', { class: 'pw-inline-note', html: iconMarkup('info') + '<span>Add a PDF to see its size.</span>' });
    const estimate = h('p', { class: 'pw-hint', text: '' });
    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Compression' }), h('span', { text: 'Balanced keeps text when it fits the target' })]),
        h('div', { class: 'pw-grid' }, [targetField, outputName]),
        customWrap,
        level,
        info,
        estimate
    ]));
    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    targetSelect.addEventListener('change', () => {
        state.target = targetSelect.value;
        customWrap.hidden = state.target !== 'custom';
        updateEstimate();
    });
    customInput.control.addEventListener('input', () => { state.custom = Number(customInput.control.value) || 0; updateEstimate(); });
    unitSelect.addEventListener('change', () => { state.unit = unitSelect.value; updateEstimate(); });

    function targetBytes() {
        if (state.target === 'none') return 0;
        if (state.target === 'custom') {
            const value = state.custom;
            return Math.round(value * (state.unit === 'mb' ? 1024 * 1024 : 1024));
        }
        const match = state.target.match(/^(\d+)(kb|mb)$/);
        if (!match) return 0;
        return Number(match[1]) * (match[2] === 'mb' ? 1024 * 1024 : 1024);
    }

    function updateEstimate() {
        if (!state.file) {
            info.innerHTML = iconMarkup('info') + '<span>Add a PDF to see its size.</span>';
            estimate.textContent = '';
            return;
        }
        const target = targetBytes();
        info.innerHTML = iconMarkup('file-text') + '<span>' + state.file.name + ' · ' + formatBytes(state.file.size) + ' · ' + state.pages + ' pages</span>';
        if (!target) {
            const originalPages = state.pages;
            estimate.textContent = 'The smallest result wins between keeping text and rasterizing ' + originalPages + ' pages.';
        } else if (target >= state.file.size) {
            estimate.textContent = 'That target is larger than the file — you will get the best smaller copy instead.';
        } else {
            estimate.textContent = 'Target: ' + formatBytes(target) + '. A rasterized copy is used only when keeping text cannot reach it.';
        }
    }

    ws.onFiles(async (file) => {
        state.file = file;
        state.password = undefined;
        state.pages = 0;
        state.pdfLib = null;
        state.pdfjs = null;
        await load();
    });

    async function load() {
        try {
            const [pdfLib, pdfjs] = await Promise.all([loadPdfLib(), openPdfJs(state.file, state.password)]);
            state.pdfLib = pdfLib;
            state.pdfjs = pdfjs;
            state.pages = pdfjs.numPages;
            passwordBox.hide();
            updateEstimate();
            ws.setReady(true);
        } catch (error) {
            state.pdfjs = null;
            state.pdfLib = null;
            state.pages = 0;
            ws.setReady(false);
            if (error.code === 'PASSWORD_REQUIRED') {
                passwordBox.show();
                info.innerHTML = iconMarkup('lock') + '<span>This PDF is locked.</span>';
            } else {
                ws.setStatus(describeError(error), 'error');
            }
        }
    }

    async function rewrite() {
        const doc = await openPdf(state.file, state.password);
        return doc.save({ useObjectStreams: true });
    }

    async function rasterize(scale, quality, progressLabel) {
        const { PDFDocument } = state.pdfLib;
        const doc = await PDFDocument.create();
        for (let pageNumber = 1; pageNumber <= state.pages; pageNumber += 1) {
            ws.setProgress(20 + (pageNumber / state.pages) * 55, progressLabel + ' page ' + pageNumber + ' of ' + state.pages + '…');
            await waitForUi();
            const rendered = await renderPageToCanvas(state.pdfjs, pageNumber, { scale });
            const dataUrl = rendered.canvas.toDataURL('image/jpeg', quality);
            const binary = atob(dataUrl.split(',')[1]);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            const image = await doc.embedJpg(bytes);
            const pageWidth = rendered.width / scale;
            const pageHeight = rendered.height / scale;
            const page = doc.addPage([pageWidth, pageHeight]);
            page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        }
        return doc.save({ useObjectStreams: true });
    }

    ws.onRun(async () => {
        if (!state.file || !state.pdfjs) return;
        const target = targetBytes();
        const levelSettings = LEVELS[state.level] || LEVELS.balanced;
        ws.setBusy(true, 'Optimizing…');
        ws.setProgress(6, 'Trying to keep the original text…');
        let best = null;
        let bestMode = 'text';
        try {
            const rewritten = await rewrite();
            best = rewritten;
            bestMode = 'text';
        } catch (error) {
            best = null;
        }
        let hitTarget = target && best && best.length <= target;
        if (!hitTarget && (!best || state.target !== 'none')) {
            let scale = levelSettings.scale;
            let quality = levelSettings.quality;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                const bytes = await rasterize(scale, quality, 'Rebuilding');
                ws.setProgress(80 + attempt * 5, 'Checking size…');
                if (!best || bytes.length < best.length) {
                    best = bytes;
                    bestMode = 'raster';
                }
                if (target && bytes.length <= target) {
                    hitTarget = true;
                    break;
                }
                scale = Math.max(0.55, scale * 0.8);
                quality = Math.max(0.32, quality - 0.12);
            }
        }
        if (!best) throw new Error('Compression failed. The PDF may be damaged.');
        if (best.length >= state.file.size) {
            const original = await state.pdfLib.PDFDocument.load(await state.file.arrayBuffer(), state.password ? { password: state.password } : { updateMetadata: false });
            best = await original.save();
            bestMode = 'original';
        }
        const filename = sanitizeName(outputName.control.value, 'compressed') + '.pdf';
        ws.setProgress(100, 'Complete');
        downloadBytes(best, filename);
        ws.setBusy(false);
        const savedPercent = Math.max(0, Math.round((1 - best.length / state.file.size) * 100));
        renderResult(ws.result, {
            title: target && hitTarget ? 'Target reached' : target ? 'Smallest result ready' : 'PDF reduced',
            subtitle: filename + ' · ' + formatBytes(best.length) + ' (' + savedPercent + '% smaller)',
            rows: [
                { label: 'Original', value: formatBytes(state.file.size) },
                { label: 'Target', value: target ? formatBytes(target) : 'Best effort' },
                { label: 'Result', value: formatBytes(best.length) },
                { label: 'Saved', value: savedPercent + '%' }
            ],
            actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(best, filename) }]
        });
        if (bestMode === 'raster') {
            ws.result.appendChild(h('p', { class: 'pw-note', text: 'This copy was rasterized to reach the target. Text is no longer selectable, but it looks the same on screen.' }));
        } else if (bestMode === 'original') {
            ws.result.appendChild(h('p', { class: 'pw-note', text: 'The original was already smaller than any compressed version, so it was downloaded unchanged.' }));
        }
        try {
            const originalThumbs = await renderThumbnails(state.file, { maxWidth: 150, password: state.password, pages: [1] });
            const resultFile = new File([best], filename, { type: 'application/pdf' });
            const resultThumbs = await renderThumbnails(resultFile, { maxWidth: 150, pages: [1] });
            const compare = h('div', { class: 'pw-thumbs', style: 'margin-top: 14px' }, [
                thumbnailCard('Original', originalThumbs.thumbnails[0] && originalThumbs.thumbnails[0].url),
                thumbnailCard('Reduced', resultThumbs.thumbnails[0] && resultThumbs.thumbnails[0].url)
            ]);
            ws.result.appendChild(compare);
        } catch (error) {
            // Comparison preview is optional.
        }
    });

    function thumbnailCard(label, url) {
        return h('figure', { class: 'pw-thumb' }, [
            h('div', { class: 'pw-thumb__image' }, url ? [h('img', { src: url, alt: '' })] : []),
            h('figcaption', { class: 'pw-thumb__meta' }, [h('strong', { text: label })])
        ]);
    }

    ws.onReset(() => {
        state.file = null;
        state.pdfjs = null;
        state.pages = 0;
        updateEstimate();
    });
}
