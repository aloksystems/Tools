(function () {
    'use strict';

    var STORAGE_KEY_THEME = 'pdfToolsTheme';
    var STORAGE_KEY_RECENT = 'pdfToolsRecent';
    var POPULAR_IDS = ['merge-pdfs', 'compress-pdf', 'pdf-to-images', 'images-to-pdf', 'rotate-pdf', 'split-pdf'];

    /* ===== CATEGORY COLORS ===== */
    var CATEGORY_COLORS = {
        'organize':    { bg: 'var(--cat-organize)', light: 'var(--cat-organize-light)', raw: '#0d9488', rawLight: '#ccfbf1' },
        'convert':     { bg: 'var(--cat-convert)', light: 'var(--cat-convert-light)', raw: '#7c3aed', rawLight: '#ede9fe' },
        'edit-review': { bg: 'var(--cat-edit)', light: 'var(--cat-edit-light)', raw: '#ea580c', rawLight: '#fff7ed' },
        'secure':      { bg: 'var(--cat-secure)', light: 'var(--cat-secure-light)', raw: '#dc2626', rawLight: '#fef2f2' },
        'media':       { bg: 'var(--cat-media)', light: 'var(--cat-media-light)', raw: '#2563eb', rawLight: '#eff6ff' }
    };

    var DEFAULT_COLOR = { bg: 'var(--text-secondary)', light: 'var(--pill-bg)', raw: '#6b7280', rawLight: '#f3f4f6' };

    var CATEGORY_ICONS = {
        'all':         '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
        'organize':    '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7 7"/><path d="M3 3l7 7"/><path d="M16 21h5v-5"/><path d="M8 21H3v-5"/><path d="M21 21l-7-7"/><path d="M3 21l7-7"/>',
        'convert':     '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
        'edit-review': '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
        'secure':      '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
        'media':       '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'
    };

    /* ===== TOOL ICONS (meaningful SVG paths) ===== */
    var TOOL_ICONS = {
        'pdf-size-reducer':  '<path d="M14 3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/>',
        'merge-pdfs':        '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 3h3a2 2 0 0 1 2 2v3"/><path d="M21 15H3"/><path d="M12 18v3"/>',
        'split-pdf':         '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="M8.1 8.1 20 20"/>',
        'compress-pdf':      '<path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><path d="M14 2v6h6"/><path d="M4 12h4"/><path d="M10 12h4"/>',
        'rotate-pdf':        '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
        'extract-pages':     '<path d="M14 3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>',
        'remove-pages':      '<path d="M14 3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v6h6"/><path d="M12 15l4 4"/><path d="M16 15l-4 4"/>',
        'rearrange-pages':   '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6l2-2 2 2"/><path d="M5 6v12"/><path d="m3 16 2 2 2-2"/>',
        'sign-pdf':          '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/><path d="M15 5l4 4"/>',
        'edit-metadata':     '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        'pdf-info':          '<path d="M14 3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v6h6"/><circle cx="12" cy="15" r="2"/><path d="M12 13v-1"/>',
        'pdf-to-images':     '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
        'images-to-pdf':     '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
        'html-to-pdf':       '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
        'extract-text':      '<path d="M14 3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/>',
        'protect-pdf':       '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2"/>',
        'crop-pdf':          '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
        'highlight-pdf':     '<path d="m9 11 6-6 4 4-6 6"/><path d="m4 20 5-2 9-9"/><path d="M14 4l6 6"/>',
        'edit-pdf-text':     '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
        'ocr-pdf':           '<path d="M4 7V5a1 1 0 0 1 1-1h2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/><path d="M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M7 12h10"/>',
        'scan-to-pdf':       '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/>',
        'unlock-pdf':        '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
        'add-watermark':     '<path d="M12 2s7 7.1 7 12a7 7 0 0 1-14 0c0-4.9 7-12 7-12z"/>',
        'add-page-numbers':  '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'
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

    function toolIconSvg(name, size) {
        var s = size || 22;
        var path = TOOL_ICONS[name] || TOOL_ICONS['edit-metadata'];
        return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    }

    function catIconSvg(name, size) {
        var s = size || 14;
        var path = CATEGORY_ICONS[name] || CATEGORY_ICONS['all'];
        return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    }

    function lockIconSvg() {
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
    }

    function arrowIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>';
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
        var icon = document.querySelector('.theme-icon');
        if (icon) {
            icon.innerHTML = mode === 'dark'
                ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>'
                : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
        }
        var toggle = document.getElementById('themeToggle');
        if (toggle) toggle.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }

    function getRecentTools() {
        return readStorage(STORAGE_KEY_RECENT, []);
    }

    function addRecentTool(toolId) {
        var recent = getRecentTools().filter(function (id) { return id !== toolId; });
        recent.unshift(toolId);
        if (recent.length > 5) recent = recent.slice(0, 5);
        writeStorage(STORAGE_KEY_RECENT, recent);
    }

    /* ===== RENDER CATEGORIES ===== */
    function renderCategories() {
        var container = document.getElementById('categoriesScroll');
        if (!container) return;
        var registry = getRegistry();
        var totalTools = registry.tools.length;

        var html = '<button class="cat-pill active" data-category="all">' +
            catIconSvg('all') +
            'All <span class="cat-pill-count">\u00b7 ' + totalTools + '</span></button>';

        registry.categories.forEach(function (cat) {
            var count = registry.tools.filter(function (t) { return t.category === cat.id; }).length;
            html += '<button class="cat-pill" data-category="' + cat.id + '">' +
                catIconSvg(cat.id) +
                cat.label + ' <span class="cat-pill-count">\u00b7 ' + count + '</span></button>';
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
            var isPopular = POPULAR_IDS.indexOf(tool.id) !== -1;
            var card = document.createElement('a');
            card.className = 'tool-card' + (isPopular ? ' is-popular' : '');
            card.href = tool.href;
            card.dataset.category = tool.category;
            card.dataset.toolId = tool.id;
            card.dataset.search = [tool.title, tool.description, getCategoryLabel(tool.category), (tool.keywords || []).join(' ')].join(' ').toLowerCase();

            var tags = (tool.keywords || []).slice(0, 3).map(function (kw) {
                return '<span class="tool-tag">' + kw + '</span>';
            }).join('');

            var popularBadge = isPopular
                ? '<span class="popular-label" style="--cat-color:' + color.raw + ';--cat-color-light:' + color.rawLight + '">Popular</span>'
                : '';

            card.innerHTML =
                '<div class="tool-card-inner">' +
                    '<div class="tool-card-top">' +
                        '<div class="tool-card-icon-wrap" style="background:' + color.raw + '">' +
                            toolIconSvg(tool.id) +
                        '</div>' +
                        '<div class="tool-card-arrow">' + arrowIconSvg() + '</div>' +
                    '</div>' +
                    '<div class="tool-card-body">' +
                        '<div class="tool-card-category" style="--cat-color:' + color.raw + '">' +
                            getCategoryLabel(tool.category) +
                            (popularBadge ? ' ' + popularBadge : '') +
                        '</div>' +
                        '<div class="tool-card-title">' + tool.title + '</div>' +
                        '<div class="tool-card-desc">' + tool.description + '</div>' +
                    '</div>' +
                    '<div class="tool-card-tags">' + tags + '</div>' +
                '</div>' +
                '<div class="tool-card-footer">' +
                    lockIconSvg() +
                    '<span>Local processing</span>' +
                '</div>';

            card.addEventListener('click', function () {
                addRecentTool(tool.id);
            });

            grid.appendChild(card);
        });
    }

    /* ===== UPDATE TOOLS HEADING & COUNT ===== */
    function updateToolsInfo(activeCategory, visibleCount, totalCount) {
        var heading = document.getElementById('toolsHeading');
        var count = document.getElementById('toolsCount');
        if (heading) {
            heading.textContent = activeCategory === 'all' ? 'All tools' : getCategoryLabel(activeCategory);
        }
        if (count) {
            if (activeCategory === 'all') {
                count.textContent = totalCount + ' tools';
            } else {
                count.textContent = 'Showing ' + visibleCount + ' of ' + totalCount;
            }
        }
    }

    /* ===== SEARCH DROPDOWN ===== */
    function renderSearchDropdown(query) {
        var dropdown = document.getElementById('searchDropdown');
        if (!dropdown) return;
        var registry = getRegistry();

        if (!query || query.length < 1) {
            var recentIds = getRecentTools();
            var recentTools = recentIds.map(function (id) { return registry.tools.find(function (t) { return t.id === id; }); }).filter(Boolean);
            var popularTools = POPULAR_IDS.map(function (id) { return registry.tools.find(function (t) { return t.id === id; }); }).filter(Boolean);

            var html = '';
            if (recentTools.length > 0) {
                html += '<div class="search-dropdown-section"><div class="search-dropdown-label">Recent</div>';
                recentTools.forEach(function (tool) {
                    html += searchDropdownItem(tool);
                });
                html += '</div><div class="search-dropdown-divider"></div>';
            }
            html += '<div class="search-dropdown-section"><div class="search-dropdown-label">Popular</div>';
            popularTools.forEach(function (tool) {
                html += searchDropdownItem(tool);
            });
            html += '</div>';

            dropdown.innerHTML = html;
            bindDropdownItems(dropdown);
            return;
        }

        var matches = registry.tools.filter(function (tool) {
            var haystack = [tool.title, tool.description, getCategoryLabel(tool.category), (tool.keywords || []).join(' ')].join(' ').toLowerCase();
            return haystack.indexOf(query) !== -1;
        }).slice(0, 8);

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="search-dropdown-section"><div class="search-dropdown-label">No results</div><div class="search-dropdown-item" style="cursor:default;opacity:0.6">Try a different keyword</div></div>';
            return;
        }

        var html = '<div class="search-dropdown-section"><div class="search-dropdown-label">Tools</div>';
        matches.forEach(function (tool) {
            html += searchDropdownItem(tool);
        });
        html += '</div>';
        dropdown.innerHTML = html;
        bindDropdownItems(dropdown);
    }

    function searchDropdownItem(tool) {
        var color = getCategoryColor(tool.category);
        return '<a class="search-dropdown-item" href="' + tool.href + '" role="option">' +
            '<div class="search-dropdown-item-icon" style="background:' + color.raw + '">' +
                toolIconSvg(tool.id, 16) +
            '</div>' +
            '<div class="search-dropdown-item-text">' +
                '<div class="search-dropdown-item-title">' + tool.title + '</div>' +
                '<div class="search-dropdown-item-cat">' + getCategoryLabel(tool.category) + '</div>' +
            '</div>' +
        '</a>';
    }

    function bindDropdownItems(dropdown) {
        var items = dropdown.querySelectorAll('.search-dropdown-item[href]');
        items.forEach(function (item) {
            item.addEventListener('mousedown', function (e) {
                addRecentTool(item.href.replace(/.*\//, '').replace('/index.html', ''));
            });
        });
    }

    /* ===== SEARCH & FILTER ===== */
    function initFilters() {
        var searchInput = document.getElementById('searchInput');
        var grid = document.getElementById('toolsGrid');
        var emptyState = document.getElementById('emptyState');
        var dropdown = document.getElementById('searchDropdown');
        var searchWrapper = document.getElementById('searchWrapper');
        var clearBtn = document.getElementById('clearSearch');
        var activeCategory = 'all';
        var registry = getRegistry();
        var totalTools = registry.tools.length;
        var dropdownOpen = false;

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

            updateToolsInfo(activeCategory, visible, totalTools);
        }

        function openDropdown() {
            if (!dropdown) return;
            renderSearchDropdown((searchInput ? searchInput.value : '').trim().toLowerCase());
            dropdown.classList.add('is-open');
            dropdownOpen = true;
        }

        function closeDropdown() {
            if (!dropdown) return;
            dropdown.classList.remove('is-open');
            dropdownOpen = false;
        }

        // Category pills
        var pills = document.querySelectorAll('.cat-pill');
        pills.forEach(function (pill) {
            pill.addEventListener('click', function () {
                pills.forEach(function (p) { p.classList.remove('active'); });
                pill.classList.add('active');
                activeCategory = pill.dataset.category || 'all';
                applyFilters();
            });
        });

        // Search input
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                applyFilters();
                if (dropdownOpen) {
                    renderSearchDropdown(searchInput.value.trim().toLowerCase());
                }
            });

            searchInput.addEventListener('focus', function () {
                openDropdown();
            });
        }

        // Close dropdown on outside click
        document.addEventListener('click', function (e) {
            if (searchWrapper && !searchWrapper.contains(e.target)) {
                closeDropdown();
            }
        });

        // Close dropdown on Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeDropdown();
                if (searchInput) searchInput.blur();
            }
        });

        // Clear search button
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                applyFilters();
                openDropdown();
            });
        }

        // Keyboard shortcut Ctrl+K
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }
        });

        applyFilters();
        updateToolsInfo('all', totalTools, totalTools);
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
