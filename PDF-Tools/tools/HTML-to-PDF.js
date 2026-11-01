import { loadHtml2Pdf, sanitizeName, formatBytes, downloadBlob, readFileBytes } from './engine.js';
import { createWorkspace, h, field, segmented, rangeField, renderResult, iconMarkup, note } from './ui.js';

const PAGE_FORMATS = {
    a4: { label: 'A4', mm: [210, 297] },
    letter: { label: 'US Letter', mm: [215.9, 279.4] },
    legal: { label: 'US Legal', mm: [215.9, 355.6] },
    a3: { label: 'A3', mm: [297, 420] },
    a5: { label: 'A5', mm: [148, 210] }
};

const TEMPLATES = {
    basic: `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; color: #1f2937; padding: 28px; line-height: 1.6; }
  h1 { color: #0f766e; border-bottom: 3px solid #0f766e; padding-bottom: 10px; margin-bottom: 6px; }
  h2 { color: #334155; margin-top: 22px; margin-bottom: 6px; }
  p { margin: 10px 0; }
  .muted { color: #64748b; font-size: 13px; }
</style>
</head>
<body>
  <h1>Document title</h1>
  <p class="muted">Prepared with HTML to PDF · Alok Systems Tools</p>
  <h2>Section one</h2>
  <p>Replace this text with your own content. Every heading, table, list, and colour you write here appears in the generated PDF.</p>
  <h2>Section two</h2>
  <p>Add <strong>bold</strong>, <em>italic</em>, links, lists, and images. Use CSS page-break-before: always on a block to start a new page.</p>
</body>
</html>`,
    invoice: `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; color: #1f2937; padding: 28px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 14px; margin-bottom: 22px; }
  .brand { font-size: 24px; font-weight: 700; color: #0f766e; }
  .muted { color: #64748b; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin: 18px 0; }
  th, td { border: 1px solid #dbe4e2; padding: 10px 12px; text-align: left; font-size: 14px; }
  th { background: #0f766e; color: #ffffff; }
  .total { text-align: right; font-size: 18px; font-weight: 700; margin-top: 12px; }
</style>
</head>
<body>
  <div class="top">
    <div>
      <div class="brand">Your Company</div>
      <div class="muted">support@example.com · +91 00000 00000</div>
    </div>
    <div class="muted">
      <strong>Invoice #INV-1001</strong><br>
      Date: 01 November 2026
    </div>
  </div>
  <p><strong>Billed to:</strong> Customer Name<br>Customer address line<br>City, State, PIN</p>
  <table>
    <tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr>
    <tr><td>Design service</td><td>2</td><td>₹5,000</td><td>₹10,000</td></tr>
    <tr><td>Development hours</td><td>8</td><td>₹1,500</td><td>₹12,000</td></tr>
  </table>
  <div class="total">Total: ₹22,000</div>
</body>
</html>`,
    resume: `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; color: #1f2937; padding: 30px; line-height: 1.55; }
  .name { font-size: 28px; font-weight: 700; color: #0f766e; }
  .contact { color: #64748b; margin-bottom: 18px; }
  .section { margin-top: 20px; }
  .section h2 { font-size: 17px; color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 4px; margin-bottom: 8px; }
  .job { font-weight: 700; }
  .date { color: #64748b; font-style: italic; font-size: 13px; }
  ul { margin: 6px 0 0 18px; padding: 0; }
</style>
</head>
<body>
  <div class="name">Your Name</div>
  <div class="contact">email@example.com · +91 00000 00000 · City, India</div>
  <div class="section">
    <h2>Experience</h2>
    <div class="job">Job Title — Company Name</div>
    <div class="date">January 2022 – Present</div>
    <ul>
      <li>Describe an achievement with a measurable result.</li>
      <li>Describe a responsibility or project you led.</li>
    </ul>
  </div>
  <div class="section">
    <h2>Education</h2>
    <div class="job">Degree — University Name</div>
    <div class="date">2018 – 2022</div>
  </div>
  <div class="section">
    <h2>Skills</h2>
    <p>HTML, CSS, JavaScript, communication, project management.</p>
  </div>
</body>
</html>`
};

