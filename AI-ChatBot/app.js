// App shell: modals, sidebar workspace, folders, API keys, search, exports, and stats.

const PROVIDER_KEY_STORAGE = {
    openrouter: 'openrouter_api_key',
    gemini: 'gemini_api_key',
    deepseek: 'deepseek_api_key',
    huggingface: 'huggingface_api_key',
    grok: 'grok_api_key'
};

const DEFAULT_FOLDER_ID = 'uncategorized';
const MOBILE_QUERY = '(max-width: 860px)';

const SYSTEM_PRESETS = {
    default: '',
    expert: 'You are a senior software engineer. Give correct, runnable code, keep explanations short, and call out edge cases.',
    teacher: 'You are a patient teacher. Explain step by step in simple language and include one small example.',
    creative: 'You are a creative writer. Write vivid, engaging prose and offer a couple of stylistic options.'
};

const modalStack = [];
const modalFocusReturn = new Map();

let pendingConfirmResolver = null;
let pendingPromptResolver = null;
let pendingPromptValidator = null;
let pendingAssign = null;
let pendingModelKeyId = null;
let filterTimer = null;
let searchTimer = null;

/* ---------- Helpers ---------- */

function byId(id) {
    return document.getElementById(id);
}

function makeEl(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (error) {
        return fallback;
    }
}

function writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        return false;
    }
}

function emptyState(message) {
    return makeEl('div', 'empty-state', message);
}

function isMobileView() {
    return window.matchMedia(MOBILE_QUERY).matches;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function estimateTokens(text) {
    return Math.ceil(String(text || '').length / 4);
}

function conversationText(message) {
    if (!message || typeof message.content !== 'string') return '';
    if (message.image || message.content.startsWith('data:image') ||
        message.content.startsWith('<div class="generated-image">')) {
        return message.prompt ? `Generated image: ${message.prompt}` : 'Generated image';
    }
    return message.content;
}

/* ---------- Toasts ---------- */

function showToast(message, type = 'info') {
    const container = byId('toast-container');
    if (!container) return;

    while (container.children.length >= 4) {
        container.firstElementChild.remove();
    }

    const toast = makeEl('div', 'toast' + (type === 'error' ? ' toast-error' : ''));
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const icon = makeEl('i', `fas ${icons[type] || icons.info}`);
    icon.setAttribute('aria-hidden', 'true');
    const text = makeEl('span', '', String(message));
    toast.append(icon, text);
    container.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add('fade-out');
        window.setTimeout(() => toast.remove(), 260);
    }, 3400);
}

window.showToast = showToast;

/* ---------- Modal system ---------- */

function getFocusable(modal) {
    if (!modal) return [];
    return Array.from(modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.getClientRects().length > 0);
}

function openModal(id) {
    const modal = byId(id);
    if (!modal || !modal.hidden) return;

    const opener = document.activeElement;
    if (opener && opener !== document.body) modalFocusReturn.set(id, opener);

    modal.hidden = false;
    modalStack.push(id);
    document.body.classList.add('modal-open');

    window.setTimeout(() => {
        if (modalStack[modalStack.length - 1] !== id || modal.hidden) return;
        if (modal.contains(document.activeElement) && document.activeElement !== document.body) return;
        const target = modal.querySelector('[data-autofocus]') || getFocusable(modal)[0];
        if (target) target.focus();
    }, 40);
}

function closeModal(id) {
    const targetId = typeof id === 'string' ? id : modalStack[modalStack.length - 1];
    if (!targetId) return;

    const modal = byId(targetId);
    const confirmResolve = targetId === 'confirm-modal' ? pendingConfirmResolver : null;
    const promptResolve = targetId === 'prompt-modal' ? pendingPromptResolver : null;
    if (targetId === 'confirm-modal') pendingConfirmResolver = null;
    if (targetId === 'prompt-modal') {
        pendingPromptResolver = null;
        pendingPromptValidator = null;
    }

    if (modal && !modal.hidden) modal.hidden = true;

    const stackIndex = modalStack.lastIndexOf(targetId);
    if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
    if (!modalStack.length) document.body.classList.remove('modal-open');

    const opener = modalFocusReturn.get(targetId);
    modalFocusReturn.delete(targetId);
    if (opener && document.contains(opener) && opener.getClientRects().length > 0) {
        try { opener.focus(); } catch (error) { /* focus is best-effort */ }
    }

    if (confirmResolve) confirmResolve(false);
    if (promptResolve) promptResolve(null);
}

window.openModal = openModal;
window.closeModal = closeModal;

function resolveConfirm(value) {
    const resolve = pendingConfirmResolver;
    pendingConfirmResolver = null;
    closeModal('confirm-modal');
    if (resolve) resolve(value);
}

function confirmAction({ title = 'Are you sure?', message = 'This action cannot be undone.', confirmLabel = 'Confirm', danger = false } = {}) {
    const titleEl = byId('confirm-title');
    const messageEl = byId('confirm-message');
    const okBtn = byId('confirm-ok');
    const icon = byId('confirm-icon');
    if (!titleEl || !messageEl || !okBtn) return Promise.resolve(false);

    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = confirmLabel;
    okBtn.classList.remove('btn-primary', 'btn-danger');
    okBtn.classList.add(danger ? 'btn-danger' : 'btn-primary');
    if (icon) {
        icon.classList.toggle('modal-icon-danger', danger);
        icon.innerHTML = `<i class="fas ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}" aria-hidden="true"></i>`;
    }

    if (pendingConfirmResolver) {
        const previous = pendingConfirmResolver;
        pendingConfirmResolver = null;
        previous(false);
    }

    openModal('confirm-modal');
    return new Promise(resolve => { pendingConfirmResolver = resolve; });
}

function promptAction({
    title = 'Folder',
    subtitle = 'Group related conversations together.',
    label = 'Name',
    value = '',
    placeholder = '',
    okLabel = 'Save',
    icon = 'fa-folder-plus',
    maxLength = 60,
    validate = null
} = {}) {
    const titleEl = byId('prompt-title');
    const subtitleEl = byId('prompt-subtitle');
    const labelEl = byId('prompt-label');
    const input = byId('prompt-input');
    const okBtn = byId('prompt-ok');
    const modalIcon = byId('prompt-modal')?.querySelector('.modal-icon i');
    if (!titleEl || !subtitleEl || !labelEl || !input || !okBtn) return Promise.resolve(null);

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    labelEl.textContent = label;
    input.value = value;
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.classList.remove('input-error');
    okBtn.textContent = okLabel;
    if (modalIcon) modalIcon.className = `fas ${icon}`;
    pendingPromptValidator = validate;

    openModal('prompt-modal');
    window.setTimeout(() => {
        input.focus();
        input.select();
    }, 45);

    return new Promise(resolve => { pendingPromptResolver = resolve; });
}

function submitPrompt() {
    const input = byId('prompt-input');
    if (!input) return;
    const value = input.value.trim();

    if (!value) {
        input.classList.add('input-error');
        input.focus();
        showToast('Enter a name first.', 'error');
        return;
    }

    if (pendingPromptValidator) {
        const error = pendingPromptValidator(value);
        if (error) {
            input.classList.add('input-error');
            input.focus();
            showToast(error, 'error');
            return;
        }
    }

    const resolve = pendingPromptResolver;
    pendingPromptResolver = null;
    pendingPromptValidator = null;
    closeModal('prompt-modal');
    if (resolve) resolve(value);
}

function initModalSystem() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('mousedown', event => {
            if (event.target === modal) closeModal(modal.id);
        });
    });

    document.addEventListener('click', event => {
        if (!(event.target instanceof Element)) return;
        const closer = event.target.closest('[data-close-modal]');
        if (!closer) return;
        const modal = closer.closest('.modal');
        if (modal) closeModal(modal.id);
    });

    const confirmOk = byId('confirm-ok');
    const confirmCancel = byId('confirm-cancel');
    if (confirmOk) confirmOk.addEventListener('click', () => resolveConfirm(true));
    if (confirmCancel) confirmCancel.addEventListener('click', () => resolveConfirm(false));

    const promptOk = byId('prompt-ok');
    const promptInput = byId('prompt-input');
    if (promptOk) promptOk.addEventListener('click', submitPrompt);
    if (promptInput) {
        promptInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitPrompt();
            }
        });
        promptInput.addEventListener('input', () => promptInput.classList.remove('input-error'));
    }
}

