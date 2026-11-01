import { readFileBytes, openPdfJs, renderThumbnails, formatBytes, downloadBlob, describeError } from './engine.js';
import { createWorkspace, h, passwordPrompt, renderResult, kvGrid, note } from './ui.js';

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.pdf,application/pdf',
        prompt: 'Drop a PDF to inspect',
        hint: 'Metadata, page sizes, encryption, and statistics',
        runLabel: 'Download JSON report'
    });

    const state = { report: null, password: undefined };

    const statusLabel = h('span', { class: 'pw-toolbar__label', text: 'No document loaded' });
    const copyButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Copy JSON', disabled: true, onclick: copyJson });
    const reportBox = h('div', { class: 'pw-info-report' }, [
        h('div', { class: 'pw-empty', text: 'Add a PDF to see its full report.' })
    ]);
    const toolbar = h('div', { class: 'pw-toolbar' }, [copyButton, h('span', { class: 'pw-toolbar__spacer' }), statusLabel]);

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Document report' }), h('span', { text: 'Read entirely on this device' })]),
        toolbar,
        reportBox,
        note('The report is generated locally. Nothing is uploaded, and encrypted files are only inspected after you enter their password.')
    ]));

    const passwordBox = passwordPrompt(ws.extra, async (password) => {
        state.password = password;
        await load();
    });

    ws.onFiles(async () => {
        state.password = undefined;
        state.report = null;
        copyButton.disabled = true;
        await load();
    });

    ws.onReset(() => {
        state.report = null;
        state.password = undefined;
        reportBox.innerHTML = '';
        reportBox.appendChild(h('div', { class: 'pw-empty', text: 'Add a PDF to see its full report.' }));
        statusLabel.textContent = 'No document loaded';
        copyButton.disabled = true;
    });

    async function load() {
        ws.setReady(false);
        ws.setStatus('');
        reportBox.innerHTML = '';
        reportBox.appendChild(h('div', { class: 'pw-empty', text: 'Analysing document…' }));
        statusLabel.textContent = 'Reading…';
        try {
            const bytes = await readFileBytes(ws.file);
            const version = detectVersion(bytes);
            const encrypted = detectEncryption(bytes);
            let pdf = null;
            try {
                pdf = await openPdfJs(ws.file, state.password);
            } catch (error) {
                if (error.code === 'PASSWORD_REQUIRED') {
                    passwordBox.show();
                    reportBox.innerHTML = '';
                    reportBox.appendChild(h('div', { class: 'pw-empty', text: 'This PDF is password-protected. Enter its password to inspect it.' }));
                    statusLabel.textContent = 'Password required';
                    if (encrypted) renderPartial(ws.file, bytes, version, encrypted, 'Password required');
                    return;
                }
                throw error;
            }
            passwordBox.hide();
            const metadata = await pdf.getMetadata().catch(() => null);
            const info = metadata && metadata.info ? metadata.info : {};
            const xmp = metadata && metadata.metadata && typeof metadata.metadata.getAll === 'function' ? metadata.metadata.getAll() : {};
            const pages = [];
            for (let number = 1; number <= pdf.numPages; number += 1) {
                const page = await pdf.getPage(number);
                const viewport = page.getViewport({ scale: 1 });
                pages.push({
                    page: number,
                    width: round(viewport.width),
                    height: round(viewport.height),
                    rotation: ((page.rotate || 0) % 360 + 360) % 360,
                    orientation: viewport.width > viewport.height ? 'landscape' : 'portrait'
                });
                page.cleanup();
            }
            let thumbnail = null;
            try {
                const thumbs = await renderThumbnails(ws.file, { pages: [1], maxWidth: 220, password: state.password });
                thumbnail = thumbs.thumbnails[0] || null;
            } catch (error) {
                thumbnail = null;
            }
            const totalPages = pdf.numPages;
            await pdf.destroy();
            const sizes = collectSizes(pages);
            const encryptionLabel = encrypted ? (state.password ? 'Encrypted — unlocked with password' : 'Restricted permissions (opens without a password)') : 'Not encrypted';
            state.report = {
                file: {
                    name: ws.file.name,
                    size: ws.file.size,
                    sizeLabel: formatBytes(ws.file.size),
                    pdfVersion: version,
                    encrypted,
                    passwordProtected: encrypted && !state.password ? 'unknown' : Boolean(state.password),
                    analysedAt: new Date().toISOString()
                },
                document: {
                    pages: totalPages,
                    pageSizes: sizes,
                    orientation: dominantOrientation(pages),
                    encryption: encryptionLabel
                },
                info: normaliseInfo(info),
                pages,
                xmp: Object.keys(xmp || {}).reduce((result, key) => {
                    result[key] = String(xmp[key]);
                    return result;
                }, {})
            };
            renderReport(state.report, thumbnail);
            statusLabel.textContent = totalPages + ' page' + (totalPages === 1 ? '' : 's') + ' · ' + formatBytes(ws.file.size);
            copyButton.disabled = false;
            ws.setReady(true);
        } catch (error) {
            state.report = null;
            reportBox.innerHTML = '';
            reportBox.appendChild(h('div', { class: 'pw-empty', text: describeError(error) }));
            statusLabel.textContent = 'Could not read this PDF';
            ws.setStatus(describeError(error), 'error');
            ws.setReady(false);
        }
    }

    function renderPartial(file, bytes, version, encrypted, status) {
        state.report = null;
        statusLabel.textContent = status;
        reportBox.innerHTML = '';
        reportBox.appendChild(h('div', { class: 'pw-panel-card' }, [
            h('p', { class: 'pw-note', text: 'Raw file details' }),
            kvGrid([
                { label: 'File', value: file.name },
                { label: 'Size', value: formatBytes(bytes.length) },
                { label: 'PDF version', value: version || 'Unknown' },
                { label: 'Encryption', value: encrypted ? 'Yes — password needed' : 'No' }
            ])
        ]));
    }

    function renderReport(report, thumbnail) {
        reportBox.innerHTML = '';
        const top = h('div', { class: 'pw-panel-card pw-info-top' }, [
            thumbnail ? h('div', { class: 'pw-info-thumb' }, [h('img', { src: thumbnail.url, alt: 'First page' })]) : null,
            h('div', { class: 'pw-info-summary' }, [
                kvGrid([
                    { label: 'Pages', value: String(report.document.pages) },
                    { label: 'File size', value: report.file.sizeLabel },
                    { label: 'PDF version', value: report.file.pdfVersion || 'Unknown' },
                    { label: 'Orientation', value: report.document.orientation },
                    { label: 'Encryption', value: report.document.encryption },
                    { label: 'Page sizes', value: report.document.pageSizes.map((size) => size.label + ' (' + size.count + ')').join(', ') || '—' }
                ])
            ])
        ]);
        reportBox.appendChild(top);

        const infoRows = [
            { label: 'Title', value: report.info.Title },
            { label: 'Author', value: report.info.Author },
            { label: 'Subject', value: report.info.Subject },
            { label: 'Keywords', value: report.info.Keywords },
            { label: 'Creator', value: report.info.Creator },
            { label: 'Producer', value: report.info.Producer },
            { label: 'Created', value: formatPdfDate(report.info.CreationDate) },
            { label: 'Modified', value: formatPdfDate(report.info.ModDate) }
        ].filter((row) => row.value && row.value !== '—');

        reportBox.appendChild(h('div', { class: 'pw-panel-card' }, [
            h('p', { class: 'pw-note', text: 'Document information' }),
            infoRows.length ? kvGrid(infoRows) : h('p', { class: 'pw-note', text: 'No document metadata is stored in this file.' })
        ]));

        const rows = report.pages.slice(0, 200).map((page) => h('tr', {}, [
            h('td', { text: String(page.page) }),
            h('td', { text: page.width + ' × ' + page.height + ' pt' }),
            h('td', { text: (page.width / 72).toFixed(2) + ' × ' + (page.height / 72).toFixed(2) + ' in' }),
            h('td', { text: (page.width / 72 * 25.4).toFixed(0) + ' × ' + (page.height / 72 * 25.4).toFixed(0) + ' mm' }),
            h('td', { text: page.orientation }),
            h('td', { text: page.rotation + '°' })
        ]));
        const table = h('table', { class: 'pw-table' }, [
            h('thead', {}, [h('tr', {}, ['Page', 'Size (pt)', 'Size (in)', 'Size (mm)', 'Orientation', 'Rotation'].map((label) => h('th', { text: label })))]),
            h('tbody', {}, rows)
        ]);
        const tableCard = h('div', { class: 'pw-panel-card' }, [
            h('p', { class: 'pw-note', text: report.pages.length > 200 ? 'Page sizes — showing the first 200 of ' + report.pages.length + ' pages' : 'Page sizes' }),
            h('div', { class: 'pw-table__wrap' }, [table])
        ]);
        reportBox.appendChild(tableCard);

        const xmpKeys = Object.keys(report.xmp);
        if (xmpKeys.length) {
            reportBox.appendChild(h('div', { class: 'pw-panel-card' }, [
                h('p', { class: 'pw-note', text: 'XMP metadata' }),
                kvGrid(xmpKeys.slice(0, 16).map((key) => ({ label: key, value: report.xmp[key] || '—' })))
            ]));
        }
    }

    function normaliseInfo(info) {
        const result = {};
        Object.keys(info || {}).forEach((key) => {
            const value = info[key];
            if (value === null || value === undefined) return;
            if (value instanceof Uint8Array || value instanceof ArrayBuffer) return;
            result[key] = String(value);
        });
        return result;
    }

    function copyJson() {
        if (!state.report) return;
        const text = JSON.stringify(state.report, null, 2);
        const done = () => ws.setStatus('JSON report copied to the clipboard.', 'success');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        const area = h('textarea', { class: 'pw-textarea', style: 'position:fixed;left:-9999px;top:0;' });
        area.value = text;
        document.body.appendChild(area);
        area.select();
        try {
            document.execCommand('copy');
            done();
        } catch (error) {
            ws.setStatus('Copy failed. Use Download JSON instead.', 'error');
        }
        area.remove();
    }

    ws.onRun(async () => {
        if (!state.report) {
            ws.setStatus('Add a PDF first.', 'error');
            return;
        }
        const text = JSON.stringify(state.report, null, 2);
        const filename = state.report.file.name.replace(/\.pdf$/i, '') + '-info.json';
        downloadBlob(new Blob([text], { type: 'application/json' }), filename);
        ws.setStatus('JSON report downloaded.', 'success');
        renderResult(ws.result, {
            title: 'Report downloaded',
            subtitle: filename,
            rows: [
                { label: 'Pages', value: String(state.report.document.pages) },
                { label: 'File size', value: state.report.file.sizeLabel },
                { label: 'Encryption', value: state.report.document.encryption }
            ],
            actions: [{ label: 'Download again', primary: true, onClick: () => downloadBlob(new Blob([text], { type: 'application/json' }), filename) }]
        });
    });
}

