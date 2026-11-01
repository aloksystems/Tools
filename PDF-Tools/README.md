# PDF Tools Collection

A comprehensive suite of **23 browser-based PDF tools** for organizing, converting, editing, securing, optimizing, and analyzing PDF documents.

All supported processing happens locally in your browser — **your files never leave your computer.**

## Table of Contents

* [Available Tools](#available-tools)
* [How to Use](#how-to-use)
* [Features](#features)
* [Security and Privacy](#security-and-privacy)
* [Technology Stack](#technology-stack)
* [File Structure](#file-structure)
* [License](#license)
* [Support](#support)

## Available Tools

### 🔁 Conversion Tools

* **[JPG to PDF](JPG-to-PDF/index.html)** - Combine JPG or PNG images into a single ordered PDF document.

* **[PDF to JPG](PDF-to-JPG/index.html)** - Export PDF pages as JPG, PNG, or WebP images at up to 300 DPI.

* **[PDF to Text](PDF-to-Text/index.html)** - Extract text from PDF documents and export it as TXT or RTF.

* **[HTML to PDF](HTML-to-PDF/index.html)** - Convert HTML content into print-ready PDF documents.

* **[OCR PDF](OCR-PDF/index.html)** - Extract text from scanned or image-based PDFs using browser-based OCR where supported.

* **[Scan to PDF](Scan-to-PDF/index.html)** - Create PDF documents from camera captures or uploaded scanned images.

### 📂 Organize Tools

* **[Merge PDF](Merge-PDF/index.html)** - Combine multiple PDF files into a single document and reorder pages.

* **[Split PDF](Split-PDF/index.html)** - Split a PDF into smaller files using page ranges.

* **[Extract Pages](Extract-Pages/index.html)** - Select and export specific pages from a PDF.

* **[Delete Pages](Delete-Pages/index.html)** - Remove selected pages from a PDF document.

* **[Reorder PDF Pages](Reorder-PDF-Pages/index.html)** - Reorder PDF pages using a drag-and-drop workflow.

* **[Rotate PDF](Rotate-PDF/index.html)** - Rotate PDF pages by 90°, 180°, or 270°.

### 🗜️ Compression & Optimization

* **[PDF Size Reducer](Pdf-Size-Reducer/index.html)** - Reduce PDF file size toward a selected target such as 100 KB, 500 KB, 1 MB, or a custom size.

### ✏️ Edit & Review Tools

* **[Watermark PDF](Watermark-PDF/index.html)** - Add text or image watermarks to PDF documents.

* **[Add Page Numbers](Add-Page-Numbers/index.html)** - Add customizable page numbers with flexible positions and styles.

* **[Crop PDF](Crop-PDF/index.html)** - Crop PDF pages to remove unwanted margins or whitespace.

* **[Highlight PDF](Highlight-PDF/index.html)** - Add translucent highlights to PDF pages for reviewing and annotating documents.

* **[Edit PDF Text](Edit-PDF-Text/index.html)** - Add replacement text overlays to PDF pages.

* **[Sign PDF](Sign-PDF/index.html)** - Add typed or drawn signatures to PDF documents.

### 🔐 Security Tools

* **[Protect PDF](Protect-PDF/index.html)** - Create a protected copy of a PDF using the available browser-based protection workflow.

* **[Unlock PDF](Unlock-PDF/index.html)** - Remove password protection from authorized PDF files.

### ℹ️ PDF Information & Metadata

* **[PDF Metadata Editor](PDF-Metadata-Editor/index.html)** - Update PDF metadata such as title, author, subject, and keywords.

* **[PDF Info](PDF-Info/index.html)** - Inspect PDF metadata, page count, dimensions, and document statistics.

---

## How to Use

### Using the Main PDF Tools Page

The dashboard itself is plain HTML and opens from anywhere:

```text
PDF-Tools/index.html
```

It lists every tool. The tool pages themselves load their interface as JavaScript
modules, and browsers refuse to load module files from `file://`, so they need a web
server — see **Running Locally** below. Opened straight from disk, a tool page shows a
short notice with the exact command and address to use instead.

### Running Locally

Serve the folder that **contains** `PDF-Tools` (not `PDF-Tools` itself) — the tool pages
reference shared files one level up, e.g. `../theme-init.js` and `../../back.css`.

#### Python HTTP Server

1. Make sure Python is installed.

2. Start a local HTTP server from the parent folder:

```bash
cd path/to/Tools
python -m http.server 8000
```

3. Open the PDF Tools dashboard:

```text
http://localhost:8000/PDF-Tools/
```

4. Individual tools are then served from:

```text
http://localhost:8000/PDF-Tools/Merge-PDF/
```

### Using VS Code Live Server

You can also use the **Live Server** extension in VS Code. Open the folder that contains
`PDF-Tools`, right-click `PDF-Tools/index.html` and choose **Open with Live Server**.

---

## Features

### 🌐 Browser-Based Processing

* No server uploads required.
* PDF processing happens directly in the browser where supported.
* Files remain on the user's device.
* No cloud storage is required.
* Many tools can work without an internet connection once required resources are available locally.

### 🖱️ User-Friendly Interface

* Modern and responsive interface.
* Drag-and-drop file handling where applicable.
* Clear controls and feedback.
* Preview functionality where applicable.
* Mobile-friendly layouts.
* Consistent design across the entire PDF Tools collection.

### 🔧 Comprehensive PDF Toolkit

The collection covers:

* PDF organization
* PDF conversion
* PDF compression
* PDF size reduction
* PDF editing
* PDF review
* PDF signing
* PDF security
* PDF metadata
* PDF information
* OCR
* Scanning

### ⚡ Performance

* Client-side file processing.
* Efficient browser-based workflows.
* No unnecessary server communication.
* Designed to keep sensitive documents local.

---

## Security and Privacy

### 🔒 Files Stay on Your Device

The core principle of this project is privacy.

* Files are not intentionally uploaded to a remote server for processing.
* No server-side PDF processing is required for the browser-based tools.
* No external file storage is used by the PDF tools.
* Generated files are downloaded directly to the user's device.

### 🛡️ Client-Side Processing

Where supported, PDF operations are performed directly in the browser using JavaScript and browser APIs.

This means sensitive documents such as:

* identity documents
* certificates
* forms
* invoices
* academic documents
* business documents

can be processed without sending the original file to a remote processing server.

### 🕵️ Privacy First

The project is designed around:

* No unnecessary file uploads.
* No cloud document storage.
* No third-party document processing services.
* Local browser processing wherever technically possible.

> **Important:** Browser capabilities and individual third-party libraries may impose technical limitations. The privacy behavior of each tool depends on its actual implementation and loaded resources.

---

## Technology Stack

### Frontend

* **HTML5** - Structure and content
* **CSS3** - Styling, theming, and responsive layouts
* **JavaScript ES modules** - Functionality and interactivity
* **Inter (Google Fonts)** - Typography

### PDF & Document Libraries

* **[pdf-lib](https://pdf-lib.js.org/)** - PDF creation and manipulation
* **[PDF.js](https://mozilla.github.io/pdf.js/)** - PDF rendering and text extraction
* **[JSZip](https://stuk.github.io/jszip/)** - ZIP file creation for batch downloads
* **[Tesseract.js](https://tesseract.projectnaptha.com/)** - On-device OCR
* **[html2pdf.js](https://github.com/eKoopmans/html2pdf.js)** - HTML to PDF conversion

### Utilities

* Browser **File API**
* Browser **Canvas API**
* Browser **Clipboard API**
* Blob URLs for client-side downloads

Libraries are loaded from CDN only when a tool needs them.

---

## File Structure

`PDF-Tools/index.html` is the dashboard. Every tool folder contains only its HTML shell; all behavior lives in shared ES modules under `tools/`.

```text
PDF-Tools/
│
├── index.html                         # Main PDF Tools dashboard
├── tool.html                          # Generic shell: tool.html?tool=Tool-Id
├── tool-registry.js                   # Titles, categories, icons, and routes for all 23 tools
├── tool-shell.js                      # Loads the matching module into the shell
├── app.js                             # Dashboard filtering, search, and favorites
├── style.css                          # Dashboard styles
├── premium-theme.css                  # Shared design tokens and components
├── premium-ui.js                      # Shared enhancements (theme menu, pin, toasts)
├── theme-init.js                      # Applies the saved theme before paint
├── service-worker.js                  # Network-first offline shell cache
├── manifest.json                      # Web app manifest
├── icons/                             # App icons
├── css/
│   └── pdf-tool.css                   # Tool workspace layout
│
├── tools/
│   ├── engine.js                      # PDF libraries, rendering, OCR, image, download helpers
│   ├── ui.js                          # Workspace, fields, segmented controls, result cards
│   ├── Merge-PDF.js
│   ├── Split-PDF.js
│   ├── Pdf-Size-Reducer.js
│   ├── Rotate-PDF.js
│   ├── Extract-Pages.js
│   ├── Delete-Pages.js
│   ├── Reorder-PDF-Pages.js
│   ├── Add-Page-Numbers.js
│   ├── Sign-PDF.js
│   ├── Watermark-PDF.js
│   ├── Crop-PDF.js
│   ├── Highlight-PDF.js
│   ├── Edit-PDF-Text.js
│   ├── PDF-Metadata-Editor.js
│   ├── PDF-Info.js
│   ├── PDF-to-JPG.js
│   ├── JPG-to-PDF.js
│   ├── PDF-to-Text.js
│   ├── HTML-to-PDF.js
│   ├── OCR-PDF.js
│   ├── Protect-PDF.js
│   ├── Unlock-PDF.js
│   └── Scan-to-PDF.js
│
├── Merge-PDF/index.html               # HTML shell only
├── Split-PDF/index.html
├── ...                                # One folder per tool (23 total)
└── README.md
```

### Folder Structure Principle

Every tool folder contains a single `index.html` that declares its metadata and loads the shared shell:

```html
<script type="module" src="../tool-shell.js"></script>
```

The shell reads the tool id, loads `tools/<Tool-Id>.js`, and that module renders into the shared workspace using `tools/ui.js` and `tools/engine.js`. Adding a tool means adding one module plus one registry entry — no duplicated CSS or script per folder.

---

## License

This project is licensed under the **MIT License**.

See the [LICENSE](LICENSE) file for complete license details.

### MIT License Summary

* Free for personal and commercial use.
* Modify and distribute freely.
* Include the original copyright and license notice.
* Provided "as is" without warranty.

---

## Support

### 📧 Contact

For questions, suggestions, or issues, please reach out to the project maintainer.

### 🐛 Reporting Issues

If you encounter a problem:

1. Check the browser console for error messages.
2. Make sure you are using a modern browser such as Chrome, Firefox, Edge, or Safari.
3. Make sure the project folder structure is intact.
4. Verify that all required files are present.
5. Check that the tool is being served through a local HTTP server when required.
6. Report the issue with detailed steps to reproduce it.

### 💡 Feature Requests

Suggestions for new tools and improvements are welcome.

When requesting a new feature, include:

* What the tool should do.
* Why it would be useful.
* Expected input and output.
* Any relevant examples.

### 🔄 Updates

Future updates may include:

* Bug fixes
* Performance improvements
* New PDF tools
* Improved browser compatibility
* UI/UX improvements
* Additional privacy-friendly utilities

---

**Made with ❤️ for the open-source community.**