function trapFocus(event, modal) {
    const focusable = getFocusable(modal);
    if (!focusable.length) {
        event.preventDefault();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!modal.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
    }

    if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

/* ---------- Sidebar ---------- */

function openSidebar() {
    if (!isMobileView()) {
        byId('app-shell')?.classList.remove('is-sidebar-collapsed');
        try { localStorage.setItem('sidebar_collapsed', '0'); } catch (error) { /* noop */ }
        return;
    }

    byId('sidebar')?.classList.add('is-open');
    const scrim = byId('sidebar-scrim');
    if (scrim) scrim.hidden = false;
    byId('menu-btn')?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
    byId('sidebar')?.classList.remove('is-open');
    const scrim = byId('sidebar-scrim');
    if (scrim) scrim.hidden = true;
    byId('menu-btn')?.setAttribute('aria-expanded', 'false');
}

window.closeSidebar = closeSidebar;

function toggleSidebar() {
    if (isMobileView()) {
        if (byId('sidebar')?.classList.contains('is-open')) closeSidebar();
        else openSidebar();
        return;
    }

    const shell = byId('app-shell');
    if (!shell) return;
    const collapsed = shell.classList.toggle('is-sidebar-collapsed');
    try { localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0'); } catch (error) { /* noop */ }
    byId('menu-btn')?.setAttribute('aria-expanded', String(!collapsed));
}

function applySidebarPreference() {
    if (isMobileView()) return;
    try {
        if (localStorage.getItem('sidebar_collapsed') === '1') {
            byId('app-shell')?.classList.add('is-sidebar-collapsed');
            byId('menu-btn')?.setAttribute('aria-expanded', 'false');
        }
    } catch (error) { /* noop */ }
}

/* ---------- Folders and conversation tree ---------- */

function normalizeFolders(raw) {
    const folders = [];
    const seen = new Set();

    (Array.isArray(raw) ? raw : []).forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        let id = typeof item.id === 'string' && item.id ? item.id : `folder_${Date.now()}_${index}`;
        if (id === DEFAULT_FOLDER_ID && !item.isDefault) id = `folder_${Date.now()}_${index}`;
        if (seen.has(id)) id = `${id}_${index}`;
        seen.add(id);

        folders.push({
            id,
            name: String(item.name || '').trim() || 'Folder',
            isDefault: Boolean(item.isDefault) || id === DEFAULT_FOLDER_ID,
            collapsed: Boolean(item.collapsed),
            conversations: Array.isArray(item.conversations)
                ? Array.from(new Set(item.conversations.filter(value => typeof value === 'string')))
                : []
        });
    });

    let defaultFolder = folders.find(folder => folder.isDefault);
    if (!defaultFolder) {
        defaultFolder = {
            id: DEFAULT_FOLDER_ID,
            name: 'All chats',
            isDefault: true,
            collapsed: false,
            conversations: []
        };
        folders.unshift(defaultFolder);
    } else {
        defaultFolder.id = DEFAULT_FOLDER_ID;
        defaultFolder.name = 'All chats';
        defaultFolder.isDefault = true;
        defaultFolder.collapsed = false;
        const index = folders.indexOf(defaultFolder);
        if (index > 0) {
            folders.splice(index, 1);
            folders.unshift(defaultFolder);
        }
    }

    return folders;
}

function loadFolders() {
    const folders = normalizeFolders(readJSON('conversation_folders', []));
    window.conversationFolders = folders;
    writeJSON('conversation_folders', folders);
}

function saveFolders() {
    return writeJSON('conversation_folders', window.conversationFolders || []);
}

function getFolderForConversation(modelId) {
    return (window.conversationFolders || []).find(folder =>
        Array.isArray(folder.conversations) && folder.conversations.includes(modelId)
    ) || null;
}

function getValidConversationIds() {
    return Object.keys(localStorage)
        .filter(key => key.startsWith('chat_'))
        .map(key => key.slice(5))
        .filter(modelId => typeof getModelById === 'function' && getModelById(modelId));
}

function getPinnedIds() {
    const pinned = readJSON('pinned_conversations', []);
    if (!Array.isArray(pinned)) return [];
    return Array.from(new Set(pinned.filter(value => typeof value === 'string')));
}

function savePinnedIds(ids) {
    writeJSON('pinned_conversations', Array.from(new Set(ids)));
}

function conversationMatchesFilter(modelId, term) {
    if (!term) return true;
    const title = (typeof getConversationTitle === 'function' ? getConversationTitle(modelId) : '').toLowerCase();
    if (title.includes(term)) return true;

    const model = typeof getModelById === 'function' ? getModelById(modelId) : null;
    if (model) {
        if (model.name.toLowerCase().includes(term)) return true;
        if (getProviderMeta(model.provider).name.toLowerCase().includes(term)) return true;
    }

    const folder = getFolderForConversation(modelId);
    return Boolean(folder && folder.name.toLowerCase().includes(term));
}

function renderFolderTree() {
    const tree = byId('folder-tree');
    if (!tree) return;

    tree.replaceChildren();
    const valid = new Set(getValidConversationIds());
    const term = (byId('conversation-filter')?.value || '').trim().toLowerCase();
    const folders = window.conversationFolders || [];

    if (valid.size === 0) {
        tree.appendChild(makeEl('p', 'sidebar-empty', 'No conversations yet. Start one from the model picker.'));
        renderFavorites(term, valid);
        return;
    }

    let rendered = 0;
    folders.forEach(folder => {
        folder.conversations = (Array.isArray(folder.conversations) ? folder.conversations : [])
            .filter(id => valid.has(id));

        const ids = folder.conversations
            .filter(id => conversationMatchesFilter(id, term))
            .sort((a, b) => getConversationTimestamp(b) - getConversationTimestamp(a));

        if (term && ids.length === 0) return;
        tree.appendChild(buildFolderGroup(folder, ids));
        rendered++;
    });

    if (!rendered) {
        tree.appendChild(makeEl('p', 'sidebar-empty', 'No conversations match this filter.'));
    }

    renderFavorites(term, valid);
}

function buildFolderGroup(folder, ids) {
    const expanded = !folder.collapsed;
    const group = makeEl('div', 'folder-group' + (expanded ? ' is-expanded' : ''));
    group.dataset.folderId = folder.id;

    const head = makeEl('div', 'folder-head');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'folder-toggle';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${folder.name} folder`);

    const chevron = makeEl('i', 'fas fa-chevron-right folder-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    const nameWrap = makeEl('span', 'folder-name');
    const folderIcon = makeEl('i', `fas ${folder.isDefault ? 'fa-inbox' : 'fa-folder'}`);
    folderIcon.setAttribute('aria-hidden', 'true');
    nameWrap.append(folderIcon, makeEl('span', '', folder.name));
    const count = makeEl('span', 'folder-count', String(ids.length));
    toggle.append(chevron, nameWrap, count);
    head.appendChild(toggle);

    if (!folder.isDefault) {
        const actions = makeEl('div', 'folder-actions');
        const renameBtn = makeEl('button', 'folder-action-btn');
        renameBtn.type = 'button';
        renameBtn.title = 'Rename folder';
        renameBtn.setAttribute('aria-label', `Rename ${folder.name}`);
        renameBtn.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i>';
        renameBtn.addEventListener('click', async () => {
            const name = await promptAction({
                title: 'Rename folder',
                subtitle: 'Only the folder label changes.',
                label: 'Folder name',
                value: folder.name,
                icon: 'fa-pen',
                maxLength: 40,
                validate: value => folderNameError(value, folder.id)
            });
            if (!name) return;
            folder.name = name;
            saveFolders();
            renderFolderTree();
            showToast('Folder renamed.', 'success');
        });

        const deleteBtn = makeEl('button', 'folder-action-btn delete');
        deleteBtn.type = 'button';
        deleteBtn.title = 'Delete folder';
        deleteBtn.setAttribute('aria-label', `Delete ${folder.name}`);
        deleteBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', async () => {
            const confirmed = await confirmAction({
                title: 'Delete this folder?',
                message: `"${folder.name}" will be removed. Its chats move to All chats.`,
                confirmLabel: 'Delete folder',
                danger: true
            });
            if (!confirmed) return;

            const folders = window.conversationFolders || [];
            const defaultFolder = folders.find(item => item.isDefault);
            if (defaultFolder) {
                folder.conversations.forEach(id => {
                    if (!defaultFolder.conversations.includes(id)) defaultFolder.conversations.push(id);
                });
            }
            window.conversationFolders = folders.filter(item => item.id !== folder.id);
            saveFolders();
            renderFolderTree();
            showToast('Folder deleted.', 'success');
        });

        actions.append(renameBtn, deleteBtn);
        head.appendChild(actions);
    }

    const list = makeEl('div', 'conversation-list');
    list.hidden = !expanded;

    toggle.addEventListener('click', () => {
        folder.collapsed = !folder.collapsed;
        group.classList.toggle('is-expanded', !folder.collapsed);
        list.hidden = folder.collapsed;
        toggle.setAttribute('aria-expanded', String(!folder.collapsed));
        saveFolders();
    });

    ids.forEach(modelId => list.appendChild(buildConversationItem(modelId)));

    group.append(head, list);
    return group;
}

function buildConversationItem(modelId) {
    const model = getModelById(modelId);
    const title = getConversationTitle(modelId);
    const pinned = getPinnedIds().includes(modelId);
    const item = makeEl('div', 'conversation-item');
    item.dataset.conversationId = modelId;
    if (typeof currentModel !== 'undefined' && currentModel && currentModel.id === modelId) {
        item.classList.add('active-conversation');
    }

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'conv-open';
    openBtn.setAttribute('aria-label', `Open chat: ${title}`);
    const copy = makeEl('span', 'conv-copy');
    copy.append(
        makeEl('span', 'conv-title', title),
        makeEl('span', 'conv-meta', `${model ? model.name : 'Model'} · ${formatWhen(getConversationTimestamp(modelId))}`)
    );
    openBtn.appendChild(copy);
    openBtn.addEventListener('click', () => openConversation(modelId));

    const actions = makeEl('div', 'conv-actions');

    const renameBtn = makeEl('button', 'conv-action-btn');
    renameBtn.type = 'button';
    renameBtn.title = 'Rename conversation';
    renameBtn.setAttribute('aria-label', `Rename ${title}`);
    renameBtn.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i>';
    renameBtn.addEventListener('click', () => renameConversation(modelId));

    const pinBtn = makeEl('button', 'conv-action-btn' + (pinned ? ' is-pinned' : ''));
    pinBtn.type = 'button';
    pinBtn.title = pinned ? 'Unpin conversation' : 'Pin conversation';
    pinBtn.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${title}`);
    pinBtn.innerHTML = `<i class="fas ${pinned ? 'fa-thumbtack' : 'fa-thumbtack'}" aria-hidden="true"></i>`;
    pinBtn.addEventListener('click', () => {
        const ids = getPinnedIds();
        const index = ids.indexOf(modelId);
        if (index >= 0) ids.splice(index, 1);
        else ids.push(modelId);
        savePinnedIds(ids);
        renderFolderTree();
    });

    const moveBtn = makeEl('button', 'conv-action-btn');
    moveBtn.type = 'button';
    moveBtn.title = 'Move to folder';
    moveBtn.setAttribute('aria-label', `Move ${title} to a folder`);
    moveBtn.innerHTML = '<i class="fas fa-folder-tree" aria-hidden="true"></i>';
    moveBtn.addEventListener('click', () => openAssignFolderModal(modelId));

    const deleteBtn = makeEl('button', 'conv-action-btn delete');
    deleteBtn.type = 'button';
    deleteBtn.title = 'Delete conversation';
    deleteBtn.setAttribute('aria-label', `Delete ${title}`);
    deleteBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';
    deleteBtn.addEventListener('click', () => deleteConversationWithConfirm(modelId));

    actions.append(renameBtn, pinBtn, moveBtn, deleteBtn);
    item.append(openBtn, actions);
    return item;
}

