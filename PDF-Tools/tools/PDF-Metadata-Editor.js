import { openPdf, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, checkbox, passwordPrompt, renderResult, note, kvGrid } from './ui.js';

const FIELDS = [
    { key: 'title', label: 'Title', getter: 'getTitle', setter: 'setTitle', placeholder: 'Document title' },
    { key: 'author', label: 'Author', getter: 'getAuthor', setter: 'setAuthor', placeholder: 'Who wrote it' },
    { key: 'subject', label: 'Subject', getter: 'getSubject', setter: 'setSubject', placeholder: 'What it is about' },
    { key: 'keywords', label: 'Keywords', getter: 'getKeywords', setter: 'setKeywords', placeholder: 'comma, separated, keywords' },
    { key: 'creator', label: 'Creator', getter: 'getCreator', setter: 'setCreator', placeholder: 'Application that made it' },
    { key: 'producer', label: 'Producer', getter: 'getProducer', setter: 'setProducer', placeholder: 'PDF writer' }
];

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to edit metadata',
        hint: 'Title, author, subject, keywords, creator, and producer',
        runLabel: 'Save metadata'
    });

    const state = { doc: null, password: undefined, original: {}, pages: 0 };

    const controls = {};
    const inputs = FIELDS.map((config) => {
        const control = h('input', { class: 'pw-input', type: 'text', placeholder: config.placeholder });
        controls[config.key] = control;
        return field({ label: config.label, control });
    });

    const updateDates = checkbox({ label: 'Update created and modified timestamps to now', checked: true });
    const clearButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Clear all fields', onclick: clearFields });
    const restoreButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Restore original values', disabled: true, onclick: restoreOriginal });
    const outputName = field({ label: 'Output file name', value: 'metadata' });
    const currentBox = h('div', { class: 'pw-panel-card' }, [
        h('p', { class: 'pw-note', text: 'Add a PDF to see its current metadata.' })
    ]);
    const statusLabel = h('span', { class: 'pw-toolbar__label', text: 'No document loaded' });
    const toolbar = h('div', { class: 'pw-toolbar' }, [clearButton, restoreButton, h('span', { class: 'pw-toolbar__spacer' }), statusLabel]);

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Document properties' }), h('span', { text: 'Leave a field empty to remove it' })]),
        toolbar,
        h('div', { class: 'pw-grid' }, inputs.slice(0, 2)),
        h('div', { class: 'pw-grid' }, inputs.slice(2, 4)),
        inputs[4],
        inputs[5],
        h('div', { class: 'pw-inline' }, [updateDates]),
        outputName,
        currentBox,
        note('Metadata travels with the PDF and is visible in every reader. Clearing it before sharing removes author names and software fingerprints.')
    ]));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    ws.onFiles(async () => {
        state.password = undefined;
        await load();
    });

    ws.onReset(() => {
        state.doc = null;
        state.original = {};
        Object.values(controls).forEach((control) => { control.value = ''; });
        currentBox.innerHTML = '';
        currentBox.appendChild(h('p', { class: 'pw-note', text: 'Add a PDF to see its current metadata.' }));
        statusLabel.textContent = 'No document loaded';
        restoreButton.disabled = true;
    });

    async function load() {
        ws.setReady(false);
        statusLabel.textContent = 'Reading metadata…';
        try {
            state.doc = await openPdf(ws.file, state.password);
            state.pages = state.doc.getPageCount();
            state.original = {};
            FIELDS.forEach((config) => {
                state.original[config.key] = readField(config);
                controls[config.key].value = state.original[config.key];
            });
            state.original.creationDate = state.doc.getCreationDate() || null;
            state.original.modificationDate = state.doc.getModificationDate() || null;
            passwordBox.hide();
            statusLabel.textContent = state.pages + ' page' + (state.pages === 1 ? '' : 's') + ' loaded';
            outputName.control.value = sanitizeName(ws.file.name, 'metadata') + '-metadata';
            renderOriginal();
            restoreButton.disabled = false;
            ws.setStatus('');
            ws.setReady(true);
        } catch (error) {
            state.doc = null;
            currentBox.innerHTML = '';
            currentBox.appendChild(h('p', { class: 'pw-note is-error', text: describeError(error) }));
            statusLabel.textContent = 'Could not read this PDF';
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        }
    }

    function readField(config) {
        const value = state.doc[config.getter]();
        if (config.key === 'keywords') {
            if (Array.isArray(value)) return value.join(', ');
            return value === undefined || value === null ? '' : String(value);
        }
        return value === undefined || value === null ? '' : String(value);
    }

    function renderOriginal() {
        const rows = FIELDS.map((config) => ({ label: config.label, value: state.original[config.key] || '—' }));
        rows.push({ label: 'Created', value: formatDate(state.original.creationDate) });
        rows.push({ label: 'Modified', value: formatDate(state.original.modificationDate) });
        rows.push({ label: 'Pages', value: String(state.pages) });
        currentBox.innerHTML = '';
        currentBox.appendChild(h('p', { class: 'pw-note', text: 'Current metadata' }));
        currentBox.appendChild(kvGrid(rows));
    }

    function formatDate(value) {
        if (!value || !(value instanceof Date) || Number.isNaN(value.getTime())) return '—';
        return value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }

    function clearFields() {
        Object.values(controls).forEach((control) => { control.value = ''; });
    }

    function restoreOriginal() {
        FIELDS.forEach((config) => {
            controls[config.key].value = state.original[config.key] || '';
        });
        ws.setStatus('');
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const base = sanitizeName(outputName.control.value, 'metadata');
        const changed = FIELDS.filter((config) => (controls[config.key].value.trim() || '') !== (state.original[config.key] || ''));
        if (!changed.length && !updateDates.control.checked) {
            ws.setStatus('Nothing has changed yet. Edit a field first.', 'error');
            return;
        }
        ws.setBusy(true, 'Writing metadata…');
        try {
            FIELDS.forEach((config) => {
                const value = controls[config.key].value.trim();
                if (config.key === 'keywords') {
                    state.doc.setKeywords(value ? value.split(',').map((word) => word.trim()).filter(Boolean) : []);
                } else {
                    state.doc[config.setter](value);
                }
            });
            if (updateDates.control.checked) {
                const now = new Date();
                state.doc.setCreationDate(now);
                state.doc.setModificationDate(now);
            }
            const bytes = await state.doc.save({ useObjectStreams: true });
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'Metadata updated',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Fields changed', value: String(changed.length) },
                    { label: 'Timestamps', value: updateDates.control.checked ? 'Updated to now' : 'Unchanged' },
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
