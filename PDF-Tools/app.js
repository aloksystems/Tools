(function () {
    'use strict';

    var STORAGE_KEY_THEME = 'pdfToolsTheme';

    /* ===== CATEGORY COLORS ===== */
    var CATEGORY_COLORS = {
        'organize':    { bg: '#0d9488', light: '#ccfbf1' },
        'convert':     { bg: '#7c3aed', light: '#ede9fe' },
        'edit-review': { bg: '#ea580c', light: '#fff7ed' },
        'secure':      { bg: '#dc2626', light: '#fef2f2' },
        'media':       { bg: '#2563eb', light: '#eff6ff' }
    };

    var DEFAULT_COLOR = { bg: '#64748b', light: '#f1f5f9' };

    /* ===== SVG ICONS ===== */
    var ICONS = {
        'files':           '<path d="M14 3H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v6h6"/>',
        'cut':             '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="M8.1 8.1 20 20"/>',
        'file-zip':        '<path d="M3 7h18"/><path d="M5 7v13h14V7"/><path d="M8 7V4h8v3"/><path d="M10 12h4"/>',
        'rotate':          '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
        'lock-open':       '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
        'droplet':         '<path d="M12 2s7 7.1 7 12a7 7 0 0 1-14 0c0-4.9 7-12 7-12z"/>',
        'list-numbers':    '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
        'file-export':     '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
        'trash':           '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
        'reorder':         '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 8l2-2 2 2"/><path d="M5 6v12"/><path d="m3 16 2 2 2-2"/>',
        'signature':       '<path d="M3 17c3-8 6-8 7-2 1.3 7.7 4.5-7 7-2 1 2 2 3 4 3"/><path d="M3 21h18"/>',
        'info':            '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        'image':           '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
        'code':            '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
        'crop':            '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
        'highlight':       '<path d="m9 11 6-6 4 4-6 6"/><path d="m4 20 5-2 9-9"/><path d="M14 4l6 6"/>',
        'text':            '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
        'scan':            '<path d="M4 7V5a1 1 0 0 1 1-1h2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/><path d="M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M7 12h10"/>',
        'table':           '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/>',
        'file-text':      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/>',
        'scissors':        '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="M8.1 8.1 20 20"/>',
        'archive':         '<path d="M3 7h18"/><path d="M5 7v13h14V7"/><path d="M8 7V4h8v3"/><path d="M10 12h4"/>',
        'unlock':          '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
        'lock':            '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
        'pen':             '<path d="m12 20 9-9-4-4-9 9-2 6 6-2z"/><path d="m15 8 4 4"/>',
        'eye':             '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        'layers':          '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
        'sparkles':        '<path d="M12 3 10.5 8.5 5 10l5.5 1.5L12 17l1.5-5.5L19 10l-5.5-1.5L12 3z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>'
    };

    /* ===== HELPERS ===== */
    function getRegistry() {
        return window.PDF_STUDIO_REGISTRY || { categories: [], tools: [] };
    }

    function getCategoryLabel(id) {
        var cats = getRegistry().categories;
        for (var i = 0; i < cats.length; i++) {
            if (cats[i].id === id) return cats[i].label;
        }
        return id || 'Tools';
    }

    function getCategoryColor(id) {
        return CATEGORY_COLORS[id] || DEFAULT_COLOR;
    }

    function iconSvg(name) {
        var path = ICONS[name] || ICONS['file-text'];
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    }

    function getInitials(title) {
        return title.split(/\s+/).map(function (w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
    }

    function readStorage(key, fallback) {
        try {
            var v = localStorage.getItem(key);
            return v ? JSON.parse(v) : fallback;
        } catch (e) { return fallback; }
    }

    function writeStorage(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function getTheme() {
        var stored = readStorage(STORAGE_KEY_THEME, 'light');
        if (stored === 'dark' || stored === 'light') return stored;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        return 'light';
    }

    function setTheme(mode) {
        document.documentElement.setAttribute('data-theme', mode);
        writeStorage(STORAGE_KEY_THEME, mode);
        var label = document.querySelector('.theme-label');
        var icon = document.querySelector('.theme-icon');
        if (label) label.textContent = mode === 'dark' ? 'Light' : 'Dark';
        if (icon) {
            icon.innerHTML = mode === 'dark'
                ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>'
                : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
        }
    }

    /* ===== RENDER CATEGORIES ===== */
    function renderCategories() {
        var container = document.querySelector('.categories-inner');
        if (!container) return;
        var registry = getRegistry();

        var html = '<button class="cat-pill active" data-category="all">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' +
            'All</button>';

        registry.categories.forEach(function (cat) {
            var color = getCategoryColor(cat.id);
            html += '<button class="cat-pill" data-category="' + cat.id + '">' + cat.label + '</button>';
        });

        container.innerHTML = html;
    }

    /* ===== RENDER TOOL CARDS ===== */
    function renderTools() {
        var grid = document.getElementById('toolsGrid');
        if (!grid) return;
        var registry = getRegistry();

        grid.innerHTML = '';
        registry.tools.forEach(function (tool) {
            var color = getCategoryColor(tool.category);
            var card = document.createElement('a');
            card.className = 'tool-card';
            card.href = tool.href;
            card.dataset.category = tool.category;
            card.dataset.search = [tool.title, tool.description, getCategoryLabel(tool.category), (tool.keywords || []).join(' ')].join(' ').toLowerCase();
            card.style.setProperty('--card-accent', color.bg);

            var tags = (tool.keywords || []).slice(0, 3).map(function (kw) {
                return '<span class="tool-tag">' + kw + '</span>';
            }).join('');

            card.innerHTML =
                '<div class="tool-card-header">' +
                    '<div class="tool-card-icon" style="background:' + color.bg + '">' + getInitials(tool.title) + '</div>' +
                    '<div>' +
                        '<div class="tool-card-category">' + getCategoryLabel(tool.category) + '</div>' +
                        '<div class="tool-card-title">' + tool.title + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="tool-card-desc">' + tool.description + '</div>' +
                '<div class="tool-card-tags">' + tags + '</div>' +
                '<div class="tool-card-footer">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' +
                    '<span>Local processing</span>' +
                '</div>';

            grid.appendChild(card);
        });
    }

    /* ===== SEARCH & FILTER ===== */
    function initFilters() {
        var searchInput = document.getElementById('searchInput');
        var grid = document.getElementById('toolsGrid');
        var emptyState = document.getElementById('emptyState');
        var pills = document.querySelectorAll('.cat-pill');
        var activeCategory = 'all';

        function applyFilters() {
            var query = (searchInput ? searchInput.value : '').trim().toLowerCase();
            var cards = grid ? Array.from(grid.querySelectorAll('.tool-card')) : [];
            var visible = 0;

            cards.forEach(function (card) {
                var cat = card.dataset.category || '';
                var haystack = card.dataset.search || '';
                var matchCat = activeCategory === 'all' || cat === activeCategory;
                var matchSearch = query.length === 0 || haystack.indexOf(query) !== -1;
                var show = matchCat && matchSearch;
                card.style.display = show ? '' : 'none';
                if (show) visible++;
            });

            if (emptyState) {
                emptyState.style.display = visible === 0 ? '' : 'none';
            }
        }

        pills.forEach(function (pill) {
            pill.addEventListener('click', function () {
                pills.forEach(function (p) { p.classList.remove('active'); });
                pill.classList.add('active');
                activeCategory = pill.dataset.category || 'all';
                applyFilters();
            });
        });

        if (searchInput) {
            searchInput.addEventListener('input', applyFilters);
        }

        applyFilters();
    }

    /* ===== THEME TOGGLE ===== */
    function initTheme() {
        setTheme(getTheme());
        var btn = document.getElementById('themeToggle');
        if (btn) {
            btn.addEventListener('click', function () {
                var current = getTheme();
                setTheme(current === 'dark' ? 'light' : 'dark');
            });
        }
    }

    /* ===== NAVBAR SCROLL ===== */
    function initNavbar() {
        var navbar = document.getElementById('navbar');
        if (!navbar) return;
        window.addEventListener('scroll', function () {
            navbar.classList.toggle('scrolled', window.scrollY > 10);
        }, { passive: true });
    }

    /* ===== INIT ===== */
    function init() {
        initTheme();
        initNavbar();
        renderCategories();
        renderTools();
        initFilters();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
