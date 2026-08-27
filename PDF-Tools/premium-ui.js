(function () {
    var STORAGE_KEY_THEME = 'pdfStudioTheme';
    var STORAGE_KEY_FAVORITES = 'pdfStudioFavorites';
    var STORAGE_KEY_RECENTS = 'pdfStudioRecents';
    var STORAGE_KEY_HISTORY = 'pdfStudioHistory';

    function safeJsonParse(value, fallback) {
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    }

    function readStorage(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value ? safeJsonParse(value, fallback) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            return;
        }
    }

    function readThemePreference() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY_THEME);
            if (!stored) {
                return 'system';
            }
            if (stored === 'light' || stored === 'dark' || stored === 'system') {
                return stored;
            }
            var parsed = JSON.parse(stored);
            if (parsed === 'light' || parsed === 'dark' || parsed === 'system') {
                return parsed;
            }
        } catch (e) {
            return 'system';
        }
        return 'system';
    }

    function writeThemePreference(value) {
        try {
            localStorage.setItem(STORAGE_KEY_THEME, value);
        } catch (e) {
            return;
        }
    }

    function getSystemTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function resolveTheme(mode) {
        return mode === 'light' || mode === 'dark' ? mode : getSystemTheme();
    }

    function applyTheme(mode) {
        var theme = resolveTheme(mode);
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('data-theme-mode', mode);
        document.documentElement.style.colorScheme = theme;
    }

    function setThemePreference(mode) {
        applyTheme(mode);
        writeThemePreference(mode);
    }

    function getRegistry() {
        return window.PDF_STUDIO_REGISTRY || { categories: [], tools: [] };
    }

    function getCategoryLabel(categoryId) {
        var registry = getRegistry();
        var match = registry.categories.find(function (item) {
            return item.id === categoryId;
        });
        return match ? match.label : (categoryId || 'Tools');
    }

    function getCurrentTool() {
        var registry = getRegistry();
        var url = new URL(window.location.href);
        var toolId = url.searchParams.get('tool');
        if (toolId) {
            return registry.getToolById ? registry.getToolById(toolId) : null;
        }

        var path = window.location.pathname.split('/').pop() || 'index.html';
        return registry.getToolByHref ? registry.getToolByHref(path) : null;
    }

    function ensureToastStack() {
        var stack = document.querySelector('.toast-stack');
        if (stack) {
            return stack;
        }
        stack = document.createElement('div');
        stack.className = 'toast-stack';
        stack.setAttribute('aria-live', 'polite');
        stack.setAttribute('aria-relevant', 'additions');
        document.body.appendChild(stack);
        return stack;
    }

    function toast(message, type) {
        var stack = ensureToastStack();
        var node = document.createElement('div');
        node.className = 'toast' + (type ? ' is-' + type : '');
        node.setAttribute('role', type === 'error' ? 'alert' : 'status');
        node.textContent = message;
        stack.appendChild(node);
        setTimeout(function () {
            node.classList.add('is-leaving');
            setTimeout(function () {
                node.remove();
            }, 180);
        }, 2800);
    }

    var ICON_ALIASES = {
        'layer-group': 'layers',
        'menu-2': 'menu',
        'device-laptop': 'laptop',
        'shield-lock': 'shield',
        'cut': 'scissors',
        'file-zip': 'archive',
        'lock-open': 'unlock',
        'list-numbers': 'list',
        'file-info': 'info',
        'info-circle': 'info',
        'photo-scan': 'image',
        'photo': 'image',
        'arrows-up-down': 'reorder',
        'text-recognition': 'text',
        'scan-eye': 'scan',
        'page': 'file-text',
        'select': 'check',
        'ti-layer-group': 'layers',
        'ti-search': 'search',
        'ti-command': 'command',
        'ti-moon': 'moon',
        'ti-sun': 'sun',
        'ti-menu-2': 'menu',
        'ti-sparkles': 'sparkles',
        'ti-files': 'files',
        'ti-transform': 'refresh',
        'ti-shield-lock': 'shield',
        'ti-arrow-right': 'arrow-right',
        'ti-device-laptop': 'laptop',
        'ti-progress': 'progress',
        'ti-accessible': 'accessibility',
        'ti-lock': 'lock',
        'ti-arrow-left': 'arrow-left',
        'ti-star': 'star',
        'ti-star-filled': 'star-filled',
        'ti-file-text': 'file-text',
        'ti-upload': 'upload',
        'ti-cut': 'scissors',
        'ti-file-zip': 'archive',
        'ti-rotate': 'rotate',
        'ti-lock-open': 'unlock',
        'ti-droplet': 'droplet',
        'ti-list-numbers': 'list',
        'ti-file-export': 'export',
        'ti-trash': 'trash',
        'ti-arrows-up-down': 'reorder',
        'ti-signature': 'signature',
        'ti-info-circle': 'info',
        'ti-file-info': 'info',
        'ti-photo-scan': 'image',
        'ti-photo': 'image',
        'ti-code': 'code',
        'ti-crop': 'crop',
        'ti-highlight': 'highlight',
        'ti-text-recognition': 'text',
        'ti-scan-eye': 'scan',
        'ti-scan': 'scan',
        'ti-page': 'file-text',
        'ti-select': 'check',
        'fa-arrow-left': 'arrow-left',
        'fa-hashtag': 'hash',
        'fa-file-pdf': 'file-text',
        'fa-cloud-upload-alt': 'upload',
        'fa-cog': 'settings',
        'fa-arrow-up': 'arrow-up',
        'fa-arrow-down': 'arrow-down',
        'fa-plus-circle': 'plus',
        'fa-tint': 'droplet',
        'fa-font': 'text',
        'fa-image': 'image',
        'fa-eye': 'eye',
        'fa-download': 'download',
        'fa-info-circle': 'info',
        'fa-check': 'check',
        'fa-exclamation-triangle': 'alert',
        'fa-spinner': 'loader',
        'fa-check-circle': 'check-circle',
        'fa-compress-arrows-alt': 'archive',
        'fa-cut': 'scissors',
        'fa-fire': 'flame',
        'fa-lightbulb': 'sparkles',
        'fa-database': 'database',
        'fa-save': 'save',
        'fa-file-export': 'export',
        'fa-check-double': 'check',
        'fa-times': 'x',
        'fa-list-ol': 'list',
        'fa-file-code': 'code',
        'fa-images': 'image',
        'fa-plus': 'plus',
        'fa-trash': 'trash',
        'fa-compress': 'files',
        'fa-merge': 'files',
        'fa-minus': 'minus',
        'fa-chart-line': 'chart',
        'fa-file-circle-info': 'info',
        'fa-tags': 'tag',
        'fa-layer-group': 'layers',
        'fa-file-lines': 'file-text',
        'fa-file-alt': 'file-text',
        'fa-file-image': 'image',
        'fa-exchange-alt': 'reorder',
        'fa-redo': 'refresh',
        'fa-eye': 'eye',
        'fa-scissors': 'scissors',
        'fa-exclamation': 'alert',
        'fa-sync-alt': 'rotate',
        'fa-signature': 'signature',
        'fa-pen': 'pen',
        'fa-keyboard': 'keyboard',
        'fa-eraser': 'eraser',
        'fa-unlock': 'unlock',
        'fa-unlock-alt': 'unlock',
        'fa-expand-arrows-alt': 'scissors'
    };

    var ICON_PATHS = {
        search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
        command: '<path d="M7 7h.01"></path><path d="M17 7h.01"></path><path d="M7 17h.01"></path><path d="M17 17h.01"></path><path d="M7 7h10v10H7z"></path>',
        moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 7 7 0 1 0 20.5 14.5z"></path>',
        sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
        menu: '<path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path>',
        layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 16 9 5 9-5"></path>',
        sparkles: '<path d="M12 3 10.5 8.5 5 10l5.5 1.5L12 17l1.5-5.5L19 10l-5.5-1.5L12 3z"></path><path d="M5 3v4"></path><path d="M3 5h4"></path><path d="M19 17v4"></path><path d="M17 19h4"></path>',
        files: '<path d="M14 3H6a2 2 0 0 0-2 2v12"></path><path d="M8 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"></path>',
        refresh: '<path d="M20 11a8 8 0 0 0-14.4-4.8L4 8"></path><path d="M4 4v4h4"></path><path d="M4 13a8 8 0 0 0 14.4 4.8L20 16"></path><path d="M20 20v-4h-4"></path>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9.5 12.5 11 14l3.5-4"></path>',
        'arrow-right': '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
        'arrow-left': '<path d="M19 12H5"></path><path d="m11 6-6 6 6 6"></path>',
        laptop: '<path d="M5 4h14a1 1 0 0 1 1 1v11H4V5a1 1 0 0 1 1-1z"></path><path d="M2 20h20"></path>',
        progress: '<path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M4.93 4.93 7.76 7.76"></path><path d="M16.24 16.24 19.07 19.07"></path><path d="M2 12h4"></path><path d="M18 12h4"></path>',
        accessibility: '<circle cx="12" cy="4" r="2"></circle><path d="M6 8h12"></path><path d="M12 6v8"></path><path d="m8 22 4-8 4 8"></path>',
        lock: '<rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
        unlock: '<rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 7.5-2"></path>',
        star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2l-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z"></path>',
        'star-filled': '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2l-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z"></path>',
        'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path>',
        upload: '<path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"></path>',
        scissors: '<circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M20 4 8.1 15.9"></path><path d="M8.1 8.1 20 20"></path>',
        archive: '<path d="M3 7h18"></path><path d="M5 7v13h14V7"></path><path d="M8 7V4h8v3"></path><path d="M10 12h4"></path>',
        rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path>',
        droplet: '<path d="M12 2s7 7.1 7 12a7 7 0 0 1-14 0c0-4.9 7-12 7-12z"></path>',
        list: '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
        export: '<path d="M14 3h7v7"></path><path d="M10 14 21 3"></path><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>',
        trash: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 15H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
        reorder: '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 8l2-2 2 2"></path><path d="M5 6v12"></path><path d="m3 16 2 2 2-2"></path>',
        signature: '<path d="M3 17c3-8 6-8 7-2 1.3 7.7 4.5-7 7-2 1 2 2 3 4 3"></path><path d="M3 21h18"></path>',
        info: '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
        image: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path>',
        code: '<path d="m16 18 6-6-6-6"></path><path d="m8 6-6 6 6 6"></path>',
        crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"></path><path d="M18 22V8a2 2 0 0 0-2-2H2"></path>',
        highlight: '<path d="m9 11 6-6 4 4-6 6"></path><path d="m4 20 5-2 9-9"></path><path d="M14 4l6 6"></path>',
        text: '<path d="M4 7V4h16v3"></path><path d="M9 20h6"></path><path d="M12 4v16"></path>',
        scan: '<path d="M4 7V5a1 1 0 0 1 1-1h2"></path><path d="M17 4h2a1 1 0 0 1 1 1v2"></path><path d="M20 17v2a1 1 0 0 1-1 1h-2"></path><path d="M7 20H5a1 1 0 0 1-1-1v-2"></path><path d="M7 12h10"></path>',
        table: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18"></path><path d="M9 4v16"></path>',
        hash: '<path d="M5 9h14"></path><path d="M5 15h14"></path><path d="M10 3 8 21"></path><path d="m16 3-2 18"></path>',
        settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20h-3v.2a1.7 1.7 0 0 0-1 1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1z"></path>',
        plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
        minus: '<path d="M5 12h14"></path>',
        x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
        check: '<path d="m20 6-11 11-5-5"></path>',
        'check-circle': '<circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>',
        alert: '<path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>',
        loader: '<path d="M21 12a9 9 0 0 1-9 9"></path><path d="M3 12a9 9 0 0 1 9-9"></path>',
        flame: '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-4-7 .2 3-1 4-2 4 0-4-3-6-3-10C7 4 5 8 5 12c0 6 3 10 7 10z"></path>',
        database: '<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>',
        save: '<path d="M5 3h14l2 2v16H3V5l2-2z"></path><path d="M7 3v6h10V3"></path><path d="M8 21v-7h8v7"></path>',
        download: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
        chart: '<path d="M3 20h18"></path><path d="m5 16 4-4 3 3 7-8"></path>',
        tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"></path><circle cx="7.5" cy="7.5" r=".5"></circle>',
        eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
        pen: '<path d="m12 20 9-9-4-4-9 9-2 6 6-2z"></path><path d="m15 8 4 4"></path>',
        keyboard: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 9h.01"></path><path d="M11 9h.01"></path><path d="M15 9h.01"></path><path d="M7 13h10"></path>',
        eraser: '<path d="m7 21-5-5 9-9 5 5-9 9z"></path><path d="M14 4l6 6"></path><path d="M7 21h14"></path>'
    };

    function iconSvg(name, extraClass) {
        name = String(name || 'info').trim();
        name = ICON_ALIASES[name] || ICON_ALIASES['ti-' + name] || ICON_ALIASES['fa-' + name] || name;
        var path = ICON_PATHS[name] || ICON_PATHS.info;
        var filled = name === 'star-filled';
        var spin = name === 'loader';
        return '<svg class="local-icon' + (filled ? ' is-filled' : '') + (spin ? ' is-spin' : '') + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + '</svg>';
    }

    function resolveIconNameFromClasses(className) {
        var parts = String(className || '').split(/\s+/).filter(Boolean);
        for (var i = 0; i < parts.length; i += 1) {
            if (ICON_ALIASES[parts[i]]) {
                return ICON_ALIASES[parts[i]];
            }
        }
        for (var j = 0; j < parts.length; j += 1) {
            if (parts[j].indexOf('ti-') === 0) {
                return ICON_ALIASES[parts[j].replace(/^ti-/, '')] || parts[j].replace(/^ti-/, '');
            }
            if (parts[j].indexOf('fa-') === 0 && parts[j] !== 'fa-spin') {
                return ICON_ALIASES[parts[j].replace(/^fa-/, '')] || parts[j].replace(/^fa-/, '');
            }
        }
        return 'info';
    }

    function replaceIconElement(el) {
        if (!el || el.dataset.iconReplaced === 'true') {
            return;
        }
        var className = el.getAttribute('class') || '';
        if (!/\b(ti|fas|far|fab|fa)\b/.test(className) && className.indexOf('ti-') === -1 && className.indexOf('fa-') === -1) {
            return;
        }
        var span = document.createElement('span');
        span.className = 'icon-slot';
        span.innerHTML = iconSvg(resolveIconNameFromClasses(className));
        span.setAttribute('aria-hidden', 'true');
        if (/\bfa-spin\b/.test(className)) {
            span.querySelector('.local-icon').classList.add('is-spin');
        }
        el.replaceWith(span);
    }

    function normalizeIcons(root) {
        var scope = root && root.querySelectorAll ? root : document;
        Array.from(scope.querySelectorAll('[data-theme-toggle] .icon-slot')).forEach(function (slot) {
            var button = slot.closest('[data-theme-toggle]');
            if (button && button.dataset.themeIcon) {
                slot.innerHTML = iconSvg(button.dataset.themeIcon);
            }
        });
        Array.from(scope.querySelectorAll('i[class*="ti-"], i[class*="fa-"], i.ti, i.fas, i.far, i.fab, i.fa')).forEach(replaceIconElement);
    }

    function updateThemeToggle(toggle) {
        if (!toggle) {
            return;
        }
        var theme = document.documentElement.getAttribute('data-theme') || resolveTheme(readThemePreference());
        var icon = toggle.querySelector('i');
        toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        toggle.dataset.themeIcon = theme === 'dark' ? 'sun' : 'moon';
        if (icon) {
            icon.className = theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
        }
        if (!icon) {
            var slot = toggle.querySelector('.icon-slot');
            if (slot) {
                slot.innerHTML = iconSvg(theme === 'dark' ? 'sun' : 'moon');
            }
        }
    }

    function initThemeToggle() {
        var toggle = document.querySelector('[data-theme-toggle]');
        if (!toggle) {
            return;
        }
        applyTheme(readThemePreference());
        updateThemeToggle(toggle);
        toggle.addEventListener('click', function () {
            var current = document.documentElement.getAttribute('data-theme') || resolveTheme(readThemePreference());
            var next = current === 'dark' ? 'light' : 'dark';
            setThemePreference(next);
            updateThemeToggle(toggle);
        });
    }

    function initSystemThemeWatcher() {
        try {
            var media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
            if (!media) {
                return;
            }
            var handler = function () {
                var mode = readThemePreference();
                if (mode === 'system') {
                    applyTheme('system');
                    updateThemeToggle(document.querySelector('[data-theme-toggle]'));
                }
            };
            if (typeof media.addEventListener === 'function') {
                media.addEventListener('change', handler);
            } else if (typeof media.addListener === 'function') {
                media.addListener(handler);
            }
        } catch (e) {
            return;
        }
    }

    function renderToolIcon(icon) {
        return iconSvg(icon || 'file-text');
    }

    function getFavorites() {
        return readStorage(STORAGE_KEY_FAVORITES, []);
    }

    function isFavorite(toolId) {
        return getFavorites().indexOf(toolId) !== -1;
    }

    function toggleFavorite(toolId) {
        var favorites = getFavorites();
        var index = favorites.indexOf(toolId);
        if (index === -1) {
            favorites.unshift(toolId);
        } else {
            favorites.splice(index, 1);
        }
        writeStorage(STORAGE_KEY_FAVORITES, favorites.slice(0, 12));
    }

    function recordRecent(toolId) {
        var recents = readStorage(STORAGE_KEY_RECENTS, []);
        var index = recents.indexOf(toolId);
        if (index !== -1) {
            recents.splice(index, 1);
        }
        recents.unshift(toolId);
        writeStorage(STORAGE_KEY_RECENTS, recents.slice(0, 8));
    }

    function recordHistory(toolId) {
        var history = readStorage(STORAGE_KEY_HISTORY, []);
        history.unshift({ id: toolId, at: Date.now() });
        writeStorage(STORAGE_KEY_HISTORY, history.slice(0, 30));
    }

    function createTopbarForTool(tool) {
        var registry = getRegistry();
        var category = registry.categories.find(function (item) {
            return item.id === (tool ? tool.category : '');
        });
        var breadcrumb = category ? category.label : 'Tools';
        var toolTitle = tool ? tool.title : 'Tool';

        var nav = document.createElement('nav');
        nav.className = 'topbar topbar--tool';
        nav.innerHTML =
            '<div class="topbar__left">' +
                '<a class="logo" href="index.html" aria-label="PDF Studio home">' +
                    '<span class="logo-mark">' + iconSvg('layers') + '</span>' +
                    '<span class="logo-text">PDF Studio</span>' +
                '</a>' +
                '<div class="nav-links">' +
                    '<a class="nav-link" href="index.html#tools">Tools</a>' +
                    '<a class="nav-link" href="merge_pdfs.html">Workflows</a>' +
                    '<a class="nav-link" href="edit_metadata.html">Metadata</a>' +
                '</div>' +
            '</div>' +
            '<div class="topbar__center topbar__center--breadcrumb">' +
                '<div class="breadcrumb">' +
                    '<a href="index.html">Home</a>' +
                    '<span>/</span>' +
                    '<span>' + breadcrumb + '</span>' +
                    '<span>/</span>' +
                    '<span>' + toolTitle + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="topbar__right">' +
                '<button class="icon-btn" type="button" aria-label="Back" data-back-button>' +
                    iconSvg('arrow-left') +
                '</button>' +
                '<button class="icon-btn" type="button" aria-label="Open command palette" data-command-toggle>' +
                    iconSvg('command') +
                '</button>' +
                '<button class="icon-btn" type="button" aria-label="Toggle theme" data-theme-toggle>' +
                    iconSvg('moon') +
                '</button>' +
                '<button class="icon-btn" type="button" aria-label="Open navigation" data-drawer-toggle>' +
                    iconSvg('menu') +
                '</button>' +
            '</div>';

        return nav;
    }

    function injectTopbar(tool) {
        if (document.querySelector('.topbar')) {
            return;
        }
        var page = document.querySelector('.page') || document.body;
        var nav = createTopbarForTool(tool);
        if (page.firstChild) {
            page.insertBefore(nav, page.firstChild);
        } else {
            page.appendChild(nav);
        }
    }

    function initBackButton() {
        var backButton = document.querySelector('[data-back-button]');
        if (!backButton) {
            return;
        }
        backButton.addEventListener('click', function () {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'index.html';
            }
        });
    }

    function buildDrawer() {
        if (document.querySelector('.nav-drawer')) {
            return;
        }
        var registry = getRegistry();
        var drawer = document.createElement('div');
        drawer.className = 'nav-drawer';
        var links = registry.categories.map(function (category) {
            return '<a class="drawer-link" href="index.html#' + category.id + '">' + category.label + '</a>';
        }).join('');

        var featured = registry.tools.slice(0, 8).map(function (tool) {
            return '<a class="drawer-link drawer-link--tool" href="' + tool.href + '">' + iconSvg(tool.icon || 'file-text') + '<span>' + tool.title + '</span></a>';
        }).join('');

        drawer.innerHTML =
            '<div class="nav-drawer__backdrop" data-drawer-close></div>' +
            '<div class="nav-drawer__panel" role="dialog" aria-modal="true" aria-label="Navigation">' +
                '<div class="nav-drawer__header">' +
                    '<div class="logo">' +
                        '<span class="logo-mark">' + iconSvg('layers') + '</span>' +
                        '<span class="logo-text">PDF Studio</span>' +
                    '</div>' +
                    '<button class="icon-btn" type="button" aria-label="Close navigation" data-drawer-close>' + iconSvg('x') + '</button>' +
                '</div>' +
                '<div class="drawer-section-label">Categories</div>' +
                '<div class="drawer-links">' + links + '</div>' +
                '<div class="drawer-section-label">Popular tools</div>' +
                '<div class="drawer-links">' + featured + '</div>' +
                '<div class="drawer-links">' +
                    '<a class="drawer-link" href="index.html">All tools</a>' +
                '</div>' +
            '</div>';

        document.body.appendChild(drawer);
    }

    function initDrawer() {
        buildDrawer();
        var drawer = document.querySelector('.nav-drawer');
        var toggle = document.querySelector('[data-drawer-toggle]');
        if (!drawer || !toggle) {
            return;
        }

        function closeDrawer() {
            drawer.classList.remove('is-open');
            document.body.classList.remove('drawer-open');
            toggle.setAttribute('aria-expanded', 'false');
        }

        toggle.addEventListener('click', function () {
            var open = !drawer.classList.contains('is-open');
            drawer.classList.toggle('is-open', open);
            document.body.classList.toggle('drawer-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        drawer.addEventListener('click', function (event) {
            if (event.target && event.target.hasAttribute('data-drawer-close')) {
                closeDrawer();
            }
            if (event.target && event.target.closest('.drawer-link')) {
                closeDrawer();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && drawer.classList.contains('is-open')) {
                closeDrawer();
                toggle.focus();
            }
        });
    }

    function initIconObserver() {
        normalizeIcons(document);
        if (!window.MutationObserver) {
            return;
        }
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                Array.from(mutation.addedNodes || []).forEach(function (node) {
                    if (node.nodeType !== 1) {
                        return;
                    }
                    if (node.matches && node.matches('i[class*="ti-"], i[class*="fa-"], i.ti, i.fas, i.far, i.fab, i.fa')) {
                        replaceIconElement(node);
                    }
                    normalizeIcons(node);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function buildCommandPalette() {
        if (document.querySelector('.command-palette')) {
            return;
        }

        var palette = document.createElement('div');
        palette.className = 'command-palette';
        palette.innerHTML =
            '<div class="command-palette__panel">' +
                '<div class="command-palette__input">' +
                    iconSvg('search') +
                    '<input type="text" placeholder="Search tools or commands" data-command-input>' +
                '</div>' +
                '<div class="command-palette__list" data-command-list></div>' +
            '</div>';

        document.body.appendChild(palette);
    }

    function renderCommandList(query) {
        var registry = getRegistry();
        var list = document.querySelector('[data-command-list]');
        if (!list) {
            return;
        }

        var normalized = (query || '').trim().toLowerCase();
        var tools = registry.tools.filter(function (tool) {
            var haystack = [tool.title, tool.description, (tool.keywords || []).join(' ')].join(' ').toLowerCase();
            return normalized.length === 0 || haystack.indexOf(normalized) !== -1;
        }).slice(0, 12);

        list.innerHTML = tools.map(function (tool) {
            var categoryLabel = getCategoryLabel(tool.category || '');
            return '<a class="command-item" href="' + tool.href + '">' +
                '<span>' + tool.title + '<br><small>' + tool.description + '</small></span>' +
                '<small>' + categoryLabel.toUpperCase() + '</small>' +
            '</a>';
        }).join('');

        if (!tools.length) {
            list.innerHTML = '<div class="empty-state">No tools match your search.</div>';
        }
    }

    function initCommandPalette() {
        buildCommandPalette();
        var palette = document.querySelector('.command-palette');
        var toggle = document.querySelector('[data-command-toggle]');
        var input = document.querySelector('[data-command-input]');
        if (!palette || !input) {
            return;
        }

        function openPalette() {
            palette.classList.add('is-open');
            renderCommandList(input.value);
            setTimeout(function () {
                input.focus();
            }, 10);
        }

        function closePalette() {
            palette.classList.remove('is-open');
            input.value = '';
        }

        if (toggle) {
            toggle.addEventListener('click', openPalette);
        }

        palette.addEventListener('click', function (event) {
            if (event.target === palette) {
                closePalette();
            }
        });

        input.addEventListener('input', function (event) {
            renderCommandList(event.target.value);
        });

        document.addEventListener('keydown', function (event) {
            var isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
            if (isCmdK) {
                event.preventDefault();
                openPalette();
            }
            if (event.key === 'Escape' && palette.classList.contains('is-open')) {
                closePalette();
            }
        });
    }

    function renderToolCard(tool) {
        var card = document.createElement('div');
        card.className = 'tool-card';
        card.dataset.toolCard = '';
        card.dataset.category = tool.category || '';
        card.dataset.toolId = tool.id;
        card.dataset.search = [tool.title, tool.description, (tool.keywords || []).join(' ')].join(' ');
        card.tabIndex = 0;
        card.setAttribute('role', 'link');
        card.setAttribute('aria-label', tool.title);

        card.innerHTML =
            '<div class="tool-card__header">' +
                '<div class="tool-card__icon">' + renderToolIcon(tool.icon) + '</div>' +
                '<button class="tool-card__favorite" type="button" data-favorite-toggle aria-label="Pin tool">' +
                    iconSvg('star') +
                '</button>' +
            '</div>' +
            '<div class="tool-card__body">' +
                '<h3>' + tool.title + '</h3>' +
                '<p>' + tool.description + '</p>' +
            '</div>' +
            '<div class="tool-card__meta">' +
                '<span class="tool-meta">' + iconSvg('lock') + ' Local processing</span>' +
            '</div>';

        if (isFavorite(tool.id)) {
            var favoriteButton = card.querySelector('[data-favorite-toggle]');
            if (favoriteButton) {
                favoriteButton.classList.add('is-active');
            }
        }

        card.addEventListener('click', function (event) {
            if (event.target.closest('[data-favorite-toggle]')) {
                return;
            }
            window.location.href = tool.href;
        });

        card.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                window.location.href = tool.href;
            }
        });

        card.querySelector('[data-favorite-toggle]').addEventListener('click', function (event) {
            event.stopPropagation();
            toggleFavorite(tool.id);
            event.currentTarget.classList.toggle('is-active', isFavorite(tool.id));
            renderPinnedTools();
        });

        return card;
    }

    function renderToolGrid() {
        var grid = document.querySelector('[data-tool-grid]');
        if (!grid) {
            return;
        }
        var registry = getRegistry();
        grid.innerHTML = '';
        registry.tools.forEach(function (tool) {
            grid.appendChild(renderToolCard(tool));
        });
    }

    function renderCategoryTabs() {
        var tabsWrapper = document.querySelector('[data-category-tabs]');
        if (!tabsWrapper) {
            return;
        }
        var registry = getRegistry();
        var items = ['all'].concat(registry.categories.map(function (category) {
            return category.id;
        }));
        tabsWrapper.innerHTML = items.map(function (id) {
            var label = id === 'all' ? 'All' : (registry.categories.find(function (category) {
                return category.id === id;
            }) || {}).label;
            return '<button class="segmented-control__item" type="button" data-filter-tab data-category="' + id + '" role="tab" aria-selected="false">' + label + '</button>';
        }).join('');
        var first = tabsWrapper.querySelector('[data-filter-tab]');
        if (first) {
            first.classList.add('is-active');
            first.setAttribute('aria-selected', 'true');
        }
    }

    function initToolFilters() {
        var tabs = Array.from(document.querySelectorAll('[data-filter-tab]'));
        var countEl = document.querySelector('[data-tool-count]');
        var searchInput = document.querySelector('[data-tool-search]');
        var heroSearch = document.querySelector('[data-hero-search]');
        var grid = document.querySelector('[data-tool-grid]');

        if (!tabs.length || !grid) {
            return;
        }

        var activeCategory = 'all';
        var query = '';

        function updateTabState(activeTab) {
            tabs.forEach(function (tab) {
                var isActive = tab === activeTab;
                tab.classList.toggle('is-active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        }

        function applyFilters() {
            var normalized = query.trim().toLowerCase();
            var cards = Array.from(grid.querySelectorAll('[data-tool-card]'));
            var visibleCount = 0;

            cards.forEach(function (card) {
                var category = card.dataset.category || '';
                var matchesCategory = activeCategory === 'all' || category === activeCategory;
                var haystack = (card.dataset.search || card.textContent || '').toLowerCase();
                var matchesSearch = normalized.length === 0 || haystack.indexOf(normalized) !== -1;
                var shouldShow = matchesCategory && matchesSearch;

                card.classList.toggle('is-hidden', !shouldShow);
                if (shouldShow) {
                    visibleCount += 1;
                }
            });

            if (countEl) {
                countEl.textContent = visibleCount + (visibleCount === 1 ? ' tool' : ' tools');
            }
        }

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                activeCategory = tab.dataset.category || 'all';
                updateTabState(tab);
                applyFilters();
            });
        });

        if (searchInput) {
            searchInput.addEventListener('input', function (event) {
                query = event.target.value || '';
                if (heroSearch) {
                    heroSearch.value = query;
                }
                applyFilters();
            });
        }

        if (heroSearch) {
            heroSearch.addEventListener('input', function (event) {
                query = event.target.value || '';
                if (searchInput) {
                    searchInput.value = query;
                }
                applyFilters();
            });
        }

        applyFilters();
    }

    function initToolUsage() {
        var tool = getCurrentTool();
        if (!tool) {
            return;
        }
        recordRecent(tool.id);
        recordHistory(tool.id);
    }

    function normalizeLegacyToolPage() {
        if (!document.body.classList.contains('app-tool')) {
            return;
        }

        var container = document.querySelector('.container');
        if (!container) {
            return;
        }

        container.classList.add('tool-page-frame');

        var header = container.querySelector(':scope > header');
        if (header) {
            header.classList.add('tool-page-hero');
        }

        var content = container.querySelector(':scope > .content');
        if (content) {
            content.classList.add('tool-page-content');
        }

        Array.from(container.querySelectorAll('label, small, p')).forEach(function (node) {
            var text = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (
                text === 'supports multiple pdf files.' ||
                text.indexOf('browser auto-save') !== -1 ||
                text.indexOf("downloads 'merged.pdf'") !== -1 ||
                text.indexOf('downloads as zip') !== -1 ||
                text.indexOf('downloads to downloads') !== -1 ||
                text.indexOf('auto-downloads') !== -1 ||
                text.indexOf('output:') === 0
            ) {
                node.remove();
            }
        });

        Array.from(container.querySelectorAll('.content > label')).forEach(function (label) {
            var text = (label.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (text === 'output:' || text.indexOf('output:') === 0) {
                label.remove();
            }
        });

        Array.from(container.querySelectorAll('button')).forEach(function (button) {
            if (button.classList.contains('icon-btn')) {
                return;
            }
            if (button.classList.contains('btn')) {
                return;
            }
            var text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!text) {
                return;
            }
            button.classList.add('btn');
            if (text.indexOf('clear') !== -1 || text.indexOf('remove') !== -1 || text.indexOf('cancel') !== -1 || text.indexOf('back') !== -1) {
                button.classList.add('btn-ghost');
            } else if (text.indexOf('delete') !== -1 || text.indexOf('reset') !== -1) {
                button.classList.add('btn-danger');
            } else {
                button.classList.add('btn-primary');
            }
        });

        Array.from(container.querySelectorAll('.btn-group')).forEach(function (group) {
            group.classList.add('tool-actions');
        });

        Array.from(container.querySelectorAll('#dropZone, .upload-area, .upload-box')).forEach(function (zone) {
            zone.classList.add('tool-upload-card');
            var small = zone.querySelector('small');
            if (small) {
                small.remove();
            }
        });

        Array.from(container.querySelectorAll('#fileList, .file-list, #previewContainer, .preview-container, .watermark-options, .options-section')).forEach(function (section) {
            section.classList.add('tool-panel-card');
        });

        Array.from(container.querySelectorAll('#info, #status, #fileInfo, #sizeInfo')).forEach(function (state) {
            state.classList.add('tool-status-block');
        });
    }

    function updateToolCounts() {
        var registry = getRegistry();
        var total = registry.tools.length;
        var count = document.querySelector('[data-tool-count]');
        var totalTools = document.querySelector('[data-total-tools]');
        var footerCount = document.querySelector('[data-footer-tool-count]');
        if (count) {
            count.textContent = total + ' tools';
        }
        if (totalTools) {
            totalTools.textContent = total < 10 ? '0' + total : String(total);
        }
        if (footerCount) {
            footerCount.textContent = total + ' professional tools';
        }
    }

    function applyPremiumEnhancements() {
        document.body.classList.add('premium-ui');

        applyTheme(readThemePreference());
        initSystemThemeWatcher();
        document.documentElement.classList.add('theme-ready');

        var isIndex = /(?:^|\/)(index\.html)?$/i.test(window.location.pathname) || window.location.pathname.endsWith('/');
        if (!isIndex) {
            document.body.classList.add('app-tool');
        }

        var tool = getCurrentTool();
        injectTopbar(tool);
        initBackButton();
        initThemeToggle();
        initDrawer();
        initCommandPalette();

        renderCategoryTabs();
        renderToolGrid();
        initToolFilters();
        initToolUsage();
        normalizeLegacyToolPage();
        initIconObserver();
        updateToolCounts();
        window.PDFStudio = window.PDFStudio || {};
        window.PDFStudio.toast = toast;
        window.PDFStudio.iconSvg = iconSvg;
        window.PDFStudio.normalizeIcons = normalizeIcons;

        var revealTargets = document.querySelectorAll('.hero, .tools-header, .panel-card, .tool-card, .tool-shell, .tool-panel, .conversion-section, .content > div, .options-grid, .upload-section, #dropZone, .drop-zone');
        revealTargets.forEach(function (el, index) {
            el.classList.add('premium-reveal');
            el.style.animationDelay = Math.min(index * 50, 450) + 'ms';
        });

        var dropZones = document.querySelectorAll('#dropZone, .drop-zone, .upload-area, .upload-box, .drag-area, .tool-dropzone');
        dropZones.forEach(function (zone) {
            zone.classList.add('premium-dropzone');
            if (!zone.hasAttribute('tabindex')) {
                zone.tabIndex = 0;
            }
            if (!zone.hasAttribute('role')) {
                zone.setAttribute('role', 'button');
            }
            if (!zone.hasAttribute('aria-label')) {
                var label = (zone.textContent || '').replace(/\s+/g, ' ').trim();
                if (label) {
                    zone.setAttribute('aria-label', label);
                }
            }
            zone.addEventListener('keydown', function (event) {
                var key = event.key;
                if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                    event.preventDefault();
                    zone.click();
                }
            });
        });

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js').catch(function () {
                return;
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyPremiumEnhancements);
    } else {
        applyPremiumEnhancements();
    }
})();
