(function () {
    const categories = [
        { id: 'organize', label: 'Organize', description: 'Merge, split, reorder, extract, rotate, and delete pages.' },
        { id: 'convert', label: 'Convert', description: 'Convert PDFs to and from images, text, HTML, and OCR text.' },
        { id: 'edit-review', label: 'Edit & Review', description: 'Sign, watermark, highlight, crop, number, and inspect PDFs.' },
        { id: 'secure', label: 'Secure', description: 'Add or remove real AES password protection locally.' },
        { id: 'media', label: 'Media', description: 'Turn scans and photos into clean PDFs.' }
    ];

    const tools = [
        {
            id: 'Pdf-Size-Reducer',
            title: 'PDF Size Reducer',
            description: 'Shrink a PDF to a target size in KB or MB while keeping the best quality that fits.',
            category: 'organize',
            icon: 'minimize-2',
            href: 'Pdf-Size-Reducer/index.html',
            tips: ['Pick a target such as 200 KB or 1 MB.', 'Choose Balanced to keep text when possible.'],
            keywords: ['compress', 'reduce', 'size', 'kb', 'mb', 'optimize']
        },
        {
            id: 'Merge-PDF',
            title: 'Merge PDF',
            description: 'Combine PDFs in the order you want, with thumbnails, page ranges, and reordering.',
            category: 'organize',
            icon: 'files',
            href: 'Merge-PDF/index.html',
            tips: ['Drag rows to change the file order.', 'Use a page range to merge only part of a file.'],
            keywords: ['merge', 'combine', 'join', 'organize']
        },
        {
            id: 'Split-PDF',
            title: 'Split PDF',
            description: 'Split by fixed ranges, every N pages, or into one file per page — downloaded as a ZIP.',
            category: 'organize',
            icon: 'cut',
            href: 'Split-PDF/index.html',
            tips: ['Custom ranges look like 1-3, 5, 8-10.', 'One page per file is great for sharing single sheets.'],
            keywords: ['split', 'range', 'separate', 'extract']
        },
        {
            id: 'Rotate-PDF',
            title: 'Rotate PDF',
            description: 'Rotate individual pages or the whole document in 90° steps with a live preview.',
            category: 'organize',
            icon: 'rotate',
            href: 'Rotate-PDF/index.html',
            tips: ['Click a page thumbnail to rotate just that page.', 'Use Rotate all when a scan is consistently sideways.'],
            keywords: ['rotate', 'pages', 'orientation', 'landscape']
        },
        {
            id: 'Extract-Pages',
            title: 'Extract Pages',
            description: 'Pick pages visually and export them as one PDF or a ZIP of separate files.',
            category: 'organize',
            icon: 'file-export',
            href: 'Extract-Pages/index.html',
            tips: ['Click thumbnails to select pages.', 'The code 2-6, 9 works too if you prefer typing.'],
            keywords: ['extract', 'pages', 'export', 'select']
        },
        {
            id: 'Delete-Pages',
            title: 'Delete Pages',
            description: 'Remove unwanted pages visually and keep everything else untouched.',
            category: 'organize',
            icon: 'trash',
            href: 'Delete-Pages/index.html',
            tips: ['Selected pages are the ones that get removed.', 'Use Select all then untick pages to keep.'],
            keywords: ['delete', 'pages', 'remove']
        },
        {
            id: 'Reorder-PDF-Pages',
            title: 'Reorder PDF Pages',
            description: 'Drag thumbnails into a new order, reverse the document, or move pages by buttons.',
            category: 'organize',
            icon: 'arrows-up-down',
            href: 'Reorder-PDF-Pages/index.html',
            tips: ['Drag thumbnails to rearrange them.', 'Use the arrow buttons for precise moves.'],
            keywords: ['reorder', 'pages', 'organize', 'arrange']
        },
        {
            id: 'Add-Page-Numbers',
            title: 'Add Page Numbers',
            description: 'Stamp page numbers with your choice of position, format, size, colour, and start number.',
            category: 'edit-review',
            icon: 'list-numbers',
            href: 'Add-Page-Numbers/index.html',
            tips: ['Use “Page 1 of 12” for reports.', 'Skip the first page for cover sheets.'],
            keywords: ['page numbers', 'paginate', 'footer', 'header']
        },
        {
            id: 'Sign-PDF',
            title: 'Sign PDF',
            description: 'Draw, type, or upload a signature and place it exactly where it belongs.',
            category: 'edit-review',
            icon: 'signature',
            href: 'Sign-PDF/index.html',
            tips: ['Draw with a mouse or finger.', 'Drag the signature preview before you save.'],
            keywords: ['sign', 'signature', 'initial', 'date']
        },
        {
            id: 'Watermark-PDF',
            title: 'Watermark PDF',
            description: 'Add text or image watermarks with opacity, rotation, tiling, and page ranges.',
            category: 'edit-review',
            icon: 'droplet',
            href: 'Watermark-PDF/index.html',
            tips: ['Use tiling for a document-wide watermark.', 'Lower opacity keeps text readable underneath.'],
            keywords: ['watermark', 'protect', 'draft', 'confidential']
        },
        {
            id: 'Crop-PDF',
            title: 'Crop PDF',
            description: 'Trim margins visually or auto-detect the content area, then apply to any page range.',
            category: 'edit-review',
            icon: 'crop',
            href: 'Crop-PDF/index.html',
            tips: ['Auto trim detects the content box for you.', 'Negative values can extend the page slightly.'],
            keywords: ['crop', 'trim', 'margins', 'whitespace']
        },
        {
            id: 'Highlight-PDF',
            title: 'Highlight PDF',
            description: 'Draw translucent highlight regions on any page with custom colours and opacity.',
            category: 'edit-review',
            icon: 'highlight',
            href: 'Highlight-PDF/index.html',
            tips: ['Drag directly on the page preview.', 'Add as many highlights per page as you need.'],
            keywords: ['highlight', 'annotate', 'review', 'mark']
        },
        {
            id: 'Edit-PDF-Text',
            title: 'Edit PDF Text',
            description: 'Place new text anywhere on a page, with font, size, colour, and optional whiteout.',
            category: 'edit-review',
            icon: 'text-recognition',
            href: 'Edit-PDF-Text/index.html',
            tips: ['Click the page to place text.', 'Use whiteout to cover the old value first.'],
            keywords: ['edit', 'text', 'overlay', 'whiteout']
        },
        {
            id: 'PDF-Metadata-Editor',
            title: 'PDF Metadata Editor',
            description: 'Read and rewrite the title, author, subject, keywords, creator, and producer.',
            category: 'edit-review',
            icon: 'info-circle',
            href: 'PDF-Metadata-Editor/index.html',
            tips: ['Clear hidden metadata before sharing.', 'Keywords are comma separated.'],
            keywords: ['metadata', 'info', 'title', 'author']
        },
        {
            id: 'PDF-Info',
            title: 'PDF Info',
            description: 'Inspect metadata, page sizes, orientation, encryption, and document statistics.',
            category: 'edit-review',
            icon: 'file-info',
            href: 'PDF-Info/index.html',
            tips: ['Export the report as JSON.', 'The page table shows every page size.'],
            keywords: ['info', 'metadata', 'stats', 'details']
        },
        {
            id: 'PDF-to-JPG',
            title: 'PDF to JPG',
            description: 'Export pages as JPG, PNG, or WebP at 72–300 DPI, individually or as a ZIP.',
            category: 'convert',
            icon: 'photo-scan',
            href: 'PDF-to-JPG/index.html',
            tips: ['Use 150 DPI for sharing and 300 DPI for print.', 'Pick a page range to export only some pages.'],
            keywords: ['pdf', 'png', 'jpg', 'webp', 'image', 'export']
        },
        {
            id: 'JPG-to-PDF',
            title: 'JPG to PDF',
            description: 'Combine photos and scans into one PDF with page size, margin, rotation, and quality control.',
            category: 'convert',
            icon: 'photo',
            href: 'JPG-to-PDF/index.html',
            tips: ['Drag image rows to change page order.', 'Use A4 with a small margin for printing.'],
            keywords: ['jpg', 'png', 'webp', 'images', 'combine', 'convert']
        },
        {
            id: 'PDF-to-Text',
            title: 'PDF to Text',
            description: 'Extract readable text page by page and export as TXT or RTF.',
            category: 'convert',
            icon: 'file-text',
            href: 'PDF-to-Text/index.html',
            tips: ['Scanned PDFs need OCR instead.', 'Preview and edit the text before downloading.'],
            keywords: ['pdf', 'text', 'rtf', 'txt', 'extract']
        },
        {
            id: 'HTML-to-PDF',
            title: 'HTML to PDF',
            description: 'Render HTML and CSS into a print-ready PDF with page size and margin options.',
            category: 'convert',
            icon: 'code',
            href: 'HTML-to-PDF/index.html',
            tips: ['Use the preview to check layout before saving.', 'External images need CORS-enabled hosts.'],
            keywords: ['html', 'css', 'render', 'convert', 'webpage']
        },
        {
            id: 'OCR-PDF',
            title: 'OCR PDF',
            description: 'Recognise text in scans and images with Tesseract, then copy it or save a searchable PDF.',
            category: 'convert',
            icon: 'scan-eye',
            href: 'OCR-PDF/index.html',
            tips: ['English and Hindi are supported.', 'Searchable PDF works best with clean Latin text.'],
            keywords: ['ocr', 'scan', 'text recognition', 'searchable']
        },
        {
            id: 'Protect-PDF',
            title: 'Protect PDF',
            description: 'Encrypt a PDF with AES-256, a password, and precise print/copy/modify permissions.',
            category: 'secure',
            icon: 'lock',
            href: 'Protect-PDF/index.html',
            tips: ['Store the password somewhere safe — it cannot be recovered.', 'An owner password protects permissions.'],
            keywords: ['protect', 'password', 'security', 'encrypt', 'aes']
        },
        {
            id: 'Unlock-PDF',
            title: 'Unlock PDF',
            description: 'Remove a known password from a PDF you own and save a clean, unrestricted copy.',
            category: 'secure',
            icon: 'lock-open',
            href: 'Unlock-PDF/index.html',
            tips: ['You need the current password.', 'Restriction-only PDFs usually unlock with an empty user password.'],
            keywords: ['unlock', 'password', 'decrypt', 'restrictions']
        },
        {
            id: 'Scan-to-PDF',
            title: 'Scan to PDF',
            description: 'Capture pages with your camera or upload photos, clean them up, and build a PDF.',
            category: 'media',
            icon: 'scan',
            href: 'Scan-to-PDF/index.html',
            tips: ['Use good lighting for cleaner scans.', 'The B&W filter is ideal for documents.'],
            keywords: ['scan', 'camera', 'photo', 'pdf']
        }
    ];

    function getToolById(id) {
        return tools.find(function (tool) {
            return tool.id === id || tool.href === id;
        });
    }

    function getToolByHref(href) {
        return tools.find(function (tool) {
            return tool.href === href;
        });
    }

    window.PDF_STUDIO_REGISTRY = {
        categories: categories,
        tools: tools,
        getToolById: getToolById,
        getToolByHref: getToolByHref
    };
})();
