# FormReady — Bulk Document Converter & Resizer

"Prepare Every Document. In One Go."

A single, privacy-first workspace to upload many photos, signatures, certificates and
PDFs, configure different requirements for each file, then process and download
everything — separately or as one ZIP.

## What it does

One workflow: **Upload → Configure → Process → Result**.

- Upload 10–20+ files at once (JPG, JPEG, PNG, WEBP, GIF, PDF) via dialog or drag & drop
- Give every file its own settings: output format, **maximum** size, dimensions, quality
- Or set bulk defaults and apply them to all files (`Apply to All`)
- Convert images to JPG / PNG / WEBP / PDF
- Iterative compression to hit a target size (quality binary search, then dimension reduction if allowed)
- Merge images into a **single ordered PDF**
- Compress PDFs (object-stream optimisation + reported raster fallback)
- Render PDF → JPG / PNG (all pages or selected pages)
- Rename files, crop, rotate, resize via an in-app editor
- Real progress, real verification: every result is measured against its requirement
- Download individually or as `FormReady_Application_Pack.zip`

## Privacy

100% client-side. No backend. Files never leave the browser and are cleared from
memory when you clear the workspace.

Open-source libraries are loaded from a CDN:
- [pdf-lib](https://github.com/Hopding/pdf-lib)
- [PDF.js](https://mozilla.github.io/pdf.js/)
- [JSZip](https://stuk.github.io/jszip/)

## Tech

- HTML5, CSS3, Vanilla JavaScript (ES modules)
- No frontend framework, no build step — open `index.html` directly or serve the folder statically

## Structure

```
formready/
├── index.html
├── css/            main.css · components.css · responsive.css
├── js/
│   ├── app.js                 main controller & workflow
│   ├── state.js               central application state
│   ├── upload.js              file ingestion (dialog / drag & drop)
│   ├── file-manager.js        record CRUD
│   ├── image-processing.js    canvas image engine
│   ├── compression.js         per-file processing pipeline
│   ├── pdf-processing.js      PDF.js rendering + pdf-lib building
│   ├── classification.js      filename-based category suggestions
│   ├── preview.js             previews & dimensions
│   ├── zip.js                 ZIP + downloads
│   ├── ui.js                  rendering, modals, toasts
│   └── utils.js               shared helpers
├── workers/
│   └── processing-worker.js   off-main-thread compression
└── assets/                    favicon · og-image
```

## Run

Serving over HTTP is recommended (some browsers restrict modules on `file://`):

```
npx serve .
# or python -m http.server
```

Then open `http://localhost:3000`.

## Notes on requirements

Example values like "JPG ≤ 50 KB" or "resize to 35 × 45 mm" are generic starting points,
never claims about specific organisations' requirements. Because every requirement is
a **maximum** and results are verified, you can adjust any file until the "requirement
satisfied" check passes.