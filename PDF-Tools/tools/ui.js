import { formatBytes, describeError } from './engine.js';

export function h(tag, attrs, children) {
    const element = document.createElement(tag);
    const attributes = attrs || {};
    Object.keys(attributes).forEach((key) => {
        const value = attributes[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') {
            element.className = value;
        } else if (key === 'html') {
            element.innerHTML = value;
        } else if (key === 'text') {
            element.textContent = value;
        } else if (key === 'dataset') {
            Object.keys(value).forEach((name) => { element.dataset[name] = value[name]; });
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
            element.setAttribute(key, '');
        } else {
            element.setAttribute(key, value);
        }
    });
    const append = (child) => {
        if (child === null || child === undefined || child === false) return;
        if (Array.isArray(child)) {
            child.forEach(append);
            return;
        }
        element.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    };
    append(children);
    return element;
}

export function iconMarkup(name) {
    if (window.PDFStudio && typeof window.PDFStudio.iconSvg === 'function') {
        return window.PDFStudio.iconSvg(name);
    }
    return '';
}

export function icon(name) {
    if (window.PDFStudio && typeof window.PDFStudio.iconSvg === 'function') {
        return h('span', { class: 'pw-icon', html: window.PDFStudio.iconSvg(name) });
    }
    return h('span', { class: 'pw-icon', text: '' });
}

export function showToast(message, type) {
    if (window.PDFStudio && typeof window.PDFStudio.toast === 'function') {
        window.PDFStudio.toast(message, type);
    }
}

export function attachControl(element, control) {
    Object.defineProperty(element, 'control', { value: control, configurable: true, enumerable: false });
    return element;
}

export function field(config) {
    const control = config.control || h('input', {
        class: 'pw-input',
        type: config.type || 'text',
        value: config.value === undefined ? '' : config.value,
        placeholder: config.placeholder || '',
        min: config.min,
        max: config.max,
        step: config.step,
        inputmode: config.inputmode
    });
    const wrapper = h('label', { class: 'pw-field' + (config.wide ? ' pw-field--wide' : '') }, [
        h('span', { class: 'pw-label', text: config.label }),
        control,
        config.hint ? h('span', { class: 'pw-hint', text: config.hint }) : null
    ]);
    return attachControl(wrapper, control);
}

