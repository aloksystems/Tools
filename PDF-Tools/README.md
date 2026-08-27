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

* **[PDF to JPG](PDF-to-JPG/index.html)** - Export PDF pages as high-quality JPG or PNG images.

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

* **[Compress PDF](Compress-PDF/index.html)** - Rewrite and optimize PDF documents to reduce file size where possible.

* **[PDF Size Reducer](Pdf-Size-Reducer/index.html)** - Reduce PDF file size toward a selected target such as 100 KB, 400 KB, 500 KB, or 1 MB.

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

Open:

```text
PDF-Tools/index.html
```

This is the **main PDF Tools dashboard** containing links to all available tools.

Select the tool you need and follow the instructions shown on that tool's page.

### Running Locally

You can run the project using any local HTTP server.

#### Python HTTP Server

1. Make sure Python is installed.

2. Navigate to the PDF-Tools directory:

```bash
cd path/to/PDF-Tools
```

3. Start a local HTTP server:

```bash
python -m http.server 8000
```

4. Open:

```text
http://localhost:8000
```

5. Open the main dashboard:

```text
http://localhost:8000/index.html
```

### Using VS Code Live Server

You can also use the **Live Server** extension in VS Code.

Open the `PDF-Tools` folder and launch:

```text
index.html
```

with Live Server.

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
* **CSS3** - Styling and responsive layouts
* **JavaScript (ES6+)** - Functionality and interactivity
* **Font Awesome** - Icons

### PDF & Document Libraries

* **[pdf-lib](https://pdf-lib.js.org/)** - PDF creation and manipulation
* **[PDF.js](https://mozilla.github.io/pdf.js/)** - PDF rendering and text extraction
* **[JSZip](https://stuk.github.io/jszip/)** - ZIP file creation for batch downloads
* **[html2pdf.js](https://github.com/eKoopmans/html2pdf.js)** - HTML to PDF conversion

### Utilities

* **FileSaver.js** - Client-side file saving
* Browser **File API**
* Browser **Canvas API**
* Browser-based processing APIs where applicable

---

## File Structure

The project is organized so that **PDF-Tools itself contains the main dashboard**, while every individual PDF tool has its own dedicated folder.

```text
PDF-Tools/
│
├── index.html                         # Main PDF Tools dashboard
│
├── icons/                             # Shared icons/assets
│
├── Merge-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Split-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Compress-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Pdf-Size-Reducer/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Rotate-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Unlock-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Watermark-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Add-Page-Numbers/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Extract-Pages/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Delete-Pages/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Reorder-PDF-Pages/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Sign-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── PDF-Metadata-Editor/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── PDF-Info/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── PDF-to-JPG/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── JPG-to-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── HTML-to-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── PDF-to-Text/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Protect-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Crop-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Highlight-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Edit-PDF-Text/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── OCR-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── Scan-to-PDF/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── app.js                              # Shared application logic
├── style.css                           # Shared/global styles
├── premium-theme.css                   # Shared premium UI theme
├── premium-ui.js                       # Shared UI enhancements
├── tool-registry.js                    # Tool configuration/registry
├── tool-shell.js                       # Shared tool shell behavior
├── theme-init.js                       # Theme initialization
├── service-worker.js                   # Service worker
├── manifest.json                       # Web app manifest
└── README.md                           # Project documentation
```

### Folder Structure Principle

Each individual PDF tool follows this pattern:

```text
Tool-Name/
├── index.html
├── script.js
└── style.css
```

The root `PDF-Tools/index.html` remains the **main dashboard**.

Shared resources remain in the `PDF-Tools` root instead of being unnecessarily duplicated inside every tool folder.

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
