const projectsData = [
    // Developer Tools
    {
        name: "JSON Formatter",
        category: "Developer Tools",
        description: "A powerful, easy-to-use online tool for formatting, validating, and minifying JSON data. This tool runs entirely in your browser with no server-side processing, ensuring your data privacy and security.",
        tags: ["JavaScript", "JSON", "Formatter"],
        demo: "https://aloksystems.github.io/Tools/JSON-Formatter/",
        pinned: true,
    },
    {
        name: "TempMail",
        category: "Developer Tools",
        description: "A secure and lightweight temporary email service that lets users generate disposable email addresses instantly for OTPs, testing, signups, and privacy protection. Fast, clean, and easy to use with real-time inbox support.",
        tags: ["JavaScript", "Temp Mail", "Email"],
        demo: "https://aloksystems.github.io/Tools//TempMail/",
        pinned: true,
    },
    {
        name: "Text Processing Suite",
        category: "Developer Tools",
        description: "A powerful, browser-based text processing tool that provides real-time statistics and various text manipulation features. All processing happens locally in your browser - no data is sent to any server.",
        tags: ["JavaScript", "Text Processing", "Utilities"],
        demo: "https://aloksystems.github.io/Tools//Text-Processing-Suite/",
    },
    {
        name: "Font Preview",
        category: "Developer Tools",
        description: "The Font Preview Tool is a web-based application that allows users to preview and test Google Fonts instantly. Users can type custom text and see it rendered in various Google Fonts with real-time customization options for font size, text color, and background color. The tool also provides functionality to copy CSS code for implementing fonts in projects and export font previews as images.",
        tags: ["CSS", "Fonts", "Design"],
        demo: "https://aloksystems.github.io/Tools//Font-Preview/",
    },
    {
        name: "Color Palette Generator",
        category: "Developer Tools",
        description: "A powerful, browser-based tool for generating color palettes, CSS gradients, and accessibility checking. This application helps designers and developers create beautiful color schemes and gradients for their projects.",
        tags: ["JavaScript", "CSS", "Colors"],
        demo: "https://aloksystems.github.io/Tools//Color-Palette-Gradient/",
        pinned: true,
    },

    // Productivity & Utilities
    {
        name: "One Page Print",
        category: "Productivity",
        description: "A smart PDF and image printing tool for fitting multiple pages onto fewer physical sheets with customizable N-up grid layouts, live print preview, page reordering, paper settings, automatic sheet calculation, and PDF export.",
        tags: ["React", "TypeScript", "PDF", "Image Tools", "N-up Printing", "Productivity"],
        demo: "https://aloksystems.github.io/Tools//one-page-print/",
        pinned: true,
        featured: true,
    },
    {
        name: "Todo",
        category: "Productivity",
        description: "A modern task management app designed for simplicity and focus, featuring secure authentication, task search, priority-based organization, completion tracking, filtering, and sorting.",
        tags: ["React", "TypeScript", "Supabase", "Productivity", "Task Management"],
        demo: "https://todo-murex-omega-74.vercel.app/",
        pinned: true,
        featured: true,
    },
    {
        name: "SnapShare",
        category: "Productivity",
        description: "A secure temporary file sharing platform with password protection, auto-expiry, one-time viewing, and download restrictions built using Express, Vite, and TypeScript.",
        tags: ["TypeScript", "Express", "Vite", "File Sharing", "Security"],
        demo: "https://snapshare-i9u7.onrender.com/",
        pinned: true,
        featured: true,
    },

    {
        name: "Age Calculator",
        category: "Productivity",
        description: "Age Calculator Pro",
        tags: ["JavaScript", "Date", "Calculator"],
        demo: "https://aloksystems.github.io/Tools//Age-Calculator/",
    },

    // Games & Fun
    {
        name: "Number Counting",
        category: "Games & Fun",
        description: "A fun and interactive number counting application perfect for learning and practicing number skills.",
        tags: ["JavaScript", "Educational", "Interactive"],
        demo: "https://aloksystems.github.io/Tools//Number-Count/",
    },

    // Media Tools
    {
        name: "Image Pixel Resizer",
        category: "Media Tools",
        description: "A privacy-friendly, browser-based image resizing tool that lets users resize images to exact pixel dimensions while maintaining aspect ratio when needed. All processing happens locally in the browser without uploading images to any server.",
        tags: ["JavaScript", "Image Processing", "Resizer"],
        demo: "https://aloksystems.github.io/Tools//Image-Pixel-Resizer/",
        featured: true,
    },
    {
        name: "Passport Size Image Maker",
        category: "Media Tools",
        description: "A browser-based passport photo maker that allows users to create properly sized passport and ID photos, adjust dimensions, crop images, and generate printable photo sheets. All image processing happens locally in the browser without uploading photos to any server.",
        tags: ["JavaScript", "Image Processing", "Passport Photo"],
        demo: "https://aloksystems.github.io/Tools//Passport-Size-Image-Maker/",
        featured: true,
    },
    {
        name: "Image Compressor",
        category: "Media Tools",
        description: "A modern, client-side image compression tool that allows users to compress images without uploading them to any server. All processing happens directly in the browser for maximum privacy and security.",
        tags: ["JavaScript", "Image Processing", "Compression"],
        demo: "https://aloksystems.github.io/Tools//Image-Compressor/",
        featured: true,
    },
    {
        name: "Image Converter",
        category: "Media Tools",
        description: "A powerful, browser-based image conversion tool that allows users to convert images between multiple formats (PNG, JPG, WebP, AVIF) with customizable quality settings.",
        tags: ["JavaScript", "Image Processing", "Converter"],
        demo: "https://aloksystems.github.io/Tools//Image-Converter/",
    },
    {
        name: "Image to Text OCR",
        category: "Media Tools",
        description: "This is a web-based application that converts images containing text into editable text format. It uses OCR (Optical Character Recognition) technology powered by Tesseract.js to extract text from uploaded images. The application provides a clean, modern UI with drag-and-drop functionality for easy image uploading.",
        tags: ["JavaScript", "OCR", "AI"],
        demo: "https://aloksystems.github.io/Tools//Image-To-Text/",
        pinned: true,
    },
    {
        name: "Image Editor",
        category: "Media Tools",
        description: "A comprehensive web-based image editing tool that allows users to resize, rotate, crop, apply filters, and add text overlays to images. Built with HTML, CSS, and JavaScript using the Canvas API and Cropper.js library.",
        tags: ["JavaScript", "Image Processing", "Editing"],
        demo: "https://aloksystems.github.io/Tools//Image-Editor/",
    },
    {
        name: "Thumbnail Downloader",
        category: "Media Tools",
        description: "A powerful, client-side YouTube thumbnail downloader that allows users to extract and download thumbnails from any YouTube video in multiple resolutions without requiring any server-side processing",
        tags: ["JavaScript", "YouTube API", "Downloader"],
        demo: "https://aloksystems.github.io/Tools//Thumbnail-Downloader/",
    },
    {
        name: "YouTube Downloader",
        category: "Media Tools",
        description: "Ultimate YouTube Downloader (GUI)",
        tags: ["Python", "YouTube API", "Downloader"],
        demo: "https://aloksystems.github.io/Tools//Yt_Downloader/",
        featured: true,
    },
    {
        name: "BG Remove",
        category: "Media Tools",
        description: "BG-Remove (Background Remover)",
        tags: ["JavaScript", "Image Processing", "AI"],
        demo: "https://aloksystems.github.io/Tools//BG-Remove/",
    },

    // AI & Chatbots
    {
        name: "AI ChatBot",
        category: "AI & Chatbots",
        description: "A modern web application for chatting with various AI models using the OpenRouter.ai API. The app allows users to select from multiple AI models and maintains chat history for each model.",
        tags: ["Python", "AI", "NLP"],
        demo: "https://aloksystems.github.io/Tools//AI-ChatBot/",
        featured: true,
        pinned: true,
    },
    {
        name: "Global ChatBot",
        category: "AI & Chatbots",
        description: "A modern mobile-friendly chat application with beautiful UI and user authentication.",
        tags: ["JavaScript", "AI", "Translation"],
        demo: "https://aloksystems.github.io/Tools//Global-ChatBot/",
    },

    // All-In-One Projects
    // PDF Tools
    {
        name: "PDF Tool",
        category: "Developer Tools",
        description: "A comprehensive suite of browser-based PDF manipulation tools that allow you to convert, edit, protect, and optimize PDF documents. All processing happens locally in your browser - your files never leave your computer!",
        tags: ["JavaScript", "PDF", "Document Processing"],
        demo: "https://aloksystems.github.io/Tools//PDF-Tools/",
        pinned: true,
        featured: true,
    },

    // Gradient Tools
    {
        name: "Gradient Generator",
        category: "Developer Tools",
        description: "A powerful, feature-rich CSS gradient generator that allows you to create beautiful linear and radial gradients with an intuitive UI. Export your gradients as CSS, download as PNG, or save your favorites for later use.",
        tags: ["JavaScript", "CSS", "Design"],
        demo: "https://aloksystems.github.io/Tools//Gradient-Generator/",
    },

    // Dairy Management
    {
        name: "Dairy Management",
        category: "Finance & Business",
        description: "The Milk Account Calculator is a web-based application designed to help dairy farmers and customers calculate their milk delivery accounts. It allows users to track delivery schedules, account for missed deliveries, calculate total quantities and costs, and generate reports for specific date ranges. The application is particularly useful for dairy farmers tracking customer deliveries and customers monitoring their milk consumption and costs.",
        tags: ["JavaScript", "Agriculture", "Finance"],
        demo: "https://aloksystems.github.io/Tools//Dairy-Management/",
    },

    {
        name: "Work Hours",
        category: "Finance & Business",
        description: "A modern time tracking and work management application designed for freelancers, developers, and teams to track hours, manage productivity, analyze work patterns, and monitor earnings with a clean and responsive interface.",
        tags: ["JavaScript", "Productivity", "Time Tracking"],
        demo: "https://aloksystems.github.io/Tools//Work%20Hour/",
    },

    // New Tools
    {
        name: "QR Code Generator",
        category: "Developer Tools",
        description: "Generate QR codes instantly for URLs, text, WiFi networks, and vCards. Fully customizable with color, size options and PNG/SVG download.",
        tags: ["JavaScript", "QR Code", "Utilities"],
        demo: "https://aloksystems.github.io/Tools//QR-Generator/",
        pinned: true,
    },
    {
        name: "Password Generator",
        category: "Productivity",
        description: "Generate strong, secure passwords with customizable length and character types. Includes strength meter and one-click copy.",
        tags: ["JavaScript", "Security", "Utilities"],
        demo: "https://aloksystems.github.io/Tools//Password-Generator/",
    },
    {
        name: "Unit Converter",
        category: "Productivity",
        description: "Convert between units of length, mass, temperature, and volume instantly. Accurate SI-based conversions with a clean interface.",
        tags: ["JavaScript", "Utilities", "Converter"],
        demo: "https://aloksystems.github.io/Tools//Unit-Converter/",
    },
];