function renderFavorites(term, valid) {
    const section = byId('favorites-section');
    if (!section) return;
    section.replaceChildren();

    const ids = getPinnedIds()
        .filter(id => valid.has(id) && conversationMatchesFilter(id, term))
        .sort((a, b) => getConversationTimestamp(b) - getConversationTimestamp(a));

    if (!ids.length) return;

    const header = makeEl('div', 'favorites-header');
    const star = makeEl('i', 'fas fa-star');
    star.setAttribute('aria-hidden', 'true');
    header.append(star, makeEl('span', '', 'Pinned'));
    section.appendChild(header);

    ids.forEach(modelId => {
        const title = getConversationTitle(modelId);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'favorite-item';
        button.dataset.conversationId = modelId;
        button.setAttribute('aria-label', `Open pinned chat: ${title}`);
        if (typeof currentModel !== 'undefined' && currentModel && currentModel.id === modelId) {
            button.classList.add('active-conversation');
        }
        const icon = makeEl('i', 'fas fa-star favorite-star');
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, makeEl('span', 'favorite-title', title));
        button.addEventListener('click', () => openConversation(modelId));
        section.appendChild(button);
    });
}

function openConversation(modelId) {
    const model = typeof getModelById === 'function' ? getModelById(modelId) : null;
    if (!model) {
        showToast('This conversation is not available.', 'error');
        return;
    }
    if (typeof loadChatWithSelectedModel === 'function') {
        loadChatWithSelectedModel(model);
        closeSidebar();
    }
}

async function renameConversation(modelId) {
    const value = await promptAction({
        title: 'Rename conversation',
        subtitle: 'Only the label changes — messages stay the same.',
        label: 'Conversation name',
        value: getConversationTitle(modelId),
        icon: 'fa-pen',
        maxLength: 60
    });
    if (!value) return;

    const titles = readJSON('conversation_titles', {});
    const safeTitles = titles && typeof titles === 'object' && !Array.isArray(titles) ? titles : {};
    safeTitles[modelId] = value;
    writeJSON('conversation_titles', safeTitles);
    if (typeof updateConversationHistory === 'function') updateConversationHistory();
    showToast('Conversation renamed.', 'success');
}

function openAssignFolderModal(modelId) {
    const folders = window.conversationFolders || [];
    pendingAssign = { conversationId: modelId };
    const title = getConversationTitle(modelId);
    const subtitle = byId('assign-folder-subtitle');
    if (subtitle) subtitle.textContent = `Choose where "${title}" lives.`;

    const currentFolder = getFolderForConversation(modelId);
    const options = byId('folder-options');
    if (!options) return;
    options.replaceChildren();

    folders.forEach(folder => {
        const label = document.createElement('label');
        label.className = 'folder-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'assign-folder';
        radio.value = folder.id;
        radio.checked = folder.id === (currentFolder ? currentFolder.id : DEFAULT_FOLDER_ID);
        const icon = makeEl('i', `fas ${folder.isDefault ? 'fa-inbox' : 'fa-folder'}`);
        icon.setAttribute('aria-hidden', 'true');
        label.append(radio, icon, makeEl('span', '', folder.name));
        options.appendChild(label);
    });

    openModal('assign-folder-modal');
}

function confirmAssignFolder() {
    if (!pendingAssign) return;
    const selected = document.querySelector('#folder-options input[name="assign-folder"]:checked');
    if (!selected) {
        showToast('Choose a folder first.', 'error');
        return;
    }

    const folders = window.conversationFolders || [];
    const conversationId = pendingAssign.conversationId;
    folders.forEach(folder => {
        folder.conversations = folder.conversations.filter(id => id !== conversationId);
    });

    const target = folders.find(folder => folder.id === selected.value);
    if (!target) return;
    target.conversations.push(conversationId);
    target.collapsed = false;
    pendingAssign = null;
    saveFolders();
    closeModal('assign-folder-modal');
    renderFolderTree();
    showToast(`Moved to ${target.name}.`, 'success');
}

async function deleteConversationWithConfirm(modelId) {
    const confirmed = await confirmAction({
        title: 'Delete this conversation?',
        message: `"${getConversationTitle(modelId)}" will be permanently removed from this browser.`,
        confirmLabel: 'Delete',
        danger: true
    });
    if (!confirmed) return;
    deleteConversations([modelId]);
    showToast('Conversation deleted.', 'success');
}

function deleteConversations(ids) {
    const targets = Array.from(new Set(ids.filter(id => typeof id === 'string')));
    if (!targets.length) return;

    const targetSet = new Set(targets);
    const deletingCurrent = typeof currentModel !== 'undefined' && currentModel && targetSet.has(currentModel.id);

    targets.forEach(id => {
        try {
            localStorage.removeItem(`chat_${id}`);
            localStorage.removeItem(`draft_${id}`);
        } catch (error) { /* storage may be unavailable */ }
    });

    const titles = readJSON('conversation_titles', {});
    if (titles && typeof titles === 'object' && !Array.isArray(titles)) {
        targets.forEach(id => { delete titles[id]; });
        writeJSON('conversation_titles', titles);
    }

    savePinnedIds(getPinnedIds().filter(id => !targetSet.has(id)));

    (window.conversationFolders || []).forEach(folder => {
        folder.conversations = (folder.conversations || []).filter(id => !targetSet.has(id));
    });
    saveFolders();

    if (deletingCurrent && typeof backToModelSelection === 'function') {
        backToModelSelection();
    }
    if (typeof updateConversationHistory === 'function') updateConversationHistory();
    updateKeyStatus();
}

async function createFolder() {
    const name = await promptAction({
        title: 'New folder',
        subtitle: 'Group related conversations together.',
        label: 'Folder name',
        placeholder: 'e.g. Research, Writing, Work',
        icon: 'fa-folder-plus',
        maxLength: 40,
        validate: value => folderNameError(value, null)
    });
    if (!name) return;

    window.conversationFolders = window.conversationFolders || [];
    window.conversationFolders.push({
        id: `folder_${Date.now().toString(36)}`,
        name,
        isDefault: false,
        collapsed: false,
        conversations: []
    });
    saveFolders();
    renderFolderTree();
    showToast('Folder created.', 'success');
}

function folderNameError(name, excludeId) {
    if (name.length > 40) return 'Keep folder names under 40 characters.';
    const lower = name.toLowerCase();
    const duplicate = (window.conversationFolders || []).some(folder =>
        folder.id !== excludeId && folder.name.toLowerCase() === lower
    );
    return duplicate ? 'A folder with this name already exists.' : '';
}

/* ---------- API keys ---------- */

