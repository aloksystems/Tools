import { openPdfJs, rangeToIndices, sanitizeName, downloadBlob, describeError } from './engine.js';
import { createWorkspace, h, field, checkbox, passwordPrompt, renderResult, iconMarkup, showToast, note } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to extract text',
        hint: 'Text is read on this device — scanned pages need OCR',
        runLabel: 'Extract text'
    });

    const state = { doc: null, pages: 0, password: undefined, range: '', pageData: [], base: 'document' };

    const rangeInput = field({ label: 'Pages to extract', placeholder: 'All pages — e.g. 1-3, 5' });
    const keepLines = checkbox({ label: 'Keep line breaks and paragraphs', checked: true });
    const pageHeaders = checkbox({ label: 'Add page headers' });
    const outputName = field({ label: 'Output file name', value: 'document' });
    const summary = h('div', { class: 'pw-inline-note', html: iconMarkup('info') + '<span>Add a PDF to extract its text.</span>' });
    const stats = h('p', { class: 'pw-hint', text: '' });
    const preview = h('textarea', { class: 'pw-textarea', rows: '14', placeholder: 'Extracted text appears here and can be edited before download.' });
    const copyButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Copy text', disabled: true });
    const txtButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Download TXT', disabled: true });
    const rtfButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Download RTF', disabled: true });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Extraction' }), h('span', { text: 'Layout-aware text order' })]),
        h('div', { class: 'pw-grid' }, [rangeInput, outputName]),
        h('div', { class: 'pw-inline' }, [keepLines, pageHeaders]),
        summary,
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Preview' }), stats]),
        h('div', { class: 'pw-inline' }, [copyButton, txtButton, rtfButton]),
        preview,
        note('Scanned PDFs contain images, not text. If the preview is empty, run OCR PDF instead.')
    ]));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    rangeInput.control.addEventListener('input', () => { state.range = rangeInput.control.value; updateSummary(); });
    preview.addEventListener('input', updateStats);

    copyButton.addEventListener('click', async () => {
        if (!preview.value) return;
        try {
            await navigator.clipboard.writeText(preview.value);
            showToast('Text copied to the clipboard.', 'success');
        } catch (error) {
            preview.select();
            showToast('Press Ctrl+C to copy the selected text.', 'error');
        }
    });
    txtButton.addEventListener('click', () => downloadTxt());
    rtfButton.addEventListener('click', () => downloadRtf());

    ws.onFiles(async () => {
        state.password = undefined;
        await load();
    });

    ws.onReset(() => {
        if (state.doc) state.doc.destroy();
        state.doc = null;
        state.pages = 0;
        state.pageData = [];
        preview.value = '';
        copyButton.disabled = true;
        txtButton.disabled = true;
        rtfButton.disabled = true;
        updateStats();
        summary.innerHTML = iconMarkup('info') + '<span>Add a PDF to extract its text.</span>';
        ws.setProgress(null);
    });

    async function load() {
        if (state.doc) {
            await state.doc.destroy();
            state.doc = null;
        }
        ws.setReady(false);
        ws.setStatus('');
        state.pageData = [];
        preview.value = '';
        copyButton.disabled = true;
        txtButton.disabled = true;
        rtfButton.disabled = true;
        state.base = sanitizeName(ws.file.name, 'document');
        outputName.control.value = state.base;
        updateStats();
        summary.innerHTML = iconMarkup('info') + '<span>Reading document…</span>';
        try {
            state.doc = await openPdfJs(ws.file, state.password);
            state.pages = state.doc.numPages;
            passwordBox.hide();
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

    function selectedIndices() {
        if (!state.range.trim()) return Array.from({ length: state.pages }, (_, index) => index);
        return rangeToIndices(state.range, state.pages);
    }

    function updateSummary() {
        if (!state.pages) return;
        const indices = selectedIndices();
        summary.innerHTML = iconMarkup('info') + '<span>' + state.pages + ' pages · extracting ' + indices.length + ' page' + (indices.length === 1 ? '' : 's') + '</span>';
    }

    function updateStats() {
        const text = preview.value;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const empty = state.pageData.filter((page) => !page.text).length;
        const parts = [text.length.toLocaleString() + ' characters', words.toLocaleString() + ' words'];
        if (state.pageData.length) parts.push(state.pageData.length + ' pages');
        if (empty) parts.push(empty + ' empty');
        stats.textContent = parts.join(' · ');
        copyButton.disabled = !text.trim();
        txtButton.disabled = !text.trim();
        rtfButton.disabled = !text.trim();
    }

    function compose() {
        const headers = pageHeaders.control.checked;
        return state.pageData.map((page) => (headers ? '--- Page ' + page.page + ' ---\n' : '') + page.text).join('\n\n').trim();
    }

    function linesFromContent(content) {
        const rows = (content.items || [])
            .filter((item) => typeof item.str === 'string' && item.str.trim())
            .map((item) => ({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5],
                height: Math.abs(item.height) || Math.abs(item.transform[3]) || 10,
                width: item.width || 0
            }))
            .sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = [];
        let current = null;
        rows.forEach((row) => {
            const tolerance = Math.max(2.5, Math.min(row.height, current ? current.height : row.height) * 0.45);
            if (!current || Math.abs(current.y - row.y) > tolerance) {
                current = { y: row.y, height: row.height, items: [row] };
                lines.push(current);
            } else {
                current.items.push(row);
                current.height = Math.max(current.height, row.height);
            }
        });
        return lines.map((line) => {
            line.items.sort((a, b) => a.x - b.x);
            let text = '';
            let previous = null;
            line.items.forEach((item) => {
                if (previous) {
                    const gap = item.x - (previous.x + previous.width);
                    if (gap > Math.max(1, previous.height * 0.24)) text += ' ';
                }
                text += item.text;
                previous = item;
            });
            return { text: text.replace(/[ \t]+/g, ' ').trim(), y: line.y, height: line.height };
        });
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const indices = selectedIndices();
        if (!indices.length) throw new Error('That page range does not include any pages.');
        ws.setBusy(true, 'Extracting text…');
        ws.setProgress(4, 'Reading pages…');
        try {
            const keep = keepLines.control.checked;
            const pages = [];
            for (let index = 0; index < indices.length; index += 1) {
                const pageNumber = indices[index] + 1;
                const page = await state.doc.getPage(pageNumber);
                const content = await page.getTextContent();
                const lines = linesFromContent(content);
                let text = '';
                if (keep) {
                    let previous = null;
                    lines.forEach((line) => {
                        if (previous) {
                            const paragraph = previous.y - line.y > Math.max(previous.height, line.height) * 2.05;
                            text += paragraph ? '\n\n' : '\n';
                        }
                        text += line.text;
                        previous = line;
                    });
                } else {
                    text = lines.map((line) => line.text).join(' ');
                }
                pages.push({ page: pageNumber, text: text.trim(), lines: lines.length });
                page.cleanup();
                ws.setProgress(4 + ((index + 1) / indices.length) * 92, 'Extracted page ' + pageNumber + ' of ' + state.pages);
            }
            state.pageData = pages;
            preview.value = compose();
            updateStats();
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            const words = preview.value.trim() ? preview.value.trim().split(/\s+/).length : 0;
            const empty = pages.filter((page) => !page.text).length;
            if (!preview.value) {
                ws.setStatus('No selectable text was found. This PDF looks like a scan — use OCR PDF instead.', 'error');
            } else {
                ws.setStatus('');
            }
            renderResult(ws.result, {
                title: 'Extracted text from ' + pages.length + ' page' + (pages.length === 1 ? '' : 's'),
                subtitle: words.toLocaleString() + ' words · ' + preview.value.length.toLocaleString() + ' characters',
                rows: [
                    { label: 'Pages', value: String(pages.length) },
                    { label: 'Words', value: words.toLocaleString() },
                    { label: 'Empty pages', value: String(empty) }
                ],
                actions: [
                    { label: 'Download TXT', primary: true, onClick: () => downloadTxt() },
                    { label: 'Download RTF', onClick: () => downloadRtf() }
                ]
            });
        } finally {
            ws.setBusy(false);
        }
    });

    function downloadTxt() {
        const text = preview.value;
        if (!text.trim()) return;
        downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), sanitizeName(outputName.control.value, state.base) + '.txt');
    }

    function downloadRtf() {
        const text = preview.value;
        if (!text.trim()) return;
        downloadBlob(new Blob([toRtf(text)], { type: 'application/rtf;charset=utf-8' }), sanitizeName(outputName.control.value, state.base) + '.rtf');
    }

    function toRtf(text) {
        const body = text.split('\n').map((line) => {
            let out = '';
            for (const character of line) {
                const code = character.codePointAt(0);
                if (character === '\\' || character === '{' || character === '}') out += '\\' + character;
                else if (code >= 32 && code < 128) out += character;
                else if (code <= 0xFFFF) out += '\\u' + (code > 32767 ? code - 65536 : code) + '?';
                else {
                    const high = Math.floor((code - 0x10000) / 0x400) + 0xD800;
                    const low = ((code - 0x10000) % 0x400) + 0xDC00;
                    out += '\\u' + (high - 65536) + '?\\u' + (low - 65536) + '?';
                }
            }
            return out + '\\par';
        }).join('\n');
        return '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Calibri;}}\\viewkind4\\uc1\\pard\\f0\\fs22\n' + body + '\n}';
    }

    updateStats();
    updateSummary();
}
