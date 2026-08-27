(function () {
    const categories = [
        { id: 'organize', label: 'Organize', description: 'Merge, split, reorder, extract, rotate, and delete pages.' },
        { id: 'convert', label: 'Convert', description: 'Convert PDFs to and from browser-supported formats.' },
        { id: 'edit-review', label: 'Edit & Review', description: 'Sign, watermark, highlight, crop, annotate, and inspect PDFs.' },
        { id: 'secure', label: 'Secure', description: 'Unlock authorized files, protect documents, and add usage metadata.' },
        { id: 'media', label: 'Media', description: 'Prepare images and scans for PDFs.' }
    ];

    const tools = [
        {
            id: 'merge-pdfs',
            title: 'Merge PDF',
            description: 'Combine multiple PDFs and reorder pages.',
            category: 'organize',
            icon: 'files',
            href: 'merge_pdfs.html',
            keywords: ['merge', 'combine', 'organize']
        },
        {
            id: 'split-pdf',
            title: 'Split PDF',
            description: 'Split a PDF into smaller files by range.',
            category: 'organize',
            icon: 'cut',
            href: 'split_pdf.html',
            keywords: ['split', 'range', 'extract']
        },
        {
            id: 'compress-pdf',
            title: 'Compress PDF',
            description: 'Rewrite and optimize PDFs in the browser.',
            category: 'organize',
            icon: 'file-zip',
            href: 'compress_pdf.html',
            keywords: ['compress', 'optimize', 'size']
        },
        {
            id: 'rotate-pdf',
            title: 'Rotate PDF',
            description: 'Rotate pages 90, 180, or 270 degrees.',
            category: 'organize',
            icon: 'rotate',
            href: 'rotate_pdf.html',
            keywords: ['rotate', 'pages']
        },
        {
            id: 'unlock-pdf',
            title: 'Unlock PDF',
            description: 'Remove password protection from authorized files.',
            category: 'secure',
            icon: 'lock-open',
            href: 'unlock_pdf.html',
            keywords: ['unlock', 'password']
        },
        {
            id: 'add-watermark',
            title: 'Watermark PDF',
            description: 'Protect documents with text or image marks.',
            category: 'edit-review',
            icon: 'droplet',
            href: 'add_watermark.html',
            keywords: ['watermark', 'protect']
        },
        {
            id: 'add-page-numbers',
            title: 'Add Page Numbers',
            description: 'Number pages with flexible position and style.',
            category: 'edit-review',
            icon: 'list-numbers',
            href: 'add_page_numbers.html',
            keywords: ['page numbers', 'paginate', 'footer', 'header']
        },
        {
            id: 'extract-pages',
            title: 'Extract Pages',
            description: 'Select and export only the pages you need.',
            category: 'organize',
            icon: 'file-export',
            href: 'extract_pages.html',
            keywords: ['extract', 'pages', 'export']
        },
        {
            id: 'remove-pages',
            title: 'Delete Pages',
            description: 'Delete selected pages from a PDF in seconds.',
            category: 'organize',
            icon: 'trash',
            href: 'remove_pdf.html',
            keywords: ['delete', 'pages', 'remove']
        },
        {
            id: 'rearrange-pages',
            title: 'Reorder PDF Pages',
            description: 'Reorder pages with a drag-and-drop flow.',
            category: 'organize',
            icon: 'arrows-up-down',
            href: 'rearrange_pdf.html',
            keywords: ['reorder', 'pages', 'organize']
        },
        {
            id: 'sign-pdf',
            title: 'Sign PDF',
            description: 'Add a typed or drawn signature in seconds.',
            category: 'edit-review',
            icon: 'signature',
            href: 'sign_pdf.html',
            keywords: ['sign', 'signature']
        },
        {
            id: 'edit-metadata',
            title: 'PDF Metadata Editor',
            description: 'Update title, author, and keywords.',
            category: 'edit-review',
            icon: 'info-circle',
            href: 'edit_metadata.html',
            keywords: ['metadata', 'info']
        },
        {
            id: 'pdf-info',
            title: 'PDF Info',
            description: 'Review metadata, page count, and document stats.',
            category: 'edit-review',
            icon: 'file-info',
            href: 'pdf_info.html',
            keywords: ['info', 'metadata', 'stats']
        },
        {
            id: 'pdf-to-images',
            title: 'PDF to JPG',
            description: 'Export PDF pages as high-quality PNG or JPG files.',
            category: 'convert',
            icon: 'photo-scan',
            href: 'pdf_to_image.html',
            keywords: ['pdf', 'png', 'jpg', 'export']
        },
        {
            id: 'images-to-pdf',
            title: 'JPG to PDF',
            description: 'Combine JPG or PNG files into a single ordered PDF.',
            category: 'convert',
            icon: 'photo',
            href: 'images_to_pdf.html',
            keywords: ['jpg', 'png', 'combine', 'convert', 'merge']
        },
        {
            id: 'html-to-pdf',
            title: 'HTML to PDF',
            description: 'Render HTML and CSS into a print-ready PDF.',
            category: 'convert',
            icon: 'code',
            href: 'html_to_pdf.html',
            keywords: ['html', 'css', 'render', 'convert']
        },
        {
            id: 'extract-text',
            title: 'PDF to Text',
            description: 'Pull text from PDFs and export as TXT or RTF.',
            category: 'convert',
            icon: 'file-text',
            href: 'pdf_to_file.html',
            keywords: ['pdf', 'text', 'rtf', 'txt']
        },
        {
            id: 'protect-pdf',
            title: 'Protect PDF',
            description: 'Add owner metadata and download a protected-copy workflow.',
            category: 'secure',
            icon: 'lock',
            href: 'tool.html?tool=protect-pdf',
            module: true,
            status: 'browser-supported',
            keywords: ['protect', 'password', 'security', 'encrypt']
        },
        {
            id: 'crop-pdf',
            title: 'Crop PDF',
            description: 'Apply page crop margins to trim whitespace or headers.',
            category: 'edit-review',
            icon: 'crop',
            href: 'tool.html?tool=crop-pdf',
            module: true,
            keywords: ['crop', 'trim', 'margins']
        },
        {
            id: 'highlight-pdf',
            title: 'Highlight PDF',
            description: 'Place translucent highlights on selected pages.',
            category: 'edit-review',
            icon: 'highlight',
            href: 'tool.html?tool=highlight-pdf',
            module: true,
            keywords: ['highlight', 'annotate', 'review']
        },
        {
            id: 'edit-pdf-text',
            title: 'Edit PDF Text',
            description: 'Overlay replacement text blocks on PDF pages.',
            category: 'edit-review',
            icon: 'text-recognition',
            href: 'tool.html?tool=edit-pdf-text',
            module: true,
            keywords: ['edit', 'text', 'overlay']
        },
        {
            id: 'ocr-pdf',
            title: 'OCR PDF',
            description: 'Run browser OCR when supported and export recognized text.',
            category: 'convert',
            icon: 'scan-eye',
            href: 'tool.html?tool=ocr-pdf',
            module: true,
            keywords: ['ocr', 'scan', 'text recognition']
        },
        {
            id: 'scan-to-pdf',
            title: 'Scan to PDF',
            description: 'Use camera captures or uploaded scans to build a PDF.',
            category: 'media',
            icon: 'scan',
            href: 'tool.html?tool=scan-to-pdf',
            module: true,
            keywords: ['scan', 'camera', 'pdf']
        }
    ];

    function getToolById(id) {
        return tools.find(function (tool) {
            return tool.id === id;
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