export function segmented(config) {
    const group = h('div', { class: 'pw-segmented', role: 'group', 'aria-label': config.label || 'Options' });
    const buttons = [];
    let initialized = false;
    const setValue = (value) => {
        buttons.forEach((button) => {
            const active = button.dataset.value === value;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        if (initialized && config.onChange) config.onChange(value);
    };
    (config.options || []).forEach((option) => {
        const button = h('button', {
            type: 'button',
            class: 'pw-segment',
            'data-value': option.value,
            text: option.label,
            onclick: () => {
                if (config.disabled) return;
                group.value = option.value;
                setValue(option.value);
            }
        });
        buttons.push(button);
        group.appendChild(button);
    });
    group.value = config.value || ((config.options || [])[0] || {}).value;
    setValue(group.value);
    initialized = true;
    return group;
}

export function checkbox(config) {
    const input = h('input', { type: 'checkbox', checked: !!config.checked });
    const wrapper = h('label', { class: 'pw-check' }, [input, h('span', { text: config.label })]);
    return attachControl(wrapper, input);
}

export function colorField(config) {
    return field(Object.assign({}, config, {
        type: 'color',
        control: h('input', { class: 'pw-color', type: 'color', value: config.value || '#000000' })
    }));
}

export function rangeField(config) {
    const valueLabel = h('span', { class: 'pw-range-value', text: config.value + (config.suffix || '') });
    const input = h('input', {
        class: 'pw-range',
        type: 'range',
        min: config.min,
        max: config.max,
        step: config.step || 1,
        value: config.value
    });
    input.addEventListener('input', () => {
        valueLabel.textContent = input.value + (config.suffix || '');
        if (config.onInput) config.onInput(input.value);
    });
    const wrapper = h('div', { class: 'pw-field' }, [
        h('span', { class: 'pw-label pw-label--row' }, [h('span', { text: config.label }), valueLabel]),
        input
    ]);
    return attachControl(wrapper, input);
}

export function createWorkspace(panel, options) {
    const config = Object.assign({
        mode: 'single',
        accept: '.pdf,application/pdf',
        prompt: 'Drop your PDF here',
        hint: 'or click to browse — files never leave your device',
        runLabel: 'Process',
        resetLabel: 'Reset'
    }, options || {});

    const input = h('input', { type: 'file', accept: config.accept, multiple: config.mode === 'multi', hidden: true });
    const dropLabel = h('span', { class: 'pw-dropzone__title', text: config.prompt });
    const dropHint = h('span', { class: 'pw-dropzone__hint', text: config.hint });
    const dropzone = h('div', { class: 'pw-dropzone', role: 'button', tabindex: '0', 'aria-label': config.prompt }, [
        h('span', { class: 'pw-dropzone__icon', html: window.PDFStudio ? window.PDFStudio.iconSvg('upload') : '' }),
        dropLabel,
        dropHint,
        input
    ]);

    const filebar = h('div', { class: 'pw-filebar', hidden: true });
    const queue = h('div', { class: 'pw-queue' });
    const extra = h('div', { class: 'pw-extra' });
    const runButton = h('button', { class: 'pw-btn pw-btn--primary', type: 'button', disabled: true, text: config.runLabel });
    const resetButton = h('button', { class: 'pw-btn pw-btn--ghost', type: 'button', text: config.resetLabel });
    const actions = h('div', { class: 'pw-actions' }, [runButton, resetButton]);
    const progressBar = h('span');
    const progressLabel = h('span', { class: 'pw-progress__label', text: '' });
    const progress = h('div', { class: 'pw-progress', hidden: true }, [h('div', { class: 'pw-progress__track' }, [progressBar]), progressLabel]);
    const status = h('div', { class: 'pw-status', role: 'status', hidden: true });
    const result = h('div', { class: 'pw-result', hidden: true });

    const root = h('div', { class: 'pw' }, [dropzone, filebar, queue, extra, actions, progress, status, result]);
    panel.innerHTML = '';
    panel.appendChild(root);

    const state = { files: [], file: null, busy: false, onFiles: null, onRun: null, onReset: null, pendingFiles: null };
    const workspace = {
        root, dropzone, input, filebar, queue, extra, actions, progress, status, result,
        runButton, resetButton,
        get files() { return state.files.slice(); },
        get file() { return state.file; },
        get busy() { return state.busy; },
        onFiles(callback) {
            state.onFiles = callback;
            if (state.pendingFiles && state.pendingFiles.length) {
                const queued = state.pendingFiles;
                state.pendingFiles = null;
                if (config.mode === 'multi') callback(queued, state.files);
                else callback(queued[0]);
            }
        },
        onRun(callback) { state.onRun = callback; },
        onReset(callback) { state.onReset = callback; },
        setDropText(title, hint) {
            dropLabel.textContent = title;
            if (hint !== undefined) dropHint.textContent = hint;
        },
        setFile(file) {
            state.file = file || null;
            state.files = file ? [file] : [];
            renderFilebar();
            runButton.disabled = !file || state.busy;
        },
        setFiles(files) {
            state.files = files.slice();
            if (config.mode === 'single') state.file = state.files[0] || null;
            renderFilebar();
        },
        clearFiles() {
            state.file = null;
            state.files = [];
            state.pendingFiles = null;
            input.value = '';
            filebar.hidden = true;
            filebar.innerHTML = '';
            runButton.disabled = true;
            setStatus('');
            hideResult();
            setProgress(null);
        },
        setReady(ready) {
            runButton.disabled = !ready || state.busy;
        },
        setBusy(busy, label) {
            state.busy = busy;
            runButton.disabled = busy || (!state.file && config.mode === 'single');
            resetButton.disabled = busy;
            dropzone.classList.toggle('is-busy', busy);
            if (busy) {
                root.querySelectorAll('input, select, textarea').forEach((element) => { element.disabled = true; });
                progress.hidden = false;
                if (label) progressLabel.textContent = label;
                status.hidden = true;
            } else {
                root.querySelectorAll('input, select, textarea').forEach((element) => { element.disabled = false; });
            }
        },
        setProgress(percent, label) {
            if (percent === null || percent === undefined) {
                progress.hidden = true;
                progressBar.style.width = '0%';
                progressLabel.textContent = '';
                return;
            }
            progress.hidden = false;
            progressBar.style.width = Math.max(0, Math.min(100, percent)) + '%';
            if (label !== undefined) progressLabel.textContent = label;
        },
        setStatus(message, type) {
            if (!message) {
                status.hidden = true;
                status.textContent = '';
                return;
            }
            status.hidden = false;
            status.textContent = message;
            status.className = 'pw-status' + (type ? ' is-' + type : '');
        },
        showError(error) {
            workspace.setStatus(describeError(error), 'error');
            showToast('Action failed', 'error');
        },
        hideResult() { result.hidden = true; result.innerHTML = ''; },
        showResult(builder) {
            result.innerHTML = '';
            result.hidden = false;
            builder(result);
        }
    };

    function renderFilebar() {
        if (config.mode === 'multi') {
            filebar.hidden = true;
            return;
        }
        const file = state.file;
        if (!file) {
            filebar.hidden = true;
            return;
        }
        filebar.hidden = false;
        filebar.innerHTML = '';
        filebar.appendChild(h('span', { class: 'pw-filebar__icon', html: window.PDFStudio ? window.PDFStudio.iconSvg('file-text') : '' }));
        const meta = h('div', { class: 'pw-filebar__meta' }, [
            h('strong', { text: file.name }),
            h('span', { text: formatBytes(file.size) })
        ]);
        filebar.appendChild(meta);
        filebar.appendChild(h('button', {
            type: 'button',
            class: 'pw-btn pw-btn--ghost pw-btn--small',
            text: 'Change',
            onclick: () => input.click()
        }));
    }

    dropzone.addEventListener('click', () => input.click());
    dropzone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.click();
        }
    });
    ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add('is-dragover');
    }));
    ['dragleave', 'dragend'].forEach((name) => dropzone.addEventListener(name, () => dropzone.classList.remove('is-dragover')));
    dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropzone.classList.remove('is-dragover');
        const files = Array.from(event.dataTransfer.files || []);
        handleFiles(files);
    });
    input.addEventListener('change', () => {
        handleFiles(Array.from(input.files || []));
        input.value = '';
    });

    function handleFiles(files) {
        if (!files.length) return;
        if (config.mode === 'multi') {
            const merged = state.files.concat(files);
            state.files = merged;
            if (state.onFiles) state.onFiles(files, merged);
            else state.pendingFiles = (state.pendingFiles || []).concat(files);
            return;
        }
        state.file = files[0];
        state.files = [files[0]];
        renderFilebar();
        if (state.onFiles) state.onFiles(files[0]);
        else state.pendingFiles = (state.pendingFiles || []).concat(files);
    }

    runButton.addEventListener('click', async () => {
        if (state.busy || !state.onRun) return;
        workspace.hideResult();
        workspace.setStatus('');
        try {
            await state.onRun(workspace);
        } catch (error) {
            workspace.setBusy(false);
            workspace.setProgress(null);
            workspace.showError(error);
        }
    });

    resetButton.addEventListener('click', () => {
        if (state.busy) return;
        workspace.clearFiles();
        if (state.onReset) state.onReset(workspace);
        runButton.disabled = true;
    });

    if (config.mode === 'multi') {
        dropzone.querySelector('.pw-dropzone__title').textContent = config.prompt;
    }

    return workspace;
}

export function passwordPrompt(parent, onSubmit) {
    const input = h('input', { class: 'pw-input', type: 'password', placeholder: 'PDF password', autocomplete: 'current-password' });
    const button = h('button', { class: 'pw-btn pw-btn--primary pw-btn--small', type: 'button', text: 'Unlock' });
    const message = h('span', { class: 'pw-hint', text: 'This PDF is locked. Enter its password to continue.' });
    const box = h('div', { class: 'pw-password', hidden: true }, [message, h('div', { class: 'pw-password__row' }, [input, button])]);
    const submit = async () => {
        if (!input.value) {
            input.focus();
            return;
        }
        button.disabled = true;
        input.disabled = true;
        try {
            await onSubmit(input.value);
            box.hidden = true;
        } catch (error) {
            message.textContent = describeError(error);
            message.classList.add('is-error');
            button.disabled = false;
            input.disabled = false;
            input.select();
        }
    };
    button.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        }
    });
    parent.appendChild(box);
    box.show = () => {
        box.hidden = false;
        message.classList.remove('is-error');
        message.textContent = 'This PDF is locked. Enter its password to continue.';
        button.disabled = false;
        input.disabled = false;
        input.focus();
    };
    box.hide = () => { box.hidden = true; };
    return box;
}

function tileStyle(page) {
    const rotation = ((page.rotation || 0) % 360 + 360) % 360;
    if (!rotation) return 'transform: none;';
    if (rotation === 90) return 'transform: rotate(90deg) scale(0.7);';
    if (rotation === 180) return 'transform: rotate(180deg) scale(1);';
    if (rotation === 270) return 'transform: rotate(270deg) scale(0.7);';
    return 'transform: none;';
}

