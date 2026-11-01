import { openPdf, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, renderResult, note } from './ui.js';

const META_FIELDS = [
    ['getTitle', 'setTitle'],
    ['getAuthor', 'setAuthor'],
    ['getSubject', 'setSubject'],
    ['getCreator', 'setCreator'],
    ['getProducer', 'setProducer']
];

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to unlock',
        hint: 'Removes password protection you own',
        runLabel: 'Remove protection'
    });

    const state = { doc: null, pages: 0, needsPassword: false };

    const passwordInput = h('input', { class: 'pw-input', type: 'password', autocomplete: 'current-password', placeholder: 'Current PDF password' });
    const showToggle = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Show', onclick: toggleVisibility });
    const outputName = field({ label: 'Output file name', value: 'unlocked' });
    const statusLabel = h('span', { class: 'pw-toolbar__label', text: 'No document loaded' });
    const toolbar = h('div', { class: 'pw-toolbar' }, [showToggle, h('span', { class: 'pw-toolbar__spacer' }), statusLabel]);
    const infoNote = note('Add a PDF that you own to remove its password.');
    const infoCard = h('div', { class: 'pw-panel-card' }, [infoNote]);

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Unlock document' }), h('span', { text: 'Saved without encryption' })]),
        toolbar,
        field({ label: 'PDF password', control: passwordInput, hint: 'Used only in this browser tab. It is never stored or uploaded.' }),
        infoCard,
        outputName,
        note('Only unlock documents you own or have permission to modify. The unlocked copy will open without a password for anyone you share it with.')
    ]));

    passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && state.needsPassword) ws.runButton.click();
    });

    ws.onFiles(async () => {
        await load();
    });

    ws.onReset(() => {
        state.doc = null;
        state.pages = 0;
        state.needsPassword = false;
        passwordInput.value = '';
        passwordInput.disabled = false;
        statusLabel.textContent = 'No document loaded';
        infoNote.className = 'pw-note';
        infoNote.textContent = 'Add a PDF that you own to remove its password.';
    });

    function toggleVisibility() {
        const showing = passwordInput.type === 'text';
        passwordInput.type = showing ? 'password' : 'text';
        showToggle.textContent = showing ? 'Show' : 'Hide';
    }

    async function load() {
        ws.setReady(false);
        statusLabel.textContent = 'Reading document…';
        passwordInput.disabled = false;
        passwordInput.value = '';
        try {
            state.doc = await openPdf(ws.file);
            state.pages = state.doc.getPageCount();
            state.needsPassword = false;
            statusLabel.textContent = state.pages + ' page' + (state.pages === 1 ? '' : 's') + ' loaded';
            infoNote.className = 'pw-note is-success';
            infoNote.textContent = 'This PDF opens without a password. Saving removes any leftover encryption and restriction flags.';
            passwordInput.disabled = true;
            passwordInput.placeholder = 'Not required for this file';
            outputName.control.value = sanitizeName(ws.file.name, 'unlocked') + '-unlocked';
            ws.setStatus('');
            ws.setReady(true);
        } catch (error) {
            state.doc = null;
            state.pages = 0;
            if (error.code === 'PASSWORD_REQUIRED') {
                state.needsPassword = true;
                statusLabel.textContent = 'Password required';
                infoNote.className = 'pw-note is-warning';
                infoNote.textContent = 'This PDF needs its current password before it can be unlocked. Enter it above.';
                passwordInput.disabled = false;
                passwordInput.placeholder = 'Current PDF password';
                passwordInput.focus();
                outputName.control.value = sanitizeName(ws.file.name, 'unlocked') + '-unlocked';
                ws.setStatus('Enter the PDF password, then choose Remove protection.', 'info');
                ws.setReady(true);
            } else {
                state.needsPassword = false;
                statusLabel.textContent = 'Could not read this PDF';
                infoNote.className = 'pw-note is-error';
                infoNote.textContent = describeError(error);
                ws.setStatus(describeError(error), 'error');
                ws.setReady(false);
            }
        }
    }

    ws.onRun(async () => {
        if (!ws.file) return;
        if (state.needsPassword && !passwordInput.value) {
            ws.setStatus('Enter the current PDF password first.', 'error');
            passwordInput.focus();
            return;
        }
        const base = sanitizeName(outputName.control.value, 'unlocked');
        ws.setBusy(true, 'Removing protection…');
        try {
            const doc = state.doc || await openPdf(ws.file, passwordInput.value);
            const pages = doc.getPageCount();
            removeXrefStreams(doc);
            let bytes = await doc.save({ useObjectStreams: true });
            if (containsEncryptionMarker(bytes)) {
                bytes = await rebuildWithoutEncryption(doc);
            }
            const verification = await window.PDFLib.PDFDocument.load(bytes);
            if (verification.getPageCount() !== pages) {
                throw new Error('The unlocked copy could not be verified. Please try again.');
            }
            if (containsEncryptionMarker(bytes)) {
                throw new Error('Encryption could not be removed from this PDF. It may use an unusual protection scheme.');
            }
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            renderResult(ws.result, {
                title: 'Password removed',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Pages', value: String(pages) },
                    { label: 'Encryption', value: 'Removed' },
                    { label: 'Verification', value: 'Opens without a password' },
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

function removeXrefStreams(doc) {
    const context = doc.context;
    const removals = [];
    for (const [ref, object] of context.enumerateIndirectObjects()) {
        if (!object || object.dict || !object.data || typeof object.data.subarray !== 'function') continue;
        const head = new TextDecoder('latin1').decode(object.data.subarray(0, Math.min(object.data.length, 2048)));
        if (head.includes('/Type /XRef') || head.includes('/Type/XRef')) removals.push(ref);
    }
    removals.forEach((ref) => context.delete(ref));
}

function containsEncryptionMarker(bytes) {
    const decoder = new TextDecoder('latin1');
    const chunk = 512 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
        const text = decoder.decode(bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
        if (text.includes('/Encrypt')) return true;
    }
    return false;
}

async function rebuildWithoutEncryption(source) {
    const PDFLib = window.PDFLib;
    const output = await PDFLib.PDFDocument.create();
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    META_FIELDS.forEach(([getter, setter]) => {
        const value = source[getter]();
        if (value !== undefined && value !== null) output[setter](value);
    });
    const keywords = source.getKeywords();
    if (Array.isArray(keywords) && keywords.length) output.setKeywords(keywords);
    const created = source.getCreationDate();
    const modified = source.getModificationDate();
    if (created) output.setCreationDate(created);
    if (modified) output.setModificationDate(modified);
    return output.save({ useObjectStreams: true });
}
