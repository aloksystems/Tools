const projectsData = [
   // Developer Tools
   {
      name: "JSON Formatter",
      category: "Developer Tools",
      description:
        "A powerful, easy-to-use online tool for formatting, validating, and minifying JSON data. This tool runs entirely in your browser with no server-side processing, ensuring your data privacy and security.",
      tags: ["JavaScript", "JSON", "Formatter"],
      demo: "https://aloksystems.freedev.app/JSON-Formatter/",
      icon: "{ }",
      iconColor: "#7C3AED",
      pinned: true,
   },
   {
      name: "TempMail",
      category: "Developer Tools",
      description:
        "A secure and lightweight temporary email service that lets users generate disposable email addresses instantly for OTPs, testing, signups, and privacy protection. Fast, clean, and easy to use with real-time inbox support.",
      tags: ["JavaScript", "Temp Mail", "Email"],
      demo: "https://aloksystems.freedev.app/TempMail/",
      icon: "@",
      iconColor: "#0EA5E9",
      pinned: true,
   },
   {
      name: "Color Palette Generator",
      category: "Developer Tools",
      description:
        "A powerful, browser-based tool for generating color palettes, CSS gradients, and accessibility checking. This application helps designers and developers create beautiful color schemes and gradients for their projects.",
      tags: ["JavaScript", "CSS", "Colors"],
      demo: "https://aloksystems.freedev.app/Color-Palette-Gradient/",
      icon: "#",
      iconColor: "#EC4899",
      pinned: true,
   },
   {
      name: "PDF Tool",
      category: "Developer Tools",
      description:
        "A comprehensive suite of browser-based PDF manipulation tools that allow you to convert, edit, protect, and optimize PDF documents. All processing happens locally in your browser — your files never leave your computer!",
      tags: ["JavaScript", "PDF", "Document Processing"],
      demo: "https://aloksystems.freedev.app/PDF-Tools/",
      icon: "PDF",
      iconColor: "#EF4444",
      pinned: true,
      featured: true,
   },
   {
      name: "QR Code Generator",
      category: "Developer Tools",
      description:
        "Generate QR codes instantly for URLs, text, WiFi networks, and vCards. Fully customizable with color, size options and PNG/SVG download.",
      tags: ["JavaScript", "QR Code", "Utilities"],
      demo: "https://aloksystems.freedev.app/QR-Generator/",
      icon: "▣",
      iconColor: "#0D9488",
      pinned: true,
   },
   {
      name: "Gradient Generator",
      category: "Developer Tools",
      description:
        "A powerful, feature-rich CSS gradient generator that allows you to create beautiful linear and radial gradients with an intuitive UI. Export your gradients as CSS, download as PNG, or save your favorites for later use.",
      tags: ["JavaScript", "CSS", "Design"],
      demo: "https://aloksystems.freedev.app/Gradient-Generator/",
      icon: "G",
      iconColor: "#8B5CF6",
   },

   // Productivity & Utilities
   {
      name: "WriteFlow",
      category: "Productivity",
      description:
        "A simple and customizable writing assistant that displays text one word, phrase, or sentence at a time with adjustable timing and highlighting. Designed to make copying long paragraphs and handwritten assignments easier by letting you write at your own comfortable pace. Runs entirely in the browser with no server-side processing.",
      tags: ["Writing", "Productivity", "Text", "Study"],
      demo: "https://aloksystems.freedev.app/WriteFlow/",
      icon: "W",
      iconColor: "#14B8A6",
      pinned: true,
   },
   {
      name: "Micro Maker",
      category: "Productivity",
      description:
        "A smart PDF and image printing tool for fitting multiple pages onto fewer physical sheets with customizable N-up grid layouts, live print preview, page reordering, paper settings, automatic sheet calculation, and PDF export.",
      tags: ["React", "TypeScript", "PDF", "Image Tools", "N-up Printing", "Productivity"],
      demo: "https://aloksystems.freedev.app/one-page-print/",
      icon: "≡",
      iconColor: "#3B82F6",
      pinned: true,
      featured: true,
   },
   {
      name: "Todo",
      category: "Productivity",
      description:
        "A modern task management app designed for simplicity and focus, featuring secure authentication, task search, priority-based organization, completion tracking, filtering, and sorting.",
      tags: ["React", "TypeScript", "Supabase", "Productivity", "Task Management"],
      demo: "https://todo-murex-omega-74.vercel.app/",
      icon: "✓",
      iconColor: "#10B981",
      pinned: true,
      featured: true,
   },
   {
      name: "SnapShare",
      category: "Productivity",
      description:
        "A secure temporary file sharing platform with password protection, auto-expiry, one-time viewing, and download restrictions built using Express, Vite, and TypeScript.",
      tags: ["TypeScript", "Express", "Vite", "File Sharing", "Security"],
      demo: "https://tools-lovat-beta.vercel.app/",
      icon: "S",
      iconColor: "#6366F1",
      pinned: true,
      featured: true,
   },
   {
      name: "Age Calculator",
      category: "Productivity",
      description:
        "Calculate your exact age down to the second with a clean, instant interface. Supports multiple birth dates and provides years, months, and days breakdown.",
      tags: ["JavaScript", "Date", "Calculator"],
      demo: "https://aloksystems.freedev.app/Age-Calculator/",
      icon: "A",
      iconColor: "#F97316",
   },
   {
      name: "Form Builder",
      category: "Productivity",
      description:
        "A privacy-first bulk document preparation tool for converting, resizing, and compressing photos, signatures, certificates, and PDFs for government and non-government forms. Process multiple files at once, customize requirements for each document, and download everything individually or as a ZIP — entirely in your browser.",
      tags: ["PDF", "Image", "Converter", "Compressor", "Documents"],
      demo: "https://aloksystems.freedev.app/FormReady/",
      icon: "F",
      iconColor: "#0D9488",
      pinned: true,
   },
   {
      name: "Unit Converter",
      category: "Productivity",
      description:
        "Convert between units of length, mass, temperature, and volume instantly. Accurate SI-based conversions with a clean interface.",
      tags: ["JavaScript", "Utilities", "Converter"],
      demo: "https://aloksystems.freedev.app/Unit-Converter/",
      icon: "U",
      iconColor: "#6366F1",
   },

   // Games & Fun
   {
      name: "Number Counting",
      category: "Media Tools",
      description:
        "An interactive number counting application for learning and practicing number skills with engaging visual feedback.",
      tags: ["JavaScript", "Educational", "Interactive"],
      demo: "https://aloksystems.freedev.app/Number-Count/",
      icon: "N",
      iconColor: "#F43F5E",
   },

   // Media Tools
   {
      name: "MP4 to MP3 Converter",
      category: "Media Tools",
      description:
        "Convert MP4 videos to MP3 audio directly in your browser. No files are uploaded to any server, ensuring your media stays private and secure.",
      tags: ["MP4", "MP3", "Converter", "FFmpeg"],
      demo: "https://mp-4-to-mp-3-converter.vercel.app/",
      icon: "♪",
      iconColor: "#EF4444",
      pinned: true,
   },
   {
      name: "Image Pixel Resizer",
      category: "Media Tools",
      description:
        "A privacy-friendly, browser-based image resizing tool that lets users resize images to exact pixel dimensions while maintaining aspect ratio when needed. All processing happens locally in the browser without uploading images to any server.",
      tags: ["JavaScript", "Image Processing", "Resizer"],
      demo: "https://aloksystems.freedev.app/Image-Pixel-Resizer/",
      icon: "P",
      iconColor: "#8B5CF6",
      featured: true,
   },
   {
      name: "Passport Size Image Maker",
      category: "Media Tools",
      description:
        "A browser-based passport photo maker that allows users to create properly sized passport and ID photos, adjust dimensions, crop images, and generate printable photo sheets. All image processing happens locally in the browser without uploading photos to any server.",
      tags: ["JavaScript", "Image Processing", "Passport Photo"],
      demo: "https://aloksystems.freedev.app/Passport-Size-Image-Maker/",
      icon: "ID",
      iconColor: "#14B8A6",
      featured: true,
   },
   {
      name: "Image Compressor",
      category: "Media Tools",
      description:
        "A modern, client-side image compression tool that allows users to compress images without uploading them to any server. All processing happens directly in the browser for maximum privacy and security.",
      tags: ["JavaScript", "Image Processing", "Compression"],
      demo: "https://aloksystems.freedev.app/Image-Compressor/",
      icon: "C",
      iconColor: "#F59E0B",
      featured: true,
   },
   {
      name: "Image Converter",
      category: "Media Tools",
      description:
        "A powerful, browser-based image conversion tool that allows users to convert images between multiple formats (PNG, JPG, WebP, AVIF) with customizable quality settings.",
      tags: ["JavaScript", "Image Processing", "Converter"],
      demo: "https://aloksystems.freedev.app/Image-Converter/",
      icon: "⌁",
      iconColor: "#6366F1",
   },
   {
      name: "Image to Text OCR",
      category: "Media Tools",
      description:
        "Convert images containing text into editable text using OCR technology powered by Tesseract.js. Supports drag-and-drop image uploading and a clean, modern UI.",
      tags: ["JavaScript", "OCR", "AI"],
      demo: "https://aloksystems.freedev.app/Image-To-Text/",
      icon: "OCR",
      iconColor: "#0EA5E9",
      pinned: true,
   },
   {
      name: "Image Editor",
      category: "Media Tools",
      description:
        "Edit images with resize, rotate, crop, filters, and text overlays. Built with HTML, CSS, and JavaScript using the Canvas API and Cropper.js.",
      tags: ["JavaScript", "Image Processing", "Editing"],
      demo: "https://aloksystems.freedev.app/Image-Editor/",
      icon: "E",
      iconColor: "#EC4899",
   },
   {
      name: "YouTube Thumbnail Downloader",
      category: "Media Tools",
      description:
        "A powerful, client-side YouTube thumbnail downloader that allows users to extract and download thumbnails from any YouTube video in multiple resolutions without requiring any server-side processing.",
      tags: ["JavaScript", "YouTube API", "Downloader"],
      demo: "https://aloksystems.freedev.app/Thumbnail-Downloader/",
      icon: "▶",
      iconColor: "#F97316",
   },
   {
      name: "YouTube Video Downloader",
      category: "Media Tools",
      description:
        "A fast, privacy-focused online tool for downloading YouTube videos directly in your browser. No files are uploaded to any server, ensuring your media stays private and secure.",
      tags: ["Python", "YouTube API", "Downloader"],
      demo: "https://aloksystems.freedev.app/Yt_Downloader/",
      icon: "▶▮",
      iconColor: "#EF4444",
      featured: true,
   },
   {
      name: "Background Remover",
      category: "Media Tools",
      description:
        "A browser-based image background removal tool that instantly removes the background from any image with AI-powered precision. No uploads required — all processing happens locally.",
      tags: ["JavaScript", "Image Processing", "AI"],
      demo: "https://aloksystems.freedev.app/BG-Remove/",
      icon: "⊗",
      iconColor: "#10B981",
   },

   // AI & Chatbots
   {
      name: "AI ChatBot",
      category: "AI & Chatbots",
      description:
        "A modern web application for chatting with various AI models using the OpenRouter.ai API. The app allows users to select from multiple AI models and maintains chat history for each model.",
      tags: ["Python", "AI", "NLP"],
      demo: "https://aloksystems.freedev.app/AI-ChatBot/",
      icon: "AI",
      iconColor: "#8B5CF6",
      featured: true,
      pinned: true,
   },
   {
      name: "Global ChatBot",
      category: "AI & Chatbots",
      description:
        "A mobile-friendly chat application with beautiful UI, user authentication, and real-time translation support.",
      tags: ["JavaScript", "AI", "Translation"],
      demo: "https://aloksystems.freedev.app/Global-ChatBot/",
      icon: "G",
      iconColor: "#14B8A6",
   },

   // Finance & Business
   {
      name: "Dairy Management",
      category: "Finance & Business",
      description:
        "Calculate milk delivery accounts, track schedules, account for missed deliveries, and generate reports for specific date ranges.",
      tags: ["JavaScript", "Agriculture", "Finance"],
      demo: "https://aloksystems.freedev.app/Dairy-Management/",
      icon: "D",
      iconColor: "#F59E0B",
   },
   {
      name: "Work Hours",
      category: "Finance & Business",
      description:
        "Track work hours, manage productivity, analyze work patterns, and monitor earnings with a clean, responsive interface.",
      tags: ["JavaScript", "Productivity", "Time Tracking"],
      demo: "https://aloksystems.freedev.app/Work%20Hour/",
      icon: "W",
      iconColor: "#3B82F6",
   },
];