export function renderPageGrid(container, config) {
    const pages = config.pages || [];
    const multiple = config.multiple !== false;
    const selected = config.selected || new Set();
    const onToggle = config.onToggle || function () {};
    const actions = config.actions || null;
    container.innerHTML = '';
    const grid = h('div', { class: 'pw-pagegrid' });
    pages.forEach((page) => {
        const isSelected = selected.has(page.page);
        const tile = h('div', {
            class: 'pw-pagetile' + (isSelected ? ' is-selected' : ''),
            'data-page': page.page,
            role: 'button',
            tabindex: '0',
            'aria-label': 'Page ' + page.page,
            'aria-pressed': String(isSelected)
        }, [
            h('div', { class: 'pw-pagetile__thumb' }, [
                h('img', { src: page.url, alt: '', loading: 'lazy', style: tileStyle(page), draggable: 'false' }),
                h('span', { class: 'pw-pagetile__num', text: page.page })
            ]),
            actions ? h('div', { class: 'pw-pagetile__actions' }, actions(page)) : null
        ]);
        const toggle = () => {
            if (!multiple) {
                selected.clear();
            }
            if (selected.has(page.page)) selected.delete(page.page);
            else selected.add(page.page);
            if (!multiple) selected.add(page.page);
            onToggle(page, selected);
            renderPageGrid(container, Object.assign({}, config, { selected }));
        };
        tile.addEventListener('click', (event) => {
            if (event.target.closest('button')) return;
            toggle();
        });
        tile.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
            }
        });
        grid.appendChild(tile);
    });
    container.appendChild(grid);
}

export function thumbnailItem(page, extra) {
    const item = h('div', { class: 'pw-thumb' + (extra && extra.selected ? ' is-selected' : '') }, [
        h('div', { class: 'pw-thumb__image' }, [h('img', { src: page.url, alt: '', loading: 'lazy', style: tileStyle(page), draggable: 'false' })]),
        h('div', { class: 'pw-thumb__meta' }, [
            h('strong', { text: 'Page ' + page.page }),
            h('span', { text: page.width + ' × ' + page.height + ' pt' })
        ])
    ]);
    return item;
}

export function renderResult(container, config) {
    container.hidden = false;
    container.innerHTML = '';
    container.appendChild(h('div', { class: 'pw-result__icon', html: window.PDFStudio ? window.PDFStudio.iconSvg('check-circle') : '' }));
    const body = h('div', { class: 'pw-result__body' }, [
        h('strong', { class: 'pw-result__title', text: config.title || 'Done' }),
        config.subtitle ? h('span', { class: 'pw-result__subtitle', text: config.subtitle }) : null
    ]);
    if (config.rows && config.rows.length) {
        body.appendChild(h('dl', { class: 'pw-kpis' }, config.rows.map((row) => h('div', {}, [
            h('dt', { text: row.label }),
            h('dd', { text: row.value })
        ]))));
    }
    const actions = h('div', { class: 'pw-result__actions' });
    (config.actions || []).forEach((action) => {
        actions.appendChild(h('button', {
            type: 'button',
            class: 'pw-btn ' + (action.primary ? 'pw-btn--primary' : 'pw-btn--ghost'),
            text: action.label,
            onclick: action.onClick
        }));
    });
    body.appendChild(actions);
    container.appendChild(body);
}

export function setButtonBusy(button, busy, label) {
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? (label || 'Working…') : button.dataset.label;
}

