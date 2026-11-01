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

    function esc(value) {
        return String(value).replace(/[&<>"]/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
        });
    }

    // file:///D:/Projects/Tools/... -> D:\Projects\Tools (cmd/Explorer style)
    function toNativePath(posixPath) {
        return /^\/[A-Za-z]:/.test(posixPath) ? posixPath.slice(1).replace(/\//g, '\\') : posixPath;
    }

    // Tool pages mount their UI through ES modules, which browsers refuse to load
    // from file://. Without this the page would sit forever on "Loading <Tool>…".
    function showLocalServerHelp() {
        if (location.protocol !== 'file:') return;
        var panel = document.querySelector('[data-tool-panel]');
        if (!panel) return;

        var cut = location.pathname.indexOf('/PDF-Tools/');
        // Path the web server will serve, i.e. everything from /PDF-Tools/ onwards.
        var served = cut === -1 ? location.pathname : location.pathname.slice(cut);
        var httpUrl = 'http://localhost:8000' + served + location.search;
        var root = cut === -1 ? '' : toNativePath(decodeURIComponent(location.pathname.slice(0, cut)));
        var serveCmd = (root ? 'cd "' + root + '" && ' : '') + 'python -m http.server 8000';
        var canonical = document.querySelector('link[rel="canonical"]');
        var liveUrl = canonical && /^https?:/.test(canonical.href) ? canonical.href : '';

        document.body.classList.add('pw-fileonly');
        panel.innerHTML =            '<div class="pw-filehelp">' +
            '<h2 class="pw-filehelp__title">Open this tool over http://</h2>' +
            '<p class="pw-filehelp__lead">The tool interface is loaded as JavaScript modules, and browsers block module files on <code>file://</code> pages. Nothing here is broken — start a local web server and this same page works.</p>' +
            '<ol class="pw-filehelp__steps">' +
            '<li><span>Start a server in the folder that contains <code>PDF-Tools</code>:</span>' +
            '<span class="pw-filehelp__cmd"><code>' + esc(serveCmd) + '</code><button class="pw-btn pw-btn--ghost pw-filehelp__copy" type="button" data-copy="' + esc(serveCmd) + '">Copy</button></span></li>' +
            '<li><span>Reload this page from the served address:</span>' +
            '<span class="pw-filehelp__cmd"><code>' + esc(httpUrl) + '</code><button class="pw-btn pw-btn--ghost pw-filehelp__copy" type="button" data-copy="' + esc(httpUrl) + '">Copy</button></span></li>' +
            '</ol>' +
            '<div class="pw-filehelp__actions">' +
            '<a class="pw-filehelp__btn pw-filehelp__btn--primary" href="' + esc(httpUrl) + '">Open over http://</a>' +
            (liveUrl ? '<a class="pw-filehelp__btn" href="' + esc(liveUrl) + '" target="_blank" rel="noopener">Open hosted site</a>' : '') +
            '<a class="pw-filehelp__btn" href="' + (cut === -1 ? './' : location.pathname.slice(0, cut + 11)) + '">Back to all tools</a>' +
            '</div></div>';

        Array.prototype.forEach.call(panel.querySelectorAll('.pw-filehelp__copy'), function (button) {
            button.addEventListener('click', function () {
                var field = document.createElement('textarea');
                field.value = button.getAttribute('data-copy');
                document.body.appendChild(field);
                field.select();
                try { document.execCommand('copy'); } catch (e) {}
                document.body.removeChild(field);
                button.textContent = 'Copied';
            });
        });
        // premium-ui.js publishes window.PDFStudio from its own DOMContentLoaded
        // handler, which runs after this one, so wait for the next task.
        setTimeout(fillHeroFromRegistry, 0);
    }

    // The hero is static HTML, so over file:// it is the one part that can still be
    // completed from the registry even though tool-shell.js is blocked.
    function fillHeroFromRegistry() {
        var registry = window.PDF_STUDIO_REGISTRY;
        if (!registry || !registry.getToolById) return;
        var id = document.body.dataset.toolId;
        if (!id && window.URL) {
            id = new URL(location.href).searchParams.get('tool');
        }
        var tool = id && registry.getToolById(id);
        if (!tool) return;

        var icon = document.querySelector('[data-tool-icon]');
        if (icon && !icon.textContent.trim() && window.PDFStudio && window.PDFStudio.iconSvg) {
            icon.innerHTML = window.PDFStudio.iconSvg(tool.icon || 'file-text');
            if (window.PDFStudio.normalizeIcons) window.PDFStudio.normalizeIcons(icon);
        }
        [['[data-tool-title]', tool.title], ['[data-tool-description]', tool.description]].forEach(function (pair) {
            var node = document.querySelector(pair[0]);
            if (node && !node.textContent.trim()) node.textContent = pair[1];
        });
    }

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    ready(function () {
        syncAppToggle();
        showLocalServerHelp();
        // Keep the hub navbar button and the shared site header toggle in sync.
        if (window.MutationObserver && document.getElementById('themeToggle')) {
            new MutationObserver(mirrorTheme).observe(docEl, {
                attributes: true,
                attributeFilter: ['data-theme']
            });
        }
    });
})();
