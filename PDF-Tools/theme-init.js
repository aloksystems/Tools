(function () {
    var storageKey = 'pdfToolsTheme';
    var sharedKey = 'tools-theme';
    var docEl = document.documentElement;

    function getSystemTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function read(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function write(key, value) {
        try { localStorage.setItem(key, value); } catch (e) {}
    }

    function resolve(value) {
        if (value === 'light' || value === 'dark') return value;
        return getSystemTheme();
    }

    // app.js stores its preference as JSON, the shared site header stores raw text.
    function readAppTheme() {
        var raw = read(storageKey);
        if (raw === 'light' || raw === 'dark') return raw;
        if (!raw) return null;
        try {
            var parsed = JSON.parse(raw);
            if (parsed === 'light' || parsed === 'dark') return parsed;
        } catch (e) {}
        return null;
    }

    function writeAppTheme(value) {
        write(storageKey, JSON.stringify(value));
    }

    var savedTheme = read(sharedKey) || readAppTheme();
    var theme = resolve(savedTheme);
    docEl.setAttribute('data-theme', theme);
    docEl.style.colorScheme = theme;
    writeAppTheme(theme);
    write(sharedKey, theme);

    function sunIcon() {
        return '<circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>';
    }

    function moonIcon() {
        return '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }

    function syncAppToggle() {
        var toggle = document.getElementById('themeToggle');
        if (!toggle) return;
        toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        var icon = toggle.querySelector('.theme-icon');
        if (icon) icon.innerHTML = theme === 'dark' ? sunIcon() : moonIcon();
    }

    function mirrorTheme() {
        var next = docEl.getAttribute('data-theme');
        if (next !== 'light' && next !== 'dark') return;
        theme = next;
        docEl.style.colorScheme = next;
        writeAppTheme(next);
        write(sharedKey, next);
        syncAppToggle();
    }

    try {
        var media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
        if (media && typeof media.addEventListener === 'function') {
            media.addEventListener('change', function () {
                if (savedTheme === 'light' || savedTheme === 'dark') return;
                var next = getSystemTheme();
                docEl.setAttribute('data-theme', next);
                docEl.style.colorScheme = next;
                mirrorTheme();
            });
        }
    } catch (e) {}

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    ready(function () {
        syncAppToggle();
        // Keep the hub navbar button and the shared site header toggle in sync.
        if (window.MutationObserver && document.getElementById('themeToggle')) {
            new MutationObserver(mirrorTheme).observe(docEl, {
                attributes: true,
                attributeFilter: ['data-theme']
            });
        }
    });
})();