export function render(panel) {
    const ws = createWorkspace(panel, {
        accept: '.html,.htm,text/html',
        prompt: 'Drop an HTML file (optional)',
        hint: 'or paste HTML below — everything is rendered on this device',
        runLabel: 'Create PDF'
    });

    const state = { size: 'a4', orientation: 'portrait', margin: 12, scale: 2, base: 'document', busy: false };

    const template = segmented({
        label: 'Start from a template',
        value: 'basic',
        options: [
            { value: 'basic', label: 'Basic' },
            { value: 'invoice', label: 'Invoice' },
            { value: 'resume', label: 'Resume' }
        ],
        onChange: (value) => {
            if (state.busy) return;
            editor.value = TEMPLATES[value];
            schedulePreview();
        }
    });
    const importButton = h('button', { type: 'button', class: 'pw-btn pw-btn--ghost pw-btn--small', text: 'Load .html file' });
    const importInput = h('input', { type: 'file', accept: '.html,.htm,text/html', hidden: true });
    const editor = h('textarea', { class: 'pw-textarea', rows: '12', spellcheck: 'false' });
    editor.value = TEMPLATES.basic;
    const previewFrame = h('iframe', { class: 'pw-html-frame', sandbox: 'allow-same-origin', title: 'HTML preview' });
    const previewNote = h('p', { class: 'pw-hint', text: 'Preview updates as you type. Scripts are removed from HTML for safety.' });
    const sizeSelect = h('select', { class: 'pw-select' }, Object.keys(PAGE_FORMATS).map((value) => h('option', {
        value,
        text: PAGE_FORMATS[value].label + ' (' + PAGE_FORMATS[value].mm.join(' × ') + ' mm)',
        selected: value === 'a4'
    })));
    const sizeField = field({ label: 'Page size', control: sizeSelect });
    const orientation = segmented({
        label: 'Orientation',
        value: 'portrait',
        options: [
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' }
        ],
        onChange: (value) => { state.orientation = value; updateSummary(); }
    });
    const marginField = rangeField({ label: 'Page margin', min: 0, max: 25, value: 12, suffix: ' mm', onInput: (value) => { state.margin = Number(value); updateSummary(); } });
    const scale = segmented({
        label: 'Render quality',
        value: '2',
        options: [
            { value: '1', label: 'Standard' },
            { value: '2', label: 'High' },
            { value: '3', label: 'Print' }
        ],
        onChange: (value) => { state.scale = Number(value); }
    });
    const outputName = field({ label: 'Output file name', value: 'document' });
    const summary = h('div', { class: 'pw-inline-note', html: iconMarkup('info') + '<span>A4 portrait · 12 mm margins</span>' });

    ws.extra.appendChild(h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'HTML' }), h('span', { text: 'Full documents or fragments' })]),
        h('div', { class: 'pw-inline' }, [template]),
        h('div', { class: 'pw-inline' }, [importButton, importInput]),
        editor,
        previewNote,
        h('div', { class: 'pw-html-preview' }, [previewFrame]),
        h('div', { class: 'pw-group__label' }, [h('strong', { text: 'Page setup' }), h('span', { text: 'Applied when generating the PDF' })]),
        h('div', { class: 'pw-grid' }, [sizeField, outputName]),
        orientation,
        h('div', { class: 'pw-grid' }, [marginField, scale]),
        summary,
        note('Use CSS page-break-before: always to start a new page. External images must allow cross-origin access to appear in the PDF.')
    ]));

    editor.addEventListener('input', () => {
        schedulePreview();
        updateRunState();
    });
    sizeSelect.addEventListener('change', () => { state.size = sizeSelect.value; updateSummary(); });
    importButton.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
        const file = (importInput.files || [])[0];
        importInput.value = '';
        if (file) await importFile(file);
    });

    let previewTimer = null;
    function schedulePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(renderPreview, 300);
    }

    function renderPreview() {
        const parts = sanitizeHtml(editor.value);
        previewFrame.srcdoc = buildDocument(parts);
    }

    function updateSummary() {
        summary.innerHTML = iconMarkup('info') + '<span>' + PAGE_FORMATS[state.size].label + ' ' + state.orientation + ' · ' + state.margin + ' mm margins</span>';
    }

    function updateRunState() {
        ws.setReady(editor.value.trim().length > 0);
    }

    async function importFile(file) {
        try {
            const bytes = await readFileBytes(file);
            editor.value = new TextDecoder('utf-8').decode(bytes);
            state.base = sanitizeName(file.name.replace(/\.html?$/i, ''), 'document');
            outputName.control.value = state.base;
            template.value = '';
            template.querySelectorAll('.pw-segment').forEach((button) => {
                button.classList.remove('is-active');
                button.setAttribute('aria-pressed', 'false');
            });
            renderPreview();
            updateRunState();
            ws.setStatus('Imported ' + file.name + '.', 'success');
        } catch (error) {
            ws.showError(error);
        }
    }

    ws.onFiles(async (file) => {
        await importFile(file);
    });

    ws.onReset(() => {
        editor.value = TEMPLATES.basic;
        state.base = 'document';
        outputName.control.value = 'document';
        renderPreview();
        updateRunState();
        ws.setStatus('');
        ws.setProgress(null);
    });

    ws.onRun(async () => {
        const source = editor.value.trim();
        if (!source) throw new Error('Add some HTML first.');
        state.busy = true;
        ws.setBusy(true, 'Loading renderer…');
        ws.setProgress(8, 'Loading renderer…');
        try {
            const html2pdf = await loadHtml2Pdf();
            const parts = sanitizeHtml(source);
            const dims = PAGE_FORMATS[state.size].mm.slice();
            let pageWidthMm = dims[0];
            let pageHeightMm = dims[1];
            if (state.orientation === 'landscape') [pageWidthMm, pageHeightMm] = [pageHeightMm, pageWidthMm];
            const contentWidth = Math.max(120, Math.round(((pageWidthMm - state.margin * 2) / 25.4) * 96));
            ws.setProgress(24, 'Laying out page…');
            const stage = await createStage(parts, contentWidth);
            try {
                ws.setProgress(38, 'Rendering HTML…');
                const opts = {
                    margin: state.margin,
                    image: { type: 'jpeg', quality: 0.96 },
                    html2canvas: {
                        scale: state.scale,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false,
                        windowWidth: contentWidth,
                        scrollX: 0,
                        scrollY: 0
                    },
                    jsPDF: { unit: 'mm', format: state.size, orientation: state.orientation },
                    pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'img'] }
                };
                const pdf = await html2pdf().set(opts).from(stage.body).toPdf().get('pdf');
                ws.setProgress(88, 'Saving PDF…');
                try {
                    pdf.setProperties({ title: parts.title || outputName.control.value || 'HTML document', creator: 'Alok Systems Tools' });
                } catch (error) {
                    // Metadata is optional; keep the rendered document.
                }
                const blob = pdf.output('blob');
                const pages = pdf.internal.getNumberOfPages();
                const filename = sanitizeName(outputName.control.value, state.base) + '.pdf';
                downloadBlob(blob, filename);
                ws.setProgress(100, 'Complete');
                ws.setBusy(false);
                ws.setStatus('');
                renderResult(ws.result, {
                    title: 'Created a ' + pages + '-page PDF',
                    subtitle: filename + ' · ' + formatBytes(blob.size),
                    rows: [
                        { label: 'Pages', value: String(pages) },
                        { label: 'Layout', value: PAGE_FORMATS[state.size].label + ' ' + state.orientation },
                        { label: 'Size', value: formatBytes(blob.size) }
                    ],
                    actions: [{ label: 'Download again', primary: true, onClick: () => downloadBlob(blob, filename) }]
                });
            } catch (error) {
                throw new Error('The HTML could not be rendered. Check that external images allow cross-origin access, then try again. (' + (error && error.message ? error.message : 'render error') + ')');
            } finally {
                stage.cleanup();
            }
        } finally {
            state.busy = false;
            ws.setBusy(false);
            updateRunState();
        }
    });

    function sanitizeHtml(source) {
        const doc = new DOMParser().parseFromString(String(source || ''), 'text/html');
        doc.querySelectorAll('script, iframe, object, embed, base, noscript, link, meta').forEach((node) => node.remove());
        doc.querySelectorAll('*').forEach((node) => {
            Array.from(node.attributes).forEach((attribute) => {
                const name = attribute.name.toLowerCase();
                if (name.startsWith('on') || name === 'srcdoc') node.removeAttribute(attribute.name);
                else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
            });
        });
        return {
            head: doc.head.innerHTML,
            body: doc.body.innerHTML,
            title: doc.title.trim()
        };
    }

    function buildDocument(parts) {
        return '<!DOCTYPE html><html><head><meta charset="utf-8">'
            + '<style>html,body{margin:0;padding:0;background:#ffffff;color:#111827;font-family:Inter,Arial,sans-serif}img{max-width:100%}</style>'
            + parts.head
            + '</head><body>' + parts.body + '</body></html>';
    }

    async function createStage(parts, widthPx) {
        const frame = h('iframe', { sandbox: 'allow-same-origin', title: 'Render stage' });
        frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;background:#ffffff;width:' + widthPx + 'px;height:120px;';
        const loaded = new Promise((resolve) => { frame.onload = resolve; });
        document.body.appendChild(frame);
        frame.srcdoc = buildDocument(parts);
        await loaded;
        const doc = frame.contentDocument;
        if (!doc || !doc.body) throw new Error('The render frame could not be read.');
        try { await doc.fonts.ready; } catch (error) { /* Fonts are optional. */ }
        await Promise.all(Array.from(doc.images).map((image) => new Promise((resolve) => {
            if (image.complete) { resolve(); return; }
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
        })));
        const height = Math.max(120, doc.documentElement.scrollHeight, doc.body.scrollHeight);
        frame.style.height = height + 'px';
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { body: doc.body, cleanup: () => frame.remove() };
    }

    renderPreview();
    updateSummary();
    updateRunState();
}