function detectVersion(bytes) {
    const slice = bytes.subarray(0, Math.min(bytes.length, 1024));
    const text = new TextDecoder('latin1').decode(slice);
    const match = text.match(/%PDF-(\d\.\d)/);
    return match ? match[1] : null;
}

function detectEncryption(bytes) {
    const decoder = new TextDecoder('latin1');
    const head = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 512 * 1024)));
    if (head.includes('/Encrypt')) return true;
    if (bytes.length > 512 * 1024) {
        const tail = decoder.decode(bytes.subarray(bytes.length - 512 * 1024));
        if (tail.includes('/Encrypt')) return true;
    }
    return false;
}

function round(value) {
    return Math.round(value * 10) / 10;
}

function collectSizes(pages) {
    const map = new Map();
    pages.forEach((page) => {
        const key = page.width + '×' + page.height;
        if (!map.has(key)) map.set(key, { label: knownSize(page.width, page.height) || key + ' pt', count: 0 });
        map.get(key).count += 1;
    });
    return Array.from(map.values());
}

function knownSize(width, height) {
    const sizes = [
        { name: 'A4', w: 595.28, h: 841.89 },
        { name: 'Letter', w: 612, h: 792 },
        { name: 'Legal', w: 612, h: 1008 },
        { name: 'A3', w: 841.89, h: 1190.55 },
        { name: 'A5', w: 419.53, h: 595.28 }
    ];
    const match = sizes.find((size) => Math.abs(size.w - width) < 3 && Math.abs(size.h - height) < 3);
    return match ? match.name : null;
}

function dominantOrientation(pages) {
    if (!pages.length) return '—';
    const landscape = pages.filter((page) => page.orientation === 'landscape').length;
    if (landscape === 0) return 'Portrait';
    if (landscape === pages.length) return 'Landscape';
    return 'Mixed';
}

function formatPdfDate(value) {
    if (!value) return '—';
    const text = String(value);
    const match = text.match(/^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
    if (!match) return text;
    const date = new Date(
        Number(match[1]),
        Math.max(0, Number(match[2] || 1) - 1),
        Number(match[3] || 1),
        Number(match[4] || 0),
        Number(match[5] || 0),
        Number(match[6] || 0)
    );
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