export function sortableList(container, items, config) {
    const options = config || {};
    container.innerHTML = '';
    items.forEach((item, index) => {
        const row = h('div', { class: 'pw-sortrow', draggable: 'true', 'data-index': index }, [
            h('span', { class: 'pw-sortrow__grip', html: window.PDFStudio ? window.PDFStudio.iconSvg('menu-2') : '' }),
            h('div', { class: 'pw-sortrow__body' }, [
                h('strong', { text: item.label }),
                h('span', { text: item.meta || '' })
            ]),
            h('div', { class: 'pw-sortrow__actions' }, [
                h('button', {
                    type: 'button', class: 'pw-iconbtn', title: 'Move up', html: window.PDFStudio ? window.PDFStudio.iconSvg('arrow-up') : '',
                    onclick: () => {
                        if (index === 0) return;
                        items.splice(index - 1, 0, items.splice(index, 1)[0]);
                        options.onReorder && options.onReorder(items);
                    }
                }),
                h('button', {
                    type: 'button', class: 'pw-iconbtn', title: 'Move down', html: window.PDFStudio ? window.PDFStudio.iconSvg('arrow-down') : '',
                    onclick: () => {
                        if (index >= items.length - 1) return;
                        items.splice(index + 1, 0, items.splice(index, 1)[0]);
                        options.onReorder && options.onReorder(items);
                    }
                }),
                options.onRemove ? h('button', {
                    type: 'button', class: 'pw-iconbtn pw-iconbtn--danger', title: 'Remove', html: window.PDFStudio ? window.PDFStudio.iconSvg('trash') : '',
                    onclick: () => {
                        items.splice(index, 1);
                        options.onRemove(item, items);
                    }
                }) : null
            ])
        ]);
        row.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('text/plain', String(index));
            row.classList.add('is-dragging');
        });
        row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
        row.addEventListener('dragover', (event) => event.preventDefault());
        row.addEventListener('drop', (event) => {
            event.preventDefault();
            const from = Number(event.dataTransfer.getData('text/plain'));
            if (!Number.isInteger(from) || from === index) return;
            const moved = items.splice(from, 1)[0];
            items.splice(index, 0, moved);
            options.onReorder && options.onReorder(items);
        });
        container.appendChild(row);
    });
}

export function kvGrid(rows) {
    return h('dl', { class: 'pw-kvgrid' }, rows.map((row) => h('div', {}, [
        h('dt', { text: row.label }),
        h('dd', { text: row.value })
    ])));
}

export function note(text, type) {
    return h('p', { class: 'pw-note' + (type ? ' is-' + type : ''), text });
}

export function pageBar(onChange) {
    const prev = h('button', { type: 'button', class: 'pw-iconbtn', title: 'Previous page', html: iconMarkup('arrow-left') });
    const next = h('button', { type: 'button', class: 'pw-iconbtn', title: 'Next page', html: iconMarkup('arrow-right') });
    const label = h('span', { class: 'pw-toolbar__label', text: 'Page 1 of 1' });
    const root = h('div', { class: 'pw-toolbar' }, [prev, next, h('span', { class: 'pw-toolbar__spacer' }), label]);
    let page = 1;
    let total = 0;
    const update = () => {
        label.textContent = 'Page ' + page + ' of ' + total;
        prev.disabled = page <= 1;
        next.disabled = page >= total;
    };
    const go = (value) => {
        if (!total) return;
        const nextPage = Math.min(total, Math.max(1, value));
        if (nextPage === page && total) return;
        page = nextPage;
        update();
        onChange(page);
    };
    prev.addEventListener('click', () => go(page - 1));
    next.addEventListener('click', () => go(page + 1));
    update();
    return {
        root,
        go,
        set(totalPages, pageNumber) {
            total = totalPages;
            page = pageNumber || 1;
            update();
        },
        get page() { return page; },
        get total() { return total; }
    };
}

export function group(label, children, hint) {
    return h('div', { class: 'pw-group' }, [
        h('div', { class: 'pw-group__label' }, [h('strong', { text: label }), hint ? h('span', { text: hint }) : null]),
        ...children
    ]);
}

export function twoColumn(left, right) {
    return h('div', { class: 'pw-columns' }, [h('div', { class: 'pw-col' }, left), h('div', { class: 'pw-col' }, right)]);
}