function generateKeyId() {
    return `key_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferProviderFromKey(key) {
    if (/^AIza/.test(key)) return 'gemini';
    if (/^hf_/i.test(key)) return 'huggingface';
    if (/^xai-/i.test(key)) return 'grok';
    return 'openrouter';
}

function getProviderLabel(provider) {
    try {
        return getProviderMeta(provider).name;
    } catch (error) {
        return provider;
    }
}

function loadStoredKeys() {
    const stored = readJSON('stored_api_keys', []);
    let changed = false;
    const seen = new Set();

    const keys = (Array.isArray(stored) ? stored : [])
        .filter(item => item && typeof item.key === 'string' && item.key.trim())
        .map(item => {
            const key = { ...item, key: item.key.trim() };
            if (!key.provider || !PROVIDER_KEY_STORAGE[key.provider]) {
                key.provider = inferProviderFromKey(key.key);
                changed = true;
            }
            if (!key.id || seen.has(key.id)) {
                key.id = generateKeyId();
                changed = true;
            }
            seen.add(key.id);
            if (!key.name) {
                key.name = `${getProviderLabel(key.provider)} key`;
                changed = true;
            }
            if (!key.date) {
                key.date = Date.now();
                changed = true;
            }
            return key;
        });

    if (changed) writeJSON('stored_api_keys', keys);
    return keys;
}

function maskKey(key) {
    const value = String(key || '');
    if (value.length <= 8) return '••••••••';
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function getProviderDefaultKeyId(provider) {
    const keys = loadStoredKeys();
    let storedId = '';
    try { storedId = localStorage.getItem(`provider_default_key_${provider}`) || ''; } catch (error) { storedId = ''; }
    if (storedId && keys.some(key => key.id === storedId)) return storedId;

    let legacy = '';
    try { legacy = localStorage.getItem(PROVIDER_KEY_STORAGE[provider] || '') || ''; } catch (error) { legacy = ''; }
    if (legacy.trim()) {
        const match = keys.find(key => key.provider === provider && key.key === legacy.trim());
        if (match) return match.id;
    }
    return '';
}

function resolveProviderApiKey(provider, modelId = null) {
    try {
        const keys = loadStoredKeys();

        if (modelId) {
            const map = readJSON('model_key_map', {});
            if (map && typeof map === 'object' && typeof map[modelId] === 'string') {
                const assigned = keys.find(key => key.id === map[modelId]);
                if (assigned) return assigned.key;
            }
            const legacyModelKey = localStorage.getItem(`model_specific_key_${modelId}`);
            if (legacyModelKey && legacyModelKey.trim()) return legacyModelKey.trim();
        }

        const defaultId = getProviderDefaultKeyId(provider);
        if (defaultId) {
            const key = keys.find(item => item.id === defaultId);
            if (key) return key.key;
        }

        const legacyProviderKey = localStorage.getItem(PROVIDER_KEY_STORAGE[provider] || '');
        if (legacyProviderKey && legacyProviderKey.trim()) return legacyProviderKey.trim();

        const fallback = keys.find(key => key.provider === provider);
        return fallback ? fallback.key : '';
    } catch (error) {
        return '';
    }
}

window.resolveProviderApiKey = resolveProviderApiKey;

function setProviderDefaultKey(key) {
    try {
        localStorage.setItem(`provider_default_key_${key.provider}`, key.id);
        localStorage.setItem(PROVIDER_KEY_STORAGE[key.provider], key.key);
    } catch (error) {
        showToast('Could not save the default key in this browser.', 'error');
    }
}

function updateKeyStatus() {
    const dot = byId('key-status-dot');
    const text = byId('key-status-text');
    const button = byId('toolbar-api-btn');
    if (!dot || !text) return;

    const keys = loadStoredKeys();
    let ready = keys.length > 0;
    let label = keys.length
        ? `${keys.length} key${keys.length === 1 ? '' : 's'} saved`
        : 'Add API key';

    if (typeof currentModel !== 'undefined' && currentModel) {
        const provider = getProviderMeta(currentModel.provider);
        ready = typeof modelHasKey === 'function' ? modelHasKey(currentModel) : false;
        label = ready ? `${provider.name} key ready` : `${provider.name} key needed`;
    }

    dot.classList.toggle('is-ready', ready);
    text.textContent = label;
    if (button) button.setAttribute('aria-label', `${label}. Open API key settings.`);
}

window.updateKeyStatus = updateKeyStatus;

function refreshKeyState() {
    renderStoredKeys();
    updateKeyStatus();
    if (typeof refreshHomeView === 'function') refreshHomeView();
    if (typeof currentModel !== 'undefined' && currentModel) {
        if (typeof updateKeyWarning === 'function') updateKeyWarning(currentModel);
        if (typeof updateComposerState === 'function') updateComposerState();
    }
}

function renderStoredKeys() {
    const list = byId('stored-keys-list');
    if (!list) return;

    const keys = loadStoredKeys();
    const defaultIds = new Set(
        Object.keys(PROVIDER_KEY_STORAGE).map(provider => getProviderDefaultKeyId(provider)).filter(Boolean)
    );
    const modelKeyMap = readJSON('model_key_map', {});
    const assignments = modelKeyMap && typeof modelKeyMap === 'object' ? Object.values(modelKeyMap) : [];

    const countEl = byId('stored-key-count');
    if (countEl) countEl.textContent = String(keys.length);
    const sidebarCount = byId('api-key-count');
    if (sidebarCount) sidebarCount.textContent = String(keys.length);

    list.replaceChildren();

    if (!keys.length) {
        list.appendChild(emptyState('No API keys saved yet. Add one in the first tab.'));
        return;
    }

    keys
        .slice()
        .sort((a, b) => (b.date || 0) - (a.date || 0))
        .forEach(key => {
            const provider = getProviderMeta(key.provider);
            const active = defaultIds.has(key.id);
            const assignedCount = assignments.filter(id => id === key.id).length;

            const item = makeEl('div', 'stored-key-item' + (active ? ' active-key' : ''));
            const info = makeEl('div', 'key-info');
            const name = makeEl('div', 'key-name');
            const icon = makeEl('i', `fas ${provider.avatar}`);
            icon.setAttribute('aria-hidden', 'true');
            name.append(icon, makeEl('span', '', key.name));
            if (active) name.appendChild(makeEl('span', 'active-key-tag', 'Default'));

            const value = makeEl('div', 'key-value',
                `${maskKey(key.key)} · ${provider.name}${assignedCount ? ` · ${assignedCount} model${assignedCount === 1 ? '' : 's'}` : ''}`
            );
            info.append(name, value);

            const actions = makeEl('div', 'stored-key-actions');
            const applyBtn = makeEl('button', 'key-action-btn', 'Apply');
            applyBtn.type = 'button';
            applyBtn.dataset.keyAction = 'apply';
            applyBtn.dataset.keyId = key.id;
            applyBtn.title = `Apply ${key.name} to specific models`;
            const deleteBtn = makeEl('button', 'key-action-btn delete-key-btn');
            deleteBtn.type = 'button';
            deleteBtn.dataset.keyAction = 'delete';
            deleteBtn.dataset.keyId = key.id;
            deleteBtn.title = 'Delete key';
            deleteBtn.setAttribute('aria-label', `Delete ${key.name}`);
            deleteBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';

            actions.append(applyBtn, deleteBtn);
            item.append(info, actions);
            list.appendChild(item);
        });
}

function switchApiTab(name) {
    document.querySelectorAll('#manage-api-modal .tab[data-tab]').forEach(tab => {
        const active = tab.dataset.tab === name;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
    });

    const addTab = byId('add-key-tab');
    const manageTab = byId('manage-keys-tab');
    if (addTab) {
        addTab.classList.toggle('is-active', name === 'add-key');
        addTab.hidden = name !== 'add-key';
    }
    if (manageTab) {
        manageTab.classList.toggle('is-active', name === 'manage-keys');
        manageTab.hidden = name !== 'manage-keys';
    }
    if (name === 'manage-keys') renderStoredKeys();
}

function updateProviderNote() {
    const select = byId('api-provider-select');
    if (!select) return;
    const provider = select.value;
    const meta = getProviderMeta(provider);
    const note = byId('api-provider-note');
    const noteText = note ? note.querySelector('span') : null;
    if (noteText) noteText.textContent = `Create a key in ${meta.name}.`;

    const link = byId('api-provider-link');
    if (link) {
        link.href = meta.keyUrl;
        const external = makeEl('i', 'fas fa-arrow-up-right-from-square');
        external.setAttribute('aria-hidden', 'true');
        link.replaceChildren(document.createTextNode(`${meta.keyLinkLabel} `), external);
    }

    const nameInput = byId('api-key-name-input');
    if (nameInput) nameInput.placeholder = `e.g. Personal ${meta.name}`;
}

function openApiKeyModal(provider) {
    const select = byId('api-provider-select');
    if (provider && select && Array.from(select.options).some(option => option.value === provider)) {
        select.value = provider;
    }
    updateProviderNote();
    switchApiTab('add-key');
    renderStoredKeys();

    const keyInput = byId('api-key-value');
    if (keyInput) {
        keyInput.value = '';
        keyInput.type = 'password';
        keyInput.classList.remove('input-error');
    }
    const reveal = byId('api-key-reveal');
    if (reveal) {
        reveal.setAttribute('aria-pressed', 'false');
        reveal.setAttribute('aria-label', 'Show API key');
        reveal.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i>';
    }

    openModal('manage-api-modal');
    window.setTimeout(() => byId('api-key-name-input')?.focus(), 60);
}

window.openApiKeyModal = openApiKeyModal;

function saveStoreApiKey() {
    const select = byId('api-provider-select');
    const keyInput = byId('api-key-value');
    const labelInput = byId('api-key-name-input');
    if (!select || !keyInput) return;

    const provider = select.value;
    const rawKey = keyInput.value.trim();

    if (!PROVIDER_KEY_STORAGE[provider]) {
        showToast('Choose a provider first.', 'error');
        return;
    }
    if (!rawKey) {
        keyInput.classList.add('input-error');
        keyInput.focus();
        showToast('Paste an API key first.', 'error');
        return;
    }
    if (rawKey.length < 8) {
        keyInput.classList.add('input-error');
        keyInput.focus();
        showToast('That key looks too short. Check it and try again.', 'error');
        return;
    }

    keyInput.classList.remove('input-error');
    const name = (labelInput?.value || '').trim() || `${getProviderMeta(provider).name} key`;
    const keys = loadStoredKeys();
    const existing = keys.find(key => key.provider === provider && key.key === rawKey);

    let saved;
    if (existing) {
        existing.name = name;
        existing.date = Date.now();
        saved = existing;
    } else {
        saved = { id: generateKeyId(), name, key: rawKey, provider, date: Date.now() };
        keys.push(saved);
    }

    if (!writeJSON('stored_api_keys', keys)) {
        showToast('Could not save the key — browser storage is full.', 'error');
        return;
    }

    setProviderDefaultKey(saved);
    keyInput.value = '';
    if (labelInput) labelInput.value = '';
    keyInput.type = 'password';

    renderStoredKeys();
    switchApiTab('manage-keys');
    refreshKeyState();
    showToast(existing ? 'API key updated.' : 'API key saved.', 'success');
}

async function deleteStoredKey(keyId) {
    const key = loadStoredKeys().find(item => item.id === keyId);
    if (!key) return;

    const confirmed = await confirmAction({
        title: 'Delete this API key?',
        message: `"${key.name}" will be removed from this browser. Chats are not affected.`,
        confirmLabel: 'Delete key',
        danger: true
    });
    if (!confirmed) return;

    const keys = loadStoredKeys().filter(item => item.id !== keyId);
    writeJSON('stored_api_keys', keys);

    try {
        if (localStorage.getItem(`provider_default_key_${key.provider}`) === keyId) {
            localStorage.removeItem(`provider_default_key_${key.provider}`);
            if (localStorage.getItem(PROVIDER_KEY_STORAGE[key.provider]) === key.key) {
                localStorage.removeItem(PROVIDER_KEY_STORAGE[key.provider]);
            }
        }
    } catch (error) { /* storage may be unavailable */ }

    const map = readJSON('model_key_map', {});
    if (map && typeof map === 'object') {
        Object.keys(map).forEach(modelId => {
            if (map[modelId] === keyId) delete map[modelId];
        });
        writeJSON('model_key_map', map);
    }

    Object.keys(localStorage)
        .filter(storageKey => storageKey.startsWith('model_specific_key_'))
        .forEach(storageKey => {
            try {
                if (localStorage.getItem(storageKey) === key.key) localStorage.removeItem(storageKey);
            } catch (error) { /* noop */ }
        });

    renderStoredKeys();
    refreshKeyState();
    showToast('API key deleted.', 'success');
}

function openModelKeyModal(keyId) {
    const key = loadStoredKeys().find(item => item.id === keyId);
    if (!key) {
        showToast('That key is no longer saved.', 'error');
        return;
    }

    const models = availableModels.filter(model => model.provider === key.provider);
    if (!models.length) {
        showToast('No models are available for this provider.', 'error');
        return;
    }

    pendingModelKeyId = keyId;
    const subtitle = byId('model-key-subtitle');
    if (subtitle) subtitle.textContent = `${key.name} · ${getProviderMeta(key.provider).name}`;

    const map = readJSON('model_key_map', {});
    const list = byId('models-selection-list');
    if (!list) return;
    list.replaceChildren();

    models.forEach((model, index) => {
        const item = makeEl('div', 'model-selection-item' + (map && map[model.id] === keyId ? ' active-model' : ''));
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'model-checkbox';
        checkbox.value = model.id;
        checkbox.id = `apply-model-${index}`;
        checkbox.checked = Boolean(map && map[model.id] === keyId);

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        const copy = makeEl('span', 'model-selection-copy');
        copy.append(
            makeEl('strong', '', model.name),
            makeEl('span', '', model.context || getProviderMeta(model.provider).name)
        );
        label.appendChild(copy);
        item.append(checkbox, label);
        list.appendChild(item);
    });

    openModal('model-key-modal');
}

function applyKeyToSelectedModels() {
    const key = loadStoredKeys().find(item => item.id === pendingModelKeyId);
    if (!key) {
        showToast('That key is no longer saved.', 'error');
        return;
    }

    const selected = Array.from(document.querySelectorAll('#models-selection-list .model-checkbox:checked'))
        .map(input => input.value);

    if (!selected.length) {
        showToast('Select at least one model.', 'error');
        return;
    }

    const map = readJSON('model_key_map', {});
    const safeMap = map && typeof map === 'object' && !Array.isArray(map) ? map : {};

    availableModels
        .filter(model => model.provider === key.provider)
        .forEach(model => {
            if (safeMap[model.id] === key.id) delete safeMap[model.id];
        });

    selected.forEach(modelId => { safeMap[modelId] = key.id; });

    if (!writeJSON('model_key_map', safeMap)) {
        showToast('Could not save the model assignments.', 'error');
        return;
    }

    pendingModelKeyId = null;
    closeModal('model-key-modal');
    refreshKeyState();
    showToast(`Key applied to ${selected.length} model${selected.length === 1 ? '' : 's'}.`, 'success');
}

function applyKeyAsDefault() {
    const key = loadStoredKeys().find(item => item.id === pendingModelKeyId);
    if (!key) {
        showToast('That key is no longer saved.', 'error');
        return;
    }

    setProviderDefaultKey(key);
    pendingModelKeyId = null;
    closeModal('model-key-modal');
    refreshKeyState();
    showToast('Provider default updated.', 'success');
}

/* ---------- Search ---------- */

function openSearch() {
    const input = byId('search-input');
    const results = byId('search-results');
    if (input) input.value = '';
    if (results) {
        results.replaceChildren(makeEl('p', 'search-hint', 'Type at least 2 characters to search titles, models, folders, and messages.'));
    }
    openModal('search-modal');
    input?.focus();
}

function makeSnippet(text, term) {
    const clean = String(text || '')
        .replace(/```[\s\S]*?```/g, ' [code] ')
        .replace(/[#>`*_~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!clean) return '';
    const index = clean.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return clean.length > 140 ? `${clean.slice(0, 140).trimEnd()}…` : clean;

    const start = Math.max(0, index - 48);
    const end = Math.min(clean.length, index + term.length + 96);
    return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}

