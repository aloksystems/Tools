(function () {
    var registry = window.PDF_STUDIO_REGISTRY;

    function readStorage(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
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

    function getToolId() {
        var url = new URL(window.location.href);
        return url.searchParams.get('tool') || document.body.dataset.toolId;
    }

    function getCategoryLabel(categoryId) {
        if (!registry || !registry.categories) {
            return 'Tool';
        }
        var match = registry.categories.find(function (item) {
            return item.id === categoryId;
        });
        return match ? match.label : 'Tool';
    }

    function iconSvg(name) {
        if (window.PDFStudio && typeof window.PDFStudio.iconSvg === 'function') {
            return window.PDFStudio.iconSvg(name || 'file-text');
        }
        return '<i class="ti ti-' + (name || 'file-text') + '"></i>';
    }

    function setFavoriteState(button, toolId) {
        var favorites = readStorage('pdfStudioFavorites', []);
        var isFavorite = favorites.indexOf(toolId) !== -1;
        button.classList.toggle('is-active', isFavorite);
        button.innerHTML = (isFavorite ? iconSvg('star-filled') + ' Pinned' : iconSvg('star') + ' Pin');
        if (window.PDFStudio && typeof window.PDFStudio.normalizeIcons === 'function') {
            window.PDFStudio.normalizeIcons(button);
        }
    }

    function initFavorite(button, toolId) {
        setFavoriteState(button, toolId);
        button.addEventListener('click', function () {
            var favorites = readStorage('pdfStudioFavorites', []);
            var index = favorites.indexOf(toolId);
            if (index === -1) {
                favorites.unshift(toolId);
            } else {
                favorites.splice(index, 1);
            }
            writeStorage('pdfStudioFavorites', favorites.slice(0, 12));
            setFavoriteState(button, toolId);
        });
    }

    function renderSidebarRecents(container) {
        if (!container) {
            return;
        }
        var recents = readStorage('pdfStudioRecents', []);
        if (!recents.length || !registry || !registry.getToolById) {
            container.textContent = 'Recent tools will appear here.';
            return;
        }
        var items = recents.slice(0, 3).map(function (id) {
            var tool = registry.getToolById(id);
            if (!tool) {
                return '';
            }
            return '<a href="' + tool.href + '">' + tool.title + '</a>';
        }).filter(Boolean);
        container.innerHTML = '<strong>Recent tools</strong><div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">' + items.join('') + '</div>';
        container.querySelectorAll('a').forEach(function (link) {
            link.style.textDecoration = 'none';
            link.style.color = 'inherit';
        });
    }

    function renderSidebarTips(container, tips) {
        if (!container) {
            return;
        }
        if (!tips || !tips.length) {
            container.textContent = 'Tips and shortcuts will appear here.';
            return;
        }
        container.innerHTML = '<strong>Tips</strong><ul style="margin:8px 0 0; padding-left:18px;">' +
            tips.map(function (tip) { return '<li>' + tip + '</li>'; }).join('') +
            '</ul>';
    }

    function mountTool(toolId) {
        if (!registry || !registry.getToolById) {
            return;
        }

        var tool = registry.getToolById(toolId);
        var panel = document.querySelector('[data-tool-panel]');
        if (!panel) {
            return;
        }
        if (!tool) {
            panel.innerHTML = '<div class="empty-state">Tool not found. Return to the library to choose another.</div>';
            return;
        }

        document.body.dataset.toolId = toolId;
        document.title = tool.title + ' | PDF Studio';
        var descriptionMeta = document.querySelector('meta[name="description"]');
        if (descriptionMeta) {
            descriptionMeta.setAttribute('content', tool.description + ' Run locally in your browser with PDF Studio.');
        }
        var themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) {
            themeMeta.setAttribute('content', document.documentElement.getAttribute('data-theme') === 'dark' ? '#0f172a' : '#f8fafc');
        }

        var icon = document.querySelector('[data-tool-icon]');
        var title = document.querySelector('[data-tool-title]');
        var description = document.querySelector('[data-tool-description]');
        var category = document.querySelector('[data-tool-category]');
        var favoriteButton = document.querySelector('[data-tool-favorite]');

        if (icon) {
            var iconName = tool && tool.icon ? tool.icon : 'file-text';
            icon.innerHTML = iconSvg(iconName);
            if (window.PDFStudio && typeof window.PDFStudio.normalizeIcons === 'function') {
                window.PDFStudio.normalizeIcons(icon);
            }
        }
        if (title) {
            title.textContent = tool.title;
        }
        if (description) {
            description.textContent = tool.description;
        }
        if (category) {
            category.textContent = getCategoryLabel(tool.category);
        }
        if (favoriteButton) {
            initFavorite(favoriteButton, toolId);
        }

        renderSidebarTips(document.querySelector('[data-tool-tips]'), tool.tips || []);
        renderSidebarRecents(document.querySelector('[data-tool-recents]'));

        var modulePath = tool.module ? './tools/pdf-suite.js' : './tools/' + toolId + '.js';

        import(modulePath)
            .then(function (module) {
                if (module && module.render) {
                    module.render(panel, { tool: tool, registry: registry });
                } else {
                    panel.innerHTML = '<div class="empty-state">Tool module is missing a render function.</div>';
                }
            })
            .catch(function (error) {
                panel.innerHTML = '<div class="empty-state">Unable to load this tool. ' + error.message + '</div>';
            });
    }

    var toolId = getToolId();
    if (toolId) {
        mountTool(toolId);
    }
})();
