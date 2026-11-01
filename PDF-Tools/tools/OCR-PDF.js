import { loadTesseract, loadPdfLib, openPdf, openPdfJs, renderPageToCanvas, imageFileToCanvas, buildPdfFromImages, rangeToIndices, sanitizeName, formatBytes, downloadBytes, downloadBlob, describeError } from './engine.js';
import { createWorkspace, h, field, segmented, checkbox, passwordPrompt, renderResult, iconMarkup, note } from './ui.js';

const LANGUAGES = [
    { value: 'eng', label: 'English', latin: true },
    { value: 'hin', label: 'Hindi', latin: false },
    { value: 'eng+hin', label: 'English + Hindi', latin: false },
    { value: 'spa', label: 'Spanish', latin: true },
    { value: 'fra', label: 'French', latin: true },
    { value: 'deu', label: 'German', latin: true },
    { value: 'ara', label: 'Arabic', latin: false }
];

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,image/jpeg,image/png,image/webp,image/*',
        prompt: 'Drop a PDF or scan image',
        hint: 'Text is recognised locally with Tesseract — nothing is uploaded',
        runLabel: 'Run OCR'
    });

    const state = {
        doc: null,
        isPdf: false,
        pages: 0,
        password: undefined,
        language: 'eng',
        dpi: 150,
        range: '',
        base: 'scan',
        preferSearchable: true,
        ocrCanvas: null,
        result: null,
        busy: false
    };

    const languageSelect = h('select', { class: 'pw-select' }, LANGUAGES.map((language) => h('option', { value: language.value, text: language.label, selected: language.value === 'eng' })));
    const languageField = field({ label: 'Language', control: languageSelect });
    const rangeInput = field({ label: 'Pages to recognise', placeholder: 'All pages — e.g. 1-3, 5' });
    const resolution = segmented({
        label: 'Scan resolution',
        value: '150',
        options: [
            { value: '120', label: 'Fast' },
            { value: '150', label: 'Balanced' },
            { value: '200', label: 'Accurate' }
        ],
        onChange: (value) => { state.dpi = Number(value); updateSummary(); }
    });
    const searchable = checkbox({ label: 'Also build a searchable PDF', checked: true });
    const searchableHint = h('p', { class: 'pw-hint', text: 'Adds an invisible selectable text layer to the original pages.' });
    const outputName = field({ label: 'Output file name', value: 'scan-ocr' });
    const summary = h('div', { class: 'pw-inline-note', html: iconMarkup('info') + '<span>Add a PDF or image to begin.</span>' });
    const preview = h('div', { class: 'pw-thumbs' });
    const text = h('textarea', { class: 'pw-textarea pw-ocr-output', rows: '12', placeholder: 'Recognised text appears here and can be edited before download.' });
    const stats = h('p', { class: 'pw-hint', text: '' });
    const txtButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Download TXT', disabled: true });
    const pdfButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Searchable PDF', disabled: true });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Recognition' }), h('span', { text: 'Tesseract OCR · on-device' })]),
        h('div', { class: 'pw-grid' }, [languageField, outputName]),
        h('div', { class: 'pw-grid' }, [rangeInput]),
        resolution,
        h('div', { class: 'pw-inline' }, [searchable]),
        searchableHint,
        summary,
        preview,
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Recognised text' }), stats]),
        h('div', { class: 'pw-inline' }, [txtButton, pdfButton]),
        text,
        note('The first run downloads language data once, then it is cached by your browser. Searchable PDF works with Latin scripts; Hindi and Arabic export as plain text.')
    ]));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    languageSelect.addEventListener('change', () => {
        state.language = languageSelect.value;
        syncLanguage();
        updateSummary();
    });
    searchable.control.addEventListener('change', () => { state.preferSearchable = searchable.control.checked; });
    rangeInput.control.addEventListener('input', () => { state.range = rangeInput.control.value; });
    text.addEventListener('input', updateStats);
    txtButton.addEventListener('click', downloadTxt);
    pdfButton.addEventListener('click', () => {
        if (!state.result || !state.result.pdfBytes) return;
        downloadBytes(state.result.pdfBytes, sanitizeName(outputName.control.value, state.base) + '-searchable.pdf');
    });

    ws.onFiles(async () => {
        state.password = undefined;
        await load();
    });

    ws.onReset(() => {
        if (state.doc) state.doc.destroy();
        state.doc = null;
        state.pages = 0;
        state.result = null;
        state.ocrCanvas = null;
        text.value = '';
        preview.innerHTML = '';
        txtButton.disabled = true;
        pdfButton.disabled = true;
        updateStats();
        summary.innerHTML = iconMarkup('info') + '<span>Add a PDF or image to begin.</span>';
        ws.setProgress(null);
    });

    function syncLanguage() {
        const language = LANGUAGES.find((item) => item.value === state.language) || LANGUAGES[0];
        searchable.control.disabled = !language.latin;
        searchable.control.checked = language.latin ? state.preferSearchable : false;
        searchableHint.textContent = language.latin
            ? 'Adds an invisible selectable text layer to the original pages.'
            : 'Searchable PDF needs a Latin-script language. The recognised text is still exported as TXT.';
    }

    async function load() {
        if (state.doc) {
            await state.doc.destroy();
            state.doc = null;
        }
        ws.setReady(false);
        ws.setStatus('');
        state.result = null;
        state.ocrCanvas = null;
        text.value = '';
        preview.innerHTML = '';
        txtButton.disabled = true;
        pdfButton.disabled = true;
        updateStats();
        state.isPdf = /\.pdf$/i.test(ws.file.name) || ws.file.type === 'application/pdf';
        state.base = sanitizeName(ws.file.name.replace(/\.[^.]+$/, ''), 'scan');
        outputName.control.value = state.base + '-ocr';
        rangeInput.control.disabled = !state.isPdf;
        rangeInput.style.opacity = state.isPdf ? '1' : '0.5';
        try {
            if (state.isPdf) {
                state.doc = await openPdfJs(ws.file, state.password);
                state.pages = state.doc.numPages;
                passwordBox.hide();
                const rendered = await renderPageToCanvas(state.doc, 1, { maxWidth: 180, background: '#ffffff' });
                addPreview(rendered.canvas.toDataURL('image/jpeg', 0.75), 'Page 1 preview');
            } else {
                const canvas = await imageFileToCanvas(ws.file, 320);
                state.pages = 1;
                addPreview(canvas.toDataURL('image/jpeg', 0.8), 'Scan preview');
            }
            updateSummary();
            ws.setReady(true);
        } catch (error) {
            if (error.code === 'PASSWORD_REQUIRED') {
                passwordBox.show();
                summary.innerHTML = iconMarkup('info') + '<span>Enter the PDF password to continue.</span>';
                return;
            }
            ws.showError(error);
            summary.innerHTML = iconMarkup('info') + '<span>' + describeError(error) + '</span>';
        }
    }

    function addPreview(url, label) {
        preview.innerHTML = '';
        preview.appendChild(h('div', { class: 'pw-thumb' }, [
            h('div', { class: 'pw-thumb__image' }, [h('img', { src: url, alt: '', loading: 'lazy' })]),
            h('div', { class: 'pw-thumb__meta' }, [h('strong', { text: label }), h('span', { text: state.isPdf ? state.pages + ' pages' : 'Single image' })])
        ]));
    }

    function selectedIndices() {
        if (!state.isPdf) return [0];
        if (!state.range.trim()) return Array.from({ length: state.pages }, (_, index) => index);
        return rangeToIndices(state.range, state.pages);
    }

    function updateSummary() {
        if (!state.pages) return;
        const indices = selectedIndices();
        const language = LANGUAGES.find((item) => item.value === state.language) || LANGUAGES[0];
        summary.innerHTML = iconMarkup('info') + '<span>' + (state.isPdf ? state.pages + ' pages' : '1 image') + ' · recognising '
            + indices.length + ' page' + (indices.length === 1 ? '' : 's') + ' · ' + language.label + ' at ' + state.dpi + ' DPI</span>';
    }

    function updateStats() {
        const value = text.value;
        const words = value.trim() ? value.trim().split(/\s+/).length : 0;
        const parts = [value.length.toLocaleString() + ' characters', words.toLocaleString() + ' words'];
        if (state.result) {
            const confidence = Math.round(state.result.pages.reduce((sum, page) => sum + page.confidence, 0) / Math.max(1, state.result.pages.length));
            parts.push(confidence + '% confidence');
            if (state.result.searchablePages) parts.push(state.result.searchablePages + ' searchable pages');
        }
        stats.textContent = parts.join(' · ');
        const hasText = value.trim().length > 0;
        txtButton.disabled = !hasText;
        pdfButton.disabled = !(state.result && state.result.pdfBytes);
    }

    function downloadTxt() {
        if (!text.value.trim()) return;
        downloadBlob(new Blob([text.value], { type: 'text/plain;charset=utf-8' }), sanitizeName(outputName.control.value, state.base) + '.txt');
    }

    function collectWords(data) {
        if (Array.isArray(data.words) && data.words.length) return data.words;
        const words = [];
        (data.blocks || []).forEach((block) => {
            (block.paragraphs || []).forEach((paragraph) => {
                (paragraph.lines || []).forEach((line) => {
                    (line.words || []).forEach((word) => words.push(word));
                });
            });
        });
        return words;
    }

    ws.onRun(async () => {
        if (!state.isPdf && !state.doc && !ws.file) return;
        const indices = selectedIndices();
        if (!indices.length) throw new Error('That page range does not include any pages.');
        const language = LANGUAGES.find((item) => item.value === state.language) || LANGUAGES[0];
        const wantSearchable = searchable.control.checked && language.latin;
        const scale = state.dpi / 72;
        state.busy = true;
        ws.setBusy(true, 'Preparing OCR engine…');
        ws.setProgress(3, 'Loading OCR engine…');
        let worker = null;
        try {
            const tesseract = await loadTesseract();
            const total = indices.length;
            let currentPage = 1;
            let currentIndex = 0;
            const logger = (message) => {
                if (!message || !message.status) return;
                if (message.status === 'recognizing text') {
                    const fraction = (currentIndex + (message.progress || 0)) / total;
                    ws.setProgress(12 + fraction * 72, 'Recognising page ' + currentPage + ' of ' + total + '…');
                } else if (/language/i.test(message.status)) {
                    ws.setProgress(8, 'Downloading ' + language.label + ' language data…');
                } else if (/core|initializ/i.test(message.status)) {
                    ws.setProgress(5, 'Preparing OCR engine…');
                }
            };
            worker = await tesseract.createWorker(language.value, 1, { logger });
            const pages = [];
            const overlays = [];
            for (let index = 0; index < indices.length; index += 1) {
                const pageNumber = indices[index] + 1;
                currentPage = pageNumber;
                currentIndex = index;
                ws.setProgress(12 + (index / total) * 72, 'Recognising page ' + pageNumber + ' of ' + total + '…');
                let canvas;
                if (state.isPdf) {
                    const rendered = await renderPageToCanvas(state.doc, pageNumber, { scale, background: '#ffffff' });
                    canvas = rendered.canvas;
                } else {
                    canvas = await imageFileToCanvas(ws.file, 3000);
                }
                const result = await worker.recognize(canvas);
                const pageText = String((result.data && result.data.text) || '').trim();
                const confidence = Math.round(Number(result.data && result.data.confidence) || 0);
                const words = collectWords(result.data || {});
                pages.push({ page: pageNumber, text: pageText, confidence, words: words.length });
                overlays.push({ page: pageNumber, words, width: canvas.width, height: canvas.height });
                if (!state.isPdf) state.ocrCanvas = canvas;
            }
            ws.setProgress(86, 'Saving text…');
            const composed = pages.map((page) => (pages.length > 1 ? '--- Page ' + page.page + ' ---\n' : '') + (page.text || '[No text recognised on this page]')).join('\n\n');
            text.value = composed.trim();
            let pdfBytes = null;
            let searchablePages = 0;
            let skipped = [];
            let searchableError = '';
            if (wantSearchable && overlays.some((overlay) => overlay.words.length)) {
                ws.setProgress(90, 'Building searchable PDF…');
                try {
                    const built = await buildSearchablePdf(overlays);
                    pdfBytes = built.bytes;
                    searchablePages = built.pages;
                    skipped = built.skipped;
                } catch (error) {
                    searchableError = describeError(error);
                }
            }
            state.result = { pages, pdfBytes, searchablePages };
            updateStats();
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            const confidence = Math.round(pages.reduce((sum, page) => sum + page.confidence, 0) / Math.max(1, pages.length));
            const words = text.value.trim() ? text.value.trim().split(/\s+/).length : 0;
            if (!text.value.trim()) ws.setStatus('No text was recognised. Try a clearer scan or a higher resolution.', 'error');
            else if (searchableError) ws.setStatus('Text is ready, but the searchable PDF could not be built: ' + searchableError, 'error');
            else if (skipped.length) ws.setStatus('Searchable text was added to ' + searchablePages + ' page(s). Pages with rotation were left as images.', 'success');
            else ws.setStatus('');
            renderResult(ws.result, {
                title: 'Recognised ' + words.toLocaleString() + ' words',
                subtitle: pages.length + ' page' + (pages.length === 1 ? '' : 's') + ' · ' + confidence + '% average confidence',
                rows: [
                    { label: 'Pages', value: String(pages.length) },
                    { label: 'Confidence', value: confidence + '%' },
                    { label: 'Searchable', value: pdfBytes ? searchablePages + ' pages' : 'Off' },
                    { label: 'Text size', value: formatBytes(new Blob([text.value]).size) }
                ],
                actions: [
                    { label: 'Download TXT', primary: true, onClick: downloadTxt },
                    {
                        label: 'Download searchable PDF',
                        onClick: () => {
                            if (pdfBytes) downloadBytes(pdfBytes, sanitizeName(outputName.control.value, state.base) + '-searchable.pdf');
                        }
                    }
                ].filter((action) => action.label !== 'Download searchable PDF' || pdfBytes)
            });
        } finally {
            if (worker) {
                try { await worker.terminate(); } catch (error) { /* Worker is already gone. */ }
            }
            state.busy = false;
            ws.setBusy(false);
        }
    });

    async function buildSearchablePdf(overlays) {
        const pdfLib = await loadPdfLib();
        let doc;
        if (state.isPdf) {
            doc = await openPdf(state.file, state.password);
        } else {
            const bytes = await buildPdfFromImages([{ canvas: state.ocrCanvas }], { pageSize: 'fit', quality: 0.92, background: '#ffffff' });
            doc = await pdfLib.PDFDocument.load(bytes);
        }
        const font = await doc.embedFont(pdfLib.StandardFonts.Helvetica);
        let pages = 0;
        const skipped = [];
        overlays.forEach((overlay) => {
            const page = doc.getPage(overlay.page - 1);
            const rotation = ((page.getRotation().angle % 360) + 360) % 360;
            if (rotation !== 0) {
                skipped.push(overlay.page);
                return;
            }
            const { width, height } = page.getSize();
            const scaleX = width / overlay.width;
            const scaleY = height / overlay.height;
            overlay.words.forEach((word) => {
                const value = String(word.text || '').replace(/[^\x20-\x7E]/g, '').trim();
                if (!value || !word.bbox) return;
                const boxWidth = word.bbox.x1 - word.bbox.x0;
                const boxHeight = word.bbox.y1 - word.bbox.y0;
                if (boxWidth <= 0 || boxHeight <= 0) return;
                const size = Math.max(2, Math.min(96, boxHeight * scaleY * 0.92));
                const x = word.bbox.x0 * scaleX;
                const y = height - word.bbox.y1 * scaleY + size * 0.12;
                try {
                    page.drawText(value, { x, y, size, font, color: pdfLib.rgb(0, 0, 0), opacity: 0 });
                } catch (error) {
                    // Unsupported glyphs are skipped so the rest of the page still gets a text layer.
                }
            });
            pages += 1;
        });
        const bytes = await doc.save({ useObjectStreams: true });
        return { bytes, pages, skipped };
    }

    syncLanguage();
    updateStats();
    updateSummary();
}