function appendHighlighted(parent, text, term) {
    const source = String(text || '');
    const needle = String(term || '').toLowerCase();
    if (!needle) {
        parent.textContent = source;
        return;
    }

    const lower = source.toLowerCase();
    let index = 0;
    while (index < source.length) {
        const found = lower.indexOf(needle, index);
        if (found === -1) break;
        if (found > index) parent.appendChild(document.createTextNode(source.slice(index, found)));
        parent.appendChild(makeEl('span', 'search-highlight', source.slice(found, found + needle.length)));
        index = found + needle.length;
    }
    if (index < source.length) parent.appendChild(document.createTextNode(source.slice(index)));
}

function runSearch() {
    const input = byId('search-input');
    const results = byId('search-results');
    if (!input || !results) return;

    const term = input.value.trim();
    results.replaceChildren();

    if (term.length < 2) {
        results.appendChild(makeEl('p', 'search-hint', 'Type at least 2 characters to search titles, models, folders, and messages.'));
        return;
    }

    const folderNames = new Map();
    (window.conversationFolders || []).forEach(folder => {
        (folder.conversations || []).forEach(id => folderNames.set(id, folder.name));
    });

    const matches = [];
    getValidConversationIds().forEach(modelId => {
        const model = getModelById(modelId);
        const title = getConversationTitle(modelId);
        const folderName = folderNames.get(modelId) || '';
        const messages = getConversationMessages(modelId);
        let score = 0;
        let preview = '';

        if (title.toLowerCase().includes(term.toLowerCase())) score += 4;
        if (model.name.toLowerCase().includes(term.toLowerCase()) ||
            getProviderMeta(model.provider).name.toLowerCase().includes(term.toLowerCase())) score += 2;
        if (folderName.toLowerCase().includes(term.toLowerCase())) score += 1;

        for (const message of messages) {
            const text = conversationText(message);
            if (text && text.toLowerCase().includes(term.toLowerCase())) {
                score += 3;
                if (!preview) preview = makeSnippet(text, term);
                break;
            }
        }

        if (score === 0) return;
        if (!preview) {
            const lastText = messages.length ? conversationText(messages[messages.length - 1]) : '';
            preview = makeSnippet(lastText, term) || 'No text preview available.';
        }

        matches.push({
            modelId,
            title,
            modelName: model.name,
            folderName,
            preview,
            score,
            timestamp: getConversationTimestamp(modelId)
        });
    });

    matches.sort((a, b) => (b.score - a.score) || (b.timestamp - a.timestamp));

    if (!matches.length) {
        results.appendChild(makeEl('p', 'no-search-results', `No conversations found for "${term}".`));
        return;
    }

    matches.slice(0, 25).forEach(match => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-result-item';

        const title = makeEl('span', 'search-result-title');
        appendHighlighted(title, match.title, term);

        const meta = makeEl('span', 'search-result-meta');
        [match.modelName, match.folderName, formatWhen(match.timestamp)]
            .filter(Boolean)
            .forEach(text => meta.appendChild(makeEl('span', '', text)));

        const preview = makeEl('span', 'search-result-preview');
        appendHighlighted(preview, match.preview, term);

        button.append(title, meta, preview);
        button.addEventListener('click', () => {
            closeModal('search-modal');
            openConversation(match.modelId);
        });
        results.appendChild(button);
    });
}

