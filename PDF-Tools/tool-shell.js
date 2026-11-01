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
            if (window.PDFStudio && window.PDFStudio.toast) {
                window.PDFStudio.toast(index === -1 ? 'Tool pinned' : 'Tool unpinned');
            }
        });
    }

    function renderSidebarRecents(container, currentId) {
        if (!container) {
            return;
        }
        var recents = readStorage('pdfStudioRecents', []).filter(function (id) {
            return id !== currentId;
        });
        if (!recents.length || !registry || !registry.getToolById) {
            container.innerHTML = '<strong>Recent tools</strong><p class="tool-sidebar__empty">Tools you open will appear here.</p>';
            return;
        }
        var items = recents.slice(0, 4).map(function (id) {
            var tool = registry.getToolById(id);
            if (!tool) {
                return '';
            }
            return '<a class="tool-sidebar__link" href="../' + tool.href + '">' + iconSvg(tool.icon) + '<span>' + tool.title + '</span></a>';
        }).filter(Boolean);
        container.innerHTML = '<strong>Recent tools</strong><div class="tool-sidebar__links">' + items.join('') + '</div>';
    }

    function renderSidebarTips(container, tool) {
        if (!container) {
            return;
        }
        var tips = (tool && tool.tips) || [];
        var html = '<strong>How to use it</strong><ol class="tool-sidebar__steps">';
        html += '<li>Drop a file — it stays on your device.</li>';
        tips.forEach(function (tip) {
            html += '<li>' + tip + '</li>';
        });
        html += '</ol>';
        html += '<a class="tool-sidebar__all" href="../index.html">' + iconSvg('layers') + ' All PDF tools</a>';
        container.innerHTML = html;
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
            panel.innerHTML = '<div class="pw-empty">Tool not found. <a href="../index.html">Browse all PDF tools</a>.</div>';
            return;
        }

        document.body.dataset.toolId = toolId;
        document.title = tool.title + ' | PDF Tools';
        var descriptionMeta = document.querySelector('meta[name="description"]');
        if (descriptionMeta) {
            descriptionMeta.setAttribute('content', tool.description + ' Free and private — every file is processed locally in your browser.');
        }
        var themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) {
            themeMeta.setAttribute('content', document.documentElement.getAttribute('data-theme') === 'dark' ? '#0b1120' : '#f8fafc');
        }

        var icon = document.querySelector('[data-tool-icon]');
        var title = document.querySelector('[data-tool-title]');
        var description = document.querySelector('[data-tool-description]');
        var category = document.querySelector('[data-tool-category]');
        var favoriteButton = document.querySelector('[data-tool-favorite]');
        var chip = document.querySelector('[data-tool-chip]');

        if (icon) {
            icon.innerHTML = iconSvg(tool.icon || 'file-text');
            if (window.PDFStudio && typeof window.PDFStudio.normalizeIcons === 'function') {
                window.PDFStudio.normalizeIcons(icon);
            }
        }
        if (title) title.textContent = tool.title;
        if (description) description.textContent = tool.description;
        if (category) category.textContent = getCategoryLabel(tool.category);
        if (chip) chip.innerHTML = iconSvg('shield') + ' <span>100% local</span>';
        if (favoriteButton) initFavorite(favoriteButton, toolId);

        renderSidebarTips(document.querySelector('[data-tool-tips]'), tool);
        renderSidebarRecents(document.querySelector('[data-tool-recents]'), toolId);

        import('./tools/' + toolId + '.js')
            .then(function (module) {
                if (module && module.render) {
                    module.render(panel, { tool: tool, registry: registry });
                } else {
                    panel.innerHTML = '<div class="pw-empty">This tool is missing its render function.</div>';
                }
            })
            .catch(function (error) {
                panel.innerHTML = '<div class="pw-empty">This tool could not load. ' + (error && error.message ? error.message : '') + '<br>Try reloading the page.</div>';
                if (window.console && console.error) console.error(error);
            });
    }

    var toolId = getToolId();
    if (toolId) {
        mountTool(toolId);
    }
})();
