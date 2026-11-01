import { openPdf, sanitizeName, formatBytes, downloadBytes, describeError } from './engine.js';
import { createWorkspace, h, field, checkbox, passwordPrompt, renderResult, note } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to protect',
        hint: 'Real AES-256 encryption, applied in your browser',
        runLabel: 'Encrypt PDF'
    });

    const state = { doc: null, password: undefined, pages: 0 };

    const passwordInput = h('input', { class: 'pw-input', type: 'password', autocomplete: 'new-password', placeholder: 'At least 4 characters' });
    const confirmInput = h('input', { class: 'pw-input', type: 'password', autocomplete: 'new-password', placeholder: 'Repeat the password' });
    const ownerInput = h('input', { class: 'pw-input', type: 'password', autocomplete: 'new-password', placeholder: 'Optional — leave blank to reuse the user password' });
    const showToggle = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Show', onclick: toggleVisibility });

    const strengthBars = [h('span'), h('span'), h('span')];
    const strengthLabel = h('span', { class: 'pw-hint', text: 'Use 8+ characters with numbers and symbols for a stronger password.' });
    const strength = h('div', { class: 'pw-strength' }, strengthBars);

    const allowPrint = checkbox({ label: 'Allow printing', checked: true });
    const allowCopy = checkbox({ label: 'Allow copying text' });
    const allowModify = checkbox({ label: 'Allow editing content' });
    const allowAnnotate = checkbox({ label: 'Allow annotations and comments', checked: true });
    const allowForms = checkbox({ label: 'Allow form filling', checked: true });

    const outputName = field({ label: 'Output file name', value: 'protected' });
    const statusLabel = h('span', { class: 'pw-toolbar__label', text: 'No document loaded' });
    const alreadyEncrypted = note('This PDF is already encrypted. Saving will replace its current encryption with the password you enter here.', 'warning');
    alreadyEncrypted.hidden = true;
    const toolbar = h('div', { class: 'pw-toolbar' }, [showToggle, h('span', { class: 'pw-toolbar__spacer' }), statusLabel]);

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Passwords' }), h('span', { text: 'AES-256 encryption' })]),
        toolbar,
        field({ label: 'Password', control: passwordInput, hint: 'Required to open the PDF. It cannot be recovered if lost.' }),
        field({ label: 'Confirm password', control: confirmInput }),
        field({ label: 'Owner password', control: ownerInput, hint: 'Protects the permission settings for advanced PDF tools.' }),
        strength,
        strengthLabel,
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Permissions' }), h('span', { text: 'What readers are allowed to do' })]),
        h('div', { class: 'pw-inline' }, [allowPrint, allowCopy, allowModify, allowAnnotate, allowForms]),
        alreadyEncrypted,
        outputName,
        note('Encryption is applied with a standard AES-256 algorithm. Store the password safely — without it the file cannot be opened by anyone, including you.')
    ]));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    passwordInput.addEventListener('input', updateStrength);
    confirmInput.addEventListener('input', validateMatch);
    updateStrength();

    ws.onFiles(async () => {
        state.password = undefined;
        await load();
    });

    ws.onReset(() => {
        state.doc = null;
        passwordInput.value = '';
        confirmInput.value = '';
        ownerInput.value = '';
        alreadyEncrypted.hidden = true;
        statusLabel.textContent = 'No document loaded';
        updateStrength();
    });

    function toggleVisibility() {
        const showing = passwordInput.type === 'text';
        [passwordInput, confirmInput, ownerInput].forEach((input) => { input.type = showing ? 'password' : 'text'; });
        showToggle.textContent = showing ? 'Show' : 'Hide';
    }

    function updateStrength() {
        const value = passwordInput.value;
        let score = 0;
        if (value.length >= 6) score += 1;
        if (value.length >= 10) score += 1;
        if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
        if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
        const level = value.length === 0 ? 'empty' : score <= 1 ? 'weak' : score <= 2 ? 'fair' : 'strong';
        strengthBars.forEach((bar, index) => {
            bar.className = '';
            if (level === 'weak' && index === 0) bar.classList.add('is-on-weak');
            if (level === 'fair' && index < 2) bar.classList.add('is-on-fair');
            if (level === 'strong') bar.classList.add('is-on-strong');
        });
        strengthLabel.textContent = level === 'empty'
            ? 'Use 8+ characters with numbers and symbols for a stronger password.'
            : level === 'weak' ? 'Weak password — add more characters.'
            : level === 'fair' ? 'Fair password — mix upper case, numbers, and symbols.'
            : 'Strong password.';
    }

    function validateMatch() {
        if (!confirmInput.value) {
            confirmInput.setCustomValidity('');
            return;
        }
        confirmInput.setCustomValidity(confirmInput.value === passwordInput.value ? '' : 'Passwords do not match');
    }

    async function load() {
        ws.setReady(false);
        statusLabel.textContent = 'Reading document…';
        try {
            state.doc = await openPdf(ws.file, state.password);
            state.pages = state.doc.getPageCount();
            passwordBox.hide();
            statusLabel.textContent = state.pages + ' page' + (state.pages === 1 ? '' : 's') + ' loaded';
            alreadyEncrypted.hidden = !state.doc.isEncrypted;
            outputName.control.value = sanitizeName(ws.file.name, 'protected') + '-protected';
            ws.setStatus('');
            ws.setReady(true);
        } catch (error) {
            state.doc = null;
            statusLabel.textContent = 'Could not read this PDF';
            if (error.code === 'PASSWORD_REQUIRED') passwordBox.show();
            else ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        }
    }

    ws.onRun(async () => {
        if (!state.doc) return;
        const userPassword = passwordInput.value;
        if (userPassword.length < 4) {
            ws.setStatus('Use a password with at least 4 characters.', 'error');
            passwordInput.focus();
            return;
        }
        if (confirmInput.value !== userPassword) {
            ws.setStatus('The two passwords do not match.', 'error');
            confirmInput.focus();
            return;
        }
        const ownerPassword = ownerInput.value || userPassword;
        const base = sanitizeName(outputName.control.value, 'protected');
        ws.setBusy(true, 'Encrypting with AES-256…');
        try {
            const permissions = {
                printing: allowPrint.control.checked ? 'highResolution' : 'none',
                modifying: allowModify.control.checked,
                copying: allowCopy.control.checked,
                annotating: allowAnnotate.control.checked,
                fillingForms: allowForms.control.checked,
                contentAccessibility: true,
                documentAssembly: false
            };
            state.doc.encrypt({
                userPassword,
                ownerPassword,
                permissions,
                algorithm: 'AES-256'
            });
            const bytes = await state.doc.save();
            const verification = await window.PDFLib.PDFDocument.load(bytes, { password: userPassword });
            if (verification.getPageCount() !== state.pages) {
                throw new Error('The encrypted copy could not be verified. Please try again.');
            }
            const filename = base + '.pdf';
            downloadBytes(bytes, filename);
            ws.setProgress(100, 'Complete');
            ws.setBusy(false);
            const allowed = [
                allowPrint.control.checked ? 'printing' : null,
                allowCopy.control.checked ? 'copying' : null,
                allowModify.control.checked ? 'editing' : null,
                allowAnnotate.control.checked ? 'annotations' : null,
                allowForms.control.checked ? 'forms' : null
            ].filter(Boolean);
            renderResult(ws.result, {
                title: 'PDF encrypted',
                subtitle: filename + ' · ' + formatBytes(bytes.length),
                rows: [
                    { label: 'Algorithm', value: 'AES-256' },
                    { label: 'Pages', value: String(state.pages) },
                    { label: 'Allowed', value: allowed.length ? allowed.join(', ') : 'Viewing only' },
                    { label: 'Verified', value: 'Password opens the file' }
                ],
                actions: [{ label: 'Download again', primary: true, onClick: () => downloadBytes(bytes, filename) }]
            });
        } catch (error) {
            ws.setBusy(false);
            throw error;
        }
    });
}