/* ---------- Export ---------- */

function openExportModal() {
    setExportStatus('');
    openModal('export-modal');
}

function getExportConversations() {
    return getValidConversationIds()
        .map(modelId => {
            const model = getModelById(modelId);
            const folder = getFolderForConversation(modelId);
            const messages = getConversationMessages(modelId).map(message => ({
                role: message.role === 'user' ? 'user' : 'assistant',
                content: conversationText(message),
                ts: message.ts || null
            }));
            return {
                modelId,
                title: getConversationTitle(modelId),
                model: model ? model.name : modelId,
                provider: model ? getProviderMeta(model.provider).name : '',
                folder: folder ? folder.name : '',
                messages
            };
        })
        .filter(conversation => conversation.messages.length > 0)
        .sort((a, b) => {
            const last = conversation => {
                const message = conversation.messages[conversation.messages.length - 1];
                return message && message.ts ? Number(message.ts) : 0;
            };
            return last(b) - last(a);
        });
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function setExportStatus(message, isError = false) {
    const status = byId('export-status');
    if (!status) return;
    status.replaceChildren();
    status.classList.toggle('is-error', Boolean(isError));
    if (!message) return;
    const icon = makeEl('i', `fas ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}`);
    icon.setAttribute('aria-hidden', 'true');
    status.append(icon, document.createTextNode(` ${message}`));
}

function exportChats(format) {
    const conversations = getExportConversations();
    if (!conversations.length) {
        setExportStatus('No saved conversations to export.', true);
        return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const buttons = ['export-json-btn', 'export-markdown-btn', 'export-all-txt-btn']
        .map(id => byId(id))
        .filter(Boolean);
    buttons.forEach(button => { button.disabled = true; });

    let filename;
    let content;
    let type = 'text/plain;charset=utf-8';
    let label;

    if (format === 'json') {
        filename = `ai-chat-export-${stamp}.json`;
        content = JSON.stringify({
            app: 'Alok Systems AI Chat',
            exportedAt: new Date().toISOString(),
            version: 2,
            conversations
        }, null, 2);
        type = 'application/json;charset=utf-8';
        label = 'JSON';
    } else if (format === 'markdown') {
        filename = `ai-chat-export-${stamp}.md`;
        content = conversations.map(conversation => {
            const lines = [
                `# ${conversation.title}`,
                '',
                `_${[conversation.model, conversation.provider, conversation.folder].filter(Boolean).join(' · ')}_`,
                ''
            ];
            conversation.messages.forEach(message => {
                lines.push(`## ${message.role === 'user' ? 'You' : conversation.model}`, '', message.content, '');
            });
            return lines.join('\n').trim();
        }).join('\n\n---\n\n');
        type = 'text/markdown;charset=utf-8';
        label = 'Markdown';
    } else {
        filename = `ai-chat-export-${stamp}.txt`;
        content = conversations.map(conversation => {
            const lines = [
                `=== ${conversation.title} ===`,
                [conversation.model, conversation.provider, conversation.folder].filter(Boolean).join(' · '),
                ''
            ];
            conversation.messages.forEach(message => {
                lines.push(`${message.role === 'user' ? 'You' : conversation.model}: ${message.content}`, '');
            });
            return lines.join('\n').trim();
        }).join('\n\n');
        label = 'text';
    }

    try {
        downloadFile(filename, content, type);
        setExportStatus(`Downloaded ${conversations.length} conversation${conversations.length === 1 ? '' : 's'} as ${label}.`);
    } catch (error) {
        setExportStatus('Could not create the export file in this browser.', true);
    } finally {
        buttons.forEach(button => { button.disabled = false; });
    }
}

/* ---------- Templates ---------- */

function loadTemplates() {
    const stored = readJSON('quick_templates', []);
    if (!Array.isArray(stored)) return [];
    return stored
        .filter(template => template && typeof template.content === 'string' && template.content.trim())
        .map((template, index) => ({
            id: typeof template.id === 'string' && template.id ? template.id : `tpl_${index}`,
            name: String(template.name || 'Template').trim() || 'Template',
            content: template.content.trim()
        }));
}

function renderTemplateList() {
    const list = byId('templates-list');
    if (!list) return;
    const templates = loadTemplates();
    list.replaceChildren();

    if (!templates.length) {
        list.appendChild(emptyState('No templates yet. Save a reusable prompt above.'));
        return;
    }

    templates.forEach(template => {
        const item = makeEl('div', 'template-item');
        const copy = makeEl('div', 'template-copy');
        copy.append(
            makeEl('span', 'template-name', template.name),
            makeEl('span', 'template-preview', template.content.replace(/\s+/g, ' '))
        );

        const actions = makeEl('div', 'template-actions');
        const useBtn = makeEl('button', 'template-action-btn', 'Use');
        useBtn.type = 'button';
        useBtn.dataset.templateAction = 'use';
        useBtn.dataset.templateId = template.id;
        const deleteBtn = makeEl('button', 'template-action-btn delete', 'Delete');
        deleteBtn.type = 'button';
        deleteBtn.dataset.templateAction = 'delete';
        deleteBtn.dataset.templateId = template.id;

        actions.append(useBtn, deleteBtn);
        item.append(copy, actions);
        list.appendChild(item);
    });
}

function openTemplatesModal() {
    renderTemplateList();
    openModal('templates-modal');
}

window.openTemplatesModal = openTemplatesModal;

function insertTemplate(template) {
    const input = byId('message-input');
    const current = input ? input.value.trim() : '';
    const hasSlot = template.content.includes('{input}');
    const text = hasSlot
        ? template.content.replace(/\{input\}/g, current || '[your text here]')
        : template.content;

    if (hasSlot && input) {
        input.value = '';
        if (typeof window.insertComposerText === 'function') {
            window.insertComposerText(text);
        } else {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else if (typeof window.insertComposerText === 'function') {
        window.insertComposerText(text);
    } else if (input) {
        input.value += (input.value ? ' ' : '') + text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    closeModal('templates-modal');
    input?.focus();
    showToast('Template inserted.', 'success');
}

function saveTemplate() {
    const nameInput = byId('template-name-input');
    const contentInput = byId('template-content-input');
    if (!nameInput || !contentInput) return;

    const name = nameInput.value.trim();
    const content = contentInput.value.trim();
    if (!name || !content) {
        showToast('Add a name and content for the template.', 'error');
        (name ? contentInput : nameInput).focus();
        return;
    }

    const templates = loadTemplates();
    templates.push({ id: `tpl_${Date.now().toString(36)}`, name, content });
    if (!writeJSON('quick_templates', templates)) {
        showToast('Could not save the template — browser storage is full.', 'error');
        return;
    }

    nameInput.value = '';
    contentInput.value = '';
    renderTemplateList();
    showToast('Template saved.', 'success');
}

async function deleteTemplate(templateId) {
    const templates = loadTemplates();
    const template = templates.find(item => item.id === templateId);
    if (!template) return;

    const confirmed = await confirmAction({
        title: 'Delete this template?',
        message: `"${template.name}" will be removed from this browser.`,
        confirmLabel: 'Delete',
        danger: true
    });
    if (!confirmed) return;

    writeJSON('quick_templates', templates.filter(item => item.id !== templateId));
    renderTemplateList();
    showToast('Template deleted.', 'success');
}

/* ---------- System prompt ---------- */

function getSystemPrompt(modelId) {
    if (!modelId) return '';
    try {
        return localStorage.getItem(`system_prompt_${modelId}`) || '';
    } catch (error) {
        return '';
    }
}

window.getSystemPrompt = getSystemPrompt;

function updatePromptIndicator() {
    const dot = byId('prompt-dot');
    if (!dot) return;
    const active = typeof currentModel !== 'undefined' && currentModel && Boolean(getSystemPrompt(currentModel.id));
    dot.hidden = !active;
}

function openSystemPromptModal() {
    if (typeof currentModel === 'undefined' || !currentModel) {
        showToast('Open a chat first.', 'info');
        return;
    }

    const textarea = byId('system-prompt-input');
    if (!textarea) return;
    textarea.value = getSystemPrompt(currentModel.id);
    openModal('system-prompt-modal');
    window.setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 60);
}

function saveSystemPrompt() {
    if (typeof currentModel === 'undefined' || !currentModel) return;
    const textarea = byId('system-prompt-input');
    if (!textarea) return;
    const value = textarea.value.trim();

    try {
        if (value) localStorage.setItem(`system_prompt_${currentModel.id}`, value);
        else localStorage.removeItem(`system_prompt_${currentModel.id}`);
    } catch (error) {
        showToast('Could not save the prompt in this browser.', 'error');
        return;
    }

    updatePromptIndicator();
    closeModal('system-prompt-modal');
    showToast(value ? 'System prompt saved.' : 'System prompt cleared.', 'success');
}

function clearSystemPrompt() {
    if (typeof currentModel === 'undefined' || !currentModel) return;
    const textarea = byId('system-prompt-input');
    if (textarea) textarea.value = '';
    try { localStorage.removeItem(`system_prompt_${currentModel.id}`); } catch (error) { /* noop */ }
    updatePromptIndicator();
    showToast('System prompt cleared.', 'success');
    textarea?.focus();
}

/* ---------- Token usage ---------- */

function normalizeUsageStats(raw) {
    const stats = raw && typeof raw === 'object' ? raw : {};
    const perModel = stats.perModel && typeof stats.perModel === 'object' && !Array.isArray(stats.perModel)
        ? stats.perModel
        : {};
    const result = { totalMessages: Number(stats.totalMessages) || 0, totalTokens: Number(stats.totalTokens) || 0, perModel: {} };

    Object.keys(perModel).forEach(modelId => {
        const usage = perModel[modelId];
        if (!usage || typeof usage !== 'object') return;
        result.perModel[modelId] = {
            messages: Number(usage.messages) || 0,
            tokens: Number(usage.tokens) || 0
        };
    });

    return result;
}

function computeUsageFromChats() {
    const stats = { totalMessages: 0, totalTokens: 0, perModel: {} };

    getValidConversationIds().forEach(modelId => {
        getConversationMessages(modelId).forEach(message => {
            const tokens = estimateTokens(conversationText(message));
            stats.totalMessages += 1;
            stats.totalTokens += tokens;
            if (!stats.perModel[modelId]) stats.perModel[modelId] = { messages: 0, tokens: 0 };
            stats.perModel[modelId].messages += 1;
            stats.perModel[modelId].tokens += tokens;
        });
    });

    return stats;
}

function ensureUsageStats() {
    try {
        if (localStorage.getItem('token_usage_stats')) return;
    } catch (error) {
        return;
    }
    writeJSON('token_usage_stats', computeUsageFromChats());
}

function loadUsageStats() {
    return normalizeUsageStats(readJSON('token_usage_stats', {}));
}

function trackTokenUsage(modelId, prompt, response) {
    if (!modelId) return;
    const stats = loadUsageStats();
    const tokens = estimateTokens(prompt) + estimateTokens(response);

    stats.totalMessages += 2;
    stats.totalTokens += tokens;
    if (!stats.perModel[modelId]) stats.perModel[modelId] = { messages: 0, tokens: 0 };
    stats.perModel[modelId].messages += 2;
    stats.perModel[modelId].tokens += tokens;

    writeJSON('token_usage_stats', stats);
}

window.trackTokenUsage = trackTokenUsage;

function renderUsageStats() {
    const stats = loadUsageStats();
    const messagesEl = byId('total-messages');
    const tokensEl = byId('total-tokens');
    const sessionsEl = byId('sessions-count');
    if (messagesEl) messagesEl.textContent = formatNumber(stats.totalMessages);
    if (tokensEl) tokensEl.textContent = formatNumber(stats.totalTokens);
    if (sessionsEl) sessionsEl.textContent = formatNumber(getValidConversationIds().length);

    const list = byId('model-usage-list');
    if (!list) return;
    list.replaceChildren();

    const entries = Object.entries(stats.perModel)
        .filter(([, usage]) => usage && usage.messages > 0)
        .sort((a, b) => b[1].tokens - a[1].tokens);

    if (!entries.length) {
        list.appendChild(emptyState('No usage recorded yet. Send a message to start tracking.'));
        return;
    }

    entries.forEach(([modelId, usage]) => {
        const model = typeof getModelById === 'function' ? getModelById(modelId) : null;
        const item = makeEl('div', 'model-usage-item');
        const name = makeEl('span', 'model-usage-name', model ? model.name : modelId);
        const numbers = makeEl('span', 'model-usage-stats');
        numbers.append(
            makeEl('span', '', `${formatNumber(usage.messages)} msgs`),
            makeEl('span', '', `~${formatNumber(usage.tokens)} tokens`)
        );
        item.append(name, numbers);
        list.appendChild(item);
    });
}

function openTokenUsageModal() {
    renderUsageStats();
    openModal('token-usage-modal');
}

async function resetUsageStats() {
    const confirmed = await confirmAction({
        title: 'Reset usage stats?',
        message: 'The token estimate will start again from zero. Conversations are not affected.',
        confirmLabel: 'Reset stats',
        danger: true
    });
    if (!confirmed) return;

    writeJSON('token_usage_stats', { totalMessages: 0, totalTokens: 0, perModel: {} });
    renderUsageStats();
    showToast('Usage stats reset.', 'success');
}

/* ---------- Delete chats ---------- */

function openDeleteChatsModal() {
    renderDeletionList();
    openModal('delete-chats-modal');
}

function renderDeletionList() {
    const list = byId('deletion-chat-list');
    if (!list) return;
    list.replaceChildren();

    const ids = getValidConversationIds()
        .sort((a, b) => getConversationTimestamp(b) - getConversationTimestamp(a));
    const deleteAllBtn = byId('delete-all-chats');

    if (!ids.length) {
        list.appendChild(emptyState('No saved conversations to delete.'));
        if (deleteAllBtn) deleteAllBtn.disabled = true;
        updateDeleteSelectionState();
        return;
    }
    if (deleteAllBtn) deleteAllBtn.disabled = false;

    ids.forEach((modelId, index) => {
        const model = getModelById(modelId);
        const row = makeEl('div', 'chat-deletion-item' +
            (typeof currentModel !== 'undefined' && currentModel && currentModel.id === modelId ? ' current-chat' : ''));
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'chat-checkbox';
        checkbox.value = modelId;
        checkbox.id = `delete-chat-${index}`;
        checkbox.addEventListener('change', updateDeleteSelectionState);

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        const name = makeEl('span', 'chat-model-name');
        const icon = makeEl('i', `fas ${model ? model.avatar : 'fa-robot'}`);
        icon.setAttribute('aria-hidden', 'true');
        name.append(icon, makeEl('span', '', getConversationTitle(modelId)));
        label.append(
            name,
            makeEl('span', 'chat-last-message',
                `${model ? model.name : 'Model'} · ${getConversationMessageCount(modelId)} messages · ${formatWhen(getConversationTimestamp(modelId))}`)
        );

        row.append(checkbox, label);
        list.appendChild(row);
    });

    updateDeleteSelectionState();
}

function updateDeleteSelectionState() {
    const selected = document.querySelectorAll('#deletion-chat-list .chat-checkbox:checked').length;
    const button = byId('delete-selected-chats');
    if (!button) return;
    button.disabled = selected === 0;
    button.textContent = selected ? `Delete selected (${selected})` : 'Delete selected';
}

async function deleteSelectedChats() {
    const selected = Array.from(document.querySelectorAll('#deletion-chat-list .chat-checkbox:checked'))
        .map(input => input.value);
    if (!selected.length) {
        showToast('Select at least one conversation.', 'error');
        return;
    }

    const confirmed = await confirmAction({
        title: `Delete ${selected.length} conversation${selected.length === 1 ? '' : 's'}?`,
        message: 'The selected chats will be permanently removed from this browser.',
        confirmLabel: 'Delete',
        danger: true
    });
    if (!confirmed) return;

    closeModal('delete-chats-modal');
    deleteConversations(selected);
    showToast('Conversations deleted.', 'success');
}

async function deleteAllChats() {
    const ids = getValidConversationIds();
    if (!ids.length) return;

    const confirmed = await confirmAction({
        title: 'Delete every conversation?',
        message: `${ids.length} saved chat${ids.length === 1 ? '' : 's'} will be permanently removed. API keys, folders, and templates stay.`,
        confirmLabel: 'Delete all',
        danger: true
    });
    if (!confirmed) return;

    closeModal('delete-chats-modal');
    deleteConversations(ids);
    showToast('All conversations deleted.', 'success');
}

/* ---------- Profile ---------- */

function loadProfile() {
    const profile = readJSON('user_profile', {});
    return {
        name: profile && typeof profile.name === 'string' ? profile.name.trim() : '',
        email: profile && typeof profile.email === 'string' ? profile.email.trim() : ''
    };
}

function updateProfileRow() {
    const profile = loadProfile();
    const nameEl = byId('profile-name');
    const emailEl = byId('profile-email');
    const avatar = byId('profile-avatar');

    if (nameEl) nameEl.textContent = profile.name || 'Your profile';
    if (emailEl) emailEl.textContent = profile.email || 'Saved on this device';
    if (avatar) {
        const initial = (profile.name || 'U').trim().charAt(0).toUpperCase() || 'U';
        avatar.textContent = initial;
    }
}

function openProfileModal() {
    const profile = loadProfile();
    const nameInput = byId('profile-name-input');
    const emailInput = byId('profile-email-input');
    if (nameInput) nameInput.value = profile.name;
    if (emailInput) emailInput.value = profile.email;
    openModal('profile-modal');
    window.setTimeout(() => nameInput?.focus(), 60);
}

function saveProfile() {
    const nameInput = byId('profile-name-input');
    const emailInput = byId('profile-email-input');
    if (!nameInput || !emailInput) return;

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Enter a valid email address or leave it empty.', 'error');
        emailInput.focus();
        return;
    }

    writeJSON('user_profile', { name, email });
    updateProfileRow();
    closeModal('profile-modal');
    showToast('Profile saved.', 'success');
}

/* ---------- Keyboard shortcuts ---------- */

function initGlobalKeyboard() {
    document.addEventListener('keydown', event => {
        const topId = modalStack[modalStack.length - 1];

        if (topId) {
            const modal = byId(topId);
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal(topId);
                return;
            }
            if (event.key === 'Tab' && modal) trapFocus(event, modal);
            return;
        }

        const modifier = event.ctrlKey || event.metaKey;
        if (modifier && !event.altKey && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            openSearch();
            return;
        }
        if (modifier && !event.altKey && event.key.toLowerCase() === 'b') {
            event.preventDefault();
            toggleSidebar();
            return;
        }
        if (modifier && !event.altKey && event.key === '/') {
            event.preventDefault();
            openModal('shortcuts-modal');
            return;
        }
        if (event.key === 'Escape') {
            const emojiPicker = byId('emoji-picker');
            if (emojiPicker && !emojiPicker.hidden) return;

            const chatScreen = byId('chat-screen');
            if (chatScreen && !chatScreen.hidden) {
                const active = document.activeElement;
                if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
                    active.blur();
                    return;
                }
                if (typeof backToModelSelection === 'function') backToModelSelection();
                renderFolderTree();
                return;
            }
            closeSidebar();
        }
    });
}

/* ---------- Wiring ---------- */

function initSidebarControls() {
    byId('menu-btn')?.addEventListener('click', toggleSidebar);
    byId('close-sidebar')?.addEventListener('click', closeSidebar);
    byId('sidebar-scrim')?.addEventListener('click', closeSidebar);

    byId('new-chat-btn')?.addEventListener('click', () => {
        if (typeof backToModelSelection === 'function') backToModelSelection();
        else closeSidebar();
        renderFolderTree();
    });

    byId('new-folder-btn')?.addEventListener('click', createFolder);
    byId('conversation-filter')?.addEventListener('input', () => {
        window.clearTimeout(filterTimer);
        filterTimer = window.setTimeout(renderFolderTree, 120);
    });

    byId('confirm-assign-btn')?.addEventListener('click', confirmAssignFolder);
}

function initWorkspaceButtons() {
    byId('home-manage-api')?.addEventListener('click', () => openApiKeyModal());
    byId('toolbar-api-btn')?.addEventListener('click', () => openApiKeyModal());
    byId('manage-api-btn')?.addEventListener('click', () => openApiKeyModal());
    byId('token-usage-btn')?.addEventListener('click', openTokenUsageModal);
    byId('search-conversations-btn')?.addEventListener('click', openSearch);
    byId('export-conversations-btn')?.addEventListener('click', openExportModal);
    byId('shortcuts-help-btn')?.addEventListener('click', () => openModal('shortcuts-modal'));
    byId('about-btn')?.addEventListener('click', () => openModal('about-modal'));
    byId('clear-chats-btn')?.addEventListener('click', openDeleteChatsModal);
    byId('profile-btn')?.addEventListener('click', openProfileModal);
    byId('save-profile')?.addEventListener('click', saveProfile);
    byId('system-prompt-btn')?.addEventListener('click', openSystemPromptModal);
}

function initApiManager() {
    document.querySelectorAll('#manage-api-modal .tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => switchApiTab(tab.dataset.tab));
    });

    byId('api-provider-select')?.addEventListener('change', updateProviderNote);
    byId('save-store-api-key')?.addEventListener('click', saveStoreApiKey);

    const keyInput = byId('api-key-value');
    keyInput?.addEventListener('input', () => keyInput.classList.remove('input-error'));
    keyInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveStoreApiKey();
        }
    });
    byId('api-key-name-input')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            keyInput?.focus();
        }
    });

    byId('api-key-reveal')?.addEventListener('click', () => {
        if (!keyInput) return;
        const reveal = byId('api-key-reveal');
        const show = keyInput.type === 'password';
        keyInput.type = show ? 'text' : 'password';
        if (reveal) {
            reveal.setAttribute('aria-pressed', String(show));
            reveal.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
            reveal.innerHTML = `<i class="fas ${show ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
        }
        keyInput.focus();
    });

    byId('stored-keys-list')?.addEventListener('click', event => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest('button[data-key-action]');
        if (!button) return;
        if (button.dataset.keyAction === 'apply') openModelKeyModal(button.dataset.keyId);
        else if (button.dataset.keyAction === 'delete') deleteStoredKey(button.dataset.keyId);
    });

    byId('select-all-models')?.addEventListener('click', () => {
        document.querySelectorAll('#models-selection-list .model-checkbox').forEach(input => { input.checked = true; });
    });
    byId('deselect-all-models')?.addEventListener('click', () => {
        document.querySelectorAll('#models-selection-list .model-checkbox').forEach(input => { input.checked = false; });
    });
    byId('apply-to-selected-models')?.addEventListener('click', applyKeyToSelectedModels);
    byId('apply-to-default')?.addEventListener('click', applyKeyAsDefault);
}

function initSearchUi() {
    const input = byId('search-input');
    input?.addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(runSearch, 140);
    });
    input?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        const first = document.querySelector('#search-results .search-result-item');
        if (first) {
            event.preventDefault();
            first.click();
        }
    });
}

function initTemplatesUi() {
    byId('save-template-btn')?.addEventListener('click', saveTemplate);
    byId('templates-list')?.addEventListener('click', event => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest('button[data-template-action]');
        if (!button) return;
        const template = loadTemplates().find(item => item.id === button.dataset.templateId);
        if (!template) return;
        if (button.dataset.templateAction === 'use') insertTemplate(template);
        else if (button.dataset.templateAction === 'delete') deleteTemplate(template.id);
    });
}

function initSystemPromptUi() {
    byId('save-prompt-btn')?.addEventListener('click', saveSystemPrompt);
    byId('clear-prompt-btn')?.addEventListener('click', clearSystemPrompt);
    document.querySelectorAll('#system-prompt-modal .preset-btn').forEach(button => {
        button.addEventListener('click', () => {
            const textarea = byId('system-prompt-input');
            if (!textarea) return;
            textarea.value = SYSTEM_PRESETS[button.dataset.preset] || '';
            textarea.focus();
        });
    });
}

function initTokenUsageUi() {
    byId('reset-stats-btn')?.addEventListener('click', resetUsageStats);
}

function initExportUi() {
    byId('export-json-btn')?.addEventListener('click', () => exportChats('json'));
    byId('export-markdown-btn')?.addEventListener('click', () => exportChats('markdown'));
    byId('export-all-txt-btn')?.addEventListener('click', () => exportChats('text'));
}

function initDeleteChatsUi() {
    byId('delete-selected-chats')?.addEventListener('click', deleteSelectedChats);
    byId('delete-all-chats')?.addEventListener('click', deleteAllChats);
}

document.addEventListener('DOMContentLoaded', () => {
    loadFolders();
    initModalSystem();
    initSidebarControls();
    initWorkspaceButtons();
    initApiManager();
    initSearchUi();
    initTemplatesUi();
    initSystemPromptUi();
    initTokenUsageUi();
    initExportUi();
    initDeleteChatsUi();
    initGlobalKeyboard();

    ensureUsageStats();
    updateProfileRow();
    renderStoredKeys();
    updateKeyStatus();

    if (typeof updateConversationHistory === 'function') updateConversationHistory();
    if (typeof initializeModelsGrid === 'function') initializeModelsGrid();
    if (typeof initModelNavigation === 'function') initModelNavigation();
    if (typeof renderRecentConversations === 'function') renderRecentConversations();
    if (typeof updatePromptIndicator === 'function') updatePromptIndicator();

    applySidebarPreference();
});
