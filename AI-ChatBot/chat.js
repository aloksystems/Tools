// Chat engine: message rendering, streaming requests, and message actions.

let currentConversation = [];
let isGenerating = false;
let abortController = null;
let editingIndex = -1;
let draftTimer = null;
let autoscroll = true;

const MODEL_TIMEOUT_MS = 120000;
const MAX_CONTEXT_MESSAGES = 24;

/* ---------- Init ---------- */

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const messageInput = document.getElementById('message-input');
    const backBtn = document.getElementById('back-btn');
    const closeChat = document.getElementById('close-chat');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const chatMessages = document.getElementById('chat-messages');

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (stopBtn) stopBtn.addEventListener('click', () => stopGeneration());

    if (backBtn) backBtn.addEventListener('click', backToModelSelection);
    if (closeChat) closeChat.addEventListener('click', backToModelSelection);
    if (clearChatBtn) clearChatBtn.addEventListener('click', clearCurrentChat);

    if (messageInput) {
        messageInput.addEventListener('input', () => {
            autoResizeInput();
            updateComposerState();
            scheduleDraftSave();
        });

        messageInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                sendMessage();
            }
        });
    }

    if (chatMessages) {
        chatMessages.addEventListener('scroll', () => {
            const distance = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
            autoscroll = distance < 120;
            const jumpBtn = document.getElementById('scroll-latest-btn');
            if (jumpBtn) jumpBtn.hidden = autoscroll || chatMessages.scrollHeight <= chatMessages.clientHeight;
        }, { passive: true });
    }

    const jumpBtn = document.getElementById('scroll-latest-btn');
    if (jumpBtn) jumpBtn.addEventListener('click', () => {
        autoscroll = true;
        scrollToBottom(true);
        jumpBtn.hidden = true;
    });

    const keyWarningBtn = document.getElementById('key-warning-btn');
    if (keyWarningBtn) keyWarningBtn.addEventListener('click', () => {
        if (currentModel && typeof window.openApiKeyModal === 'function') {
            window.openApiKeyModal(currentModel.provider);
        }
    });

    initQuickActions();
    initEditModal();
    initEmojiPicker();
    initVoiceInput();

    updateComposerState();
});

function sendBtnEl() { return document.getElementById('send-btn'); }

function updateComposerState() {
    const input = document.getElementById('message-input');
    const sendBtn = sendBtnEl();
    const stopBtn = document.getElementById('stop-btn');
    const hint = document.getElementById('composer-hint');
    if (!input || !sendBtn) return;

    const hasText = Boolean(input.value.trim());
    const hasModel = Boolean(currentModel);
    const hasKey = hasModel ? modelHasKey(currentModel) : false;

    sendBtn.hidden = isGenerating;
    sendBtn.disabled = !hasText || !hasModel || !hasKey || isGenerating;
    if (stopBtn) stopBtn.hidden = !isGenerating;

    if (hint) {
        if (!hasModel) hint.textContent = 'Pick a model to start chatting';
        else if (!hasKey) hint.textContent = 'Add an API key to send messages';
        else if (isGenerating) hint.textContent = 'Generating… you can stop at any time';
        else hint.textContent = 'Enter to send · Shift + Enter for a new line';
    }
}

function autoResizeInput() {
    const input = document.getElementById('message-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}

function insertComposerText(text) {
    const input = document.getElementById('message-input');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const caret = start + text.length;
    input.focus();
    input.setSelectionRange(caret, caret);
    autoResizeInput();
    updateComposerState();
    scheduleDraftSave();
}

/* ---------- Drafts ---------- */

function scheduleDraftSave() {
    if (!currentModel) return;
    const input = document.getElementById('message-input');
    if (!input) return;
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
        try {
            if (input.value.trim()) localStorage.setItem(`draft_${currentModel.id}`, input.value);
            else localStorage.removeItem(`draft_${currentModel.id}`);
        } catch (error) { /* storage may be full; drafts are optional */ }
    }, 350);
}

function restoreDraft(modelId) {
    const input = document.getElementById('message-input');
    if (!input) return;
    let draft = '';
    try { draft = localStorage.getItem(`draft_${modelId}`) || ''; } catch (error) { draft = ''; }
    input.value = draft;
    autoResizeInput();
    updateComposerState();
}

function clearDraft(modelId) {
    try { localStorage.removeItem(`draft_${modelId}`); } catch (error) { /* noop */ }
}

/* ---------- Sending ---------- */

async function sendMessage() {
    if (!currentModel || isGenerating) return;

    const input = document.getElementById('message-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    if (!modelHasKey(currentModel)) {
        showToast('Add an API key for this provider before sending.', 'error');
        updateKeyWarning(currentModel);
        if (typeof window.openApiKeyModal === 'function') window.openApiKeyModal(currentModel.provider);
        return;
    }

    currentConversation.push({ role: 'user', content: text, ts: Date.now() });
    saveConversation();

    if (input) {
        input.value = '';
        autoResizeInput();
    }
    clearDraft(currentModel.id);

    autoscroll = true;
    renderChatMessages();
    scrollToBottom(true);
    updateComposerState();

    await generateReply();
}

async function generateReply() {
    if (!currentModel || isGenerating) return;
    if (!modelHasKey(currentModel)) {
        updateKeyWarning(currentModel);
        updateComposerState();
        return;
    }

    removeErrorNotice();
    isGenerating = true;
    abortController = new AbortController();
    updateComposerState();
    showTypingIndicator();

    const contextMessages = currentConversation.slice();
    let assistantIndex = -1;
    let stopped = false;

    try {
        const result = await requestAssistantReply(contextMessages, {
            signal: abortController.signal,
            onDelta: (text) => {
                if (assistantIndex === -1) {
                    hideTypingIndicator();
                    currentConversation.push({ role: 'assistant', content: text, ts: Date.now() });
                    assistantIndex = currentConversation.length - 1;
                    renderChatMessages();
                } else {
                    currentConversation[assistantIndex].content = text;
                    updateMessageContent(assistantIndex, text);
                }
                if (autoscroll) scrollToBottom();
            }
        });

        hideTypingIndicator();

        if (result.type === 'image') {
            const message = { role: 'assistant', content: result.content, image: true, prompt: result.prompt, ts: Date.now() };
            if (assistantIndex === -1) {
                currentConversation.push(message);
                assistantIndex = currentConversation.length - 1;
            } else {
                Object.assign(currentConversation[assistantIndex], message);
            }
            renderChatMessages();
            scrollToBottom(true);
        } else if (assistantIndex !== -1) {
            currentConversation[assistantIndex].content = result.content;
            currentConversation[assistantIndex].ts = currentConversation[assistantIndex].ts || Date.now();
            updateMessageContent(assistantIndex, result.content);
        } else {
            currentConversation.push({ role: 'assistant', content: result.content, ts: Date.now() });
            assistantIndex = currentConversation.length - 1;
            renderChatMessages();
            scrollToBottom(true);
        }

        const lastUser = [...currentConversation].reverse().find(message => message.role === 'user');
        if (typeof window.trackTokenUsage === 'function' && lastUser && !result.type.startsWith('image')) {
            window.trackTokenUsage(currentModel.id, lastUser.content, result.content);
        }
    } catch (error) {
        hideTypingIndicator();
        stopped = error && error.name === 'AbortError';

        if (assistantIndex !== -1) {
            const partial = currentConversation[assistantIndex].content || '';
            if (!partial.trim()) currentConversation.splice(assistantIndex, 1);
            renderChatMessages();
        }

        if (stopped) {
            if (assistantIndex !== -1 && currentConversation[assistantIndex]) {
                showToast('Generation stopped. Partial reply kept.', 'info');
            } else {
                showToast('Generation stopped.', 'info');
            }
        } else {
            renderChatMessages();
            renderErrorNotice(getFriendlyErrorMessage(error));
        }
    } finally {
        isGenerating = false;
        abortController = null;
        saveConversation();
        updateConversationHistory();
        if (typeof window.updateComposerState === 'function') updateComposerState();
        const model = currentModel;
        if (model) updateKeyWarning(model);
    }
}

function stopGeneration(silent = false) {
    if (!isGenerating || !abortController) return;
    abortController.abort();
    if (!silent) showToast('Stopping…', 'info');
}

function saveConversation() {
    if (!currentModel) return;
    try {
        localStorage.setItem(`chat_${currentModel.id}`, JSON.stringify(currentConversation));
    } catch (error) {
        showToast('Could not save this chat — browser storage is full.', 'error');
    }
}

/* ---------- Rendering ---------- */

function normalizeRole(role) {
    return role === 'user' ? 'user' : 'ai';
}

function renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    hideTypingIndicator();
    container.replaceChildren();

    if (currentConversation.length === 0) {
        renderEmptyState(container);
        return;
    }

    currentConversation.forEach((message, index) => {
        container.appendChild(buildMessageElement(message, index));
    });

    if (autoscroll) scrollToBottom(true);
}

function buildMessageElement(message, index) {
    const role = normalizeRole(message.role);
    const article = document.createElement('article');
    article.className = `message ${role}`;
    article.dataset.index = String(index);

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = `<i class="fas ${role === 'ai' ? (currentModel ? currentModel.avatar : 'fa-robot') : 'fa-user'}"></i>`;

    const body = document.createElement('div');
    body.className = 'message-body';

    const head = document.createElement('div');
    head.className = 'message-head';
    const author = document.createElement('strong');
    author.textContent = role === 'ai' ? (currentModel ? currentModel.name : 'Assistant') : 'You';
    head.appendChild(author);
    if (message.ts) {
        const time = document.createElement('span');
        time.textContent = formatClock(message.ts);
        head.appendChild(time);
    }

    const content = document.createElement('div');
    content.className = 'message-content';
    fillMessageContent(content, message);

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.appendChild(makeAction('Copy', 'fa-copy', () => copyMessage(message)));
    if (role === 'user') {
        actions.appendChild(makeAction('Edit', 'fa-pen', () => openEditModal(index)));
    } else {
        actions.appendChild(makeAction('Regenerate', 'fa-rotate-right', () => regenerateMessage(index)));
    }
    actions.appendChild(makeAction('Delete', 'fa-trash', () => deleteMessage(index), true));

    body.append(head, content, actions);
    article.append(avatar, body);
    return article;
}

function makeAction(label, icon, handler, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-action-btn' + (danger ? ' delete' : '');
    button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i> ${label}`;
    button.addEventListener('click', handler);
    return button;
}

function fillMessageContent(container, message) {
    container.replaceChildren();

    if (message.image || (typeof message.content === 'string' && message.content.startsWith('data:image'))) {
        container.appendChild(buildGeneratedImage(message.content, message.prompt));
        return;
    }

    if (typeof message.content === 'string' && message.content.startsWith('<div class="generated-image">')) {
        const parsed = parseLegacyImageMessage(message.content);
        if (parsed) {
            container.appendChild(buildGeneratedImage(parsed.src, parsed.prompt));
            return;
        }
    }

    if (normalizeRole(message.role) === 'ai') {
        const wrap = document.createElement('div');
        wrap.className = 'md';
        wrap.appendChild(renderMarkdown(message.content || ''));
        container.appendChild(wrap);
    } else {
        container.textContent = message.content || '';
    }
}

function buildGeneratedImage(src, prompt) {
    const wrap = document.createElement('div');
    wrap.className = 'generated-image';
    const caption = document.createElement('p');
    caption.textContent = prompt ? `Generated image · ${prompt}` : 'Generated image';
    const image = document.createElement('img');
    image.src = src;
    image.alt = prompt ? `Generated image for: ${prompt}` : 'Generated image';
    image.loading = 'lazy';
    const download = document.createElement('a');
    download.href = src;
    download.download = 'ai-generated-image.png';
    download.className = 'ghost-btn';
    download.style.marginTop = '4px';
    download.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i> Download image';
    wrap.append(caption, image, download);
    return wrap;
}

function parseLegacyImageMessage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        if (!img || !img.getAttribute('src')) return null;
        const promptMatch = (doc.querySelector('p')?.textContent || '').match(/based on:\s*"(.*)"/i);
        return { src: img.getAttribute('src'), prompt: promptMatch ? promptMatch[1] : '' };
    } catch (error) {
        return null;
    }
}

function renderEmptyState(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-empty';

    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<i class="fas ${currentModel ? currentModel.avatar : 'fa-comments'}"></i>`;

    const title = document.createElement('h3');
    title.textContent = currentModel && !modelHasKey(currentModel)
        ? 'Add a key to start chatting'
        : 'Start the conversation';

    const copy = document.createElement('p');
    copy.textContent = currentModel && !modelHasKey(currentModel)
        ? `This chat with ${currentModel.name} is ready, but sending messages needs an API key for the provider.`
        : `Ask ${currentModel ? currentModel.name : 'the model'} anything — answers stream in as they are written.`;

    wrapper.append(icon, title, copy);

    if (!currentConversation.length) {
        const suggestions = document.createElement('div');
        suggestions.className = 'suggestion-grid';
        [
            ['Explain a tricky idea', 'Explain how HTTPS keeps a connection private, in simple terms.'],
            ['Debug some code', 'Help me find why my JavaScript fetch call returns undefined.'],
            ['Draft a message', 'Draft a short, friendly follow-up email after a job interview.'],
            ['Plan something', 'Create a simple 7-day plan to learn CSS Grid from scratch.']
        ].forEach(([label, prompt]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'suggestion-btn';
            button.innerHTML = `${label}<small></small>`;
            button.querySelector('small').textContent = prompt;
            button.addEventListener('click', () => {
                insertComposerText(prompt);
                const input = document.getElementById('message-input');
                if (input) input.focus();
            });
            suggestions.appendChild(button);
        });
        wrapper.appendChild(suggestions);
    }

    container.appendChild(wrapper);
}

function updateMessageContent(index, content) {
    const article = document.querySelector(`.message[data-index="${index}"] .message-content`);
    if (!article) return;
    const message = currentConversation[index];
    if (!message) return;
    fillMessageContent(article, message);
}

function formatClock(timestamp) {
    try {
        return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        return '';
    }
}

function scrollToBottom(instant = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    if (instant) {
        container.scrollTop = container.scrollHeight;
    } else {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    const jumpBtn = document.getElementById('scroll-latest-btn');
    if (jumpBtn) jumpBtn.hidden = true;
    autoscroll = true;
}

/* ---------- Typing / errors ---------- */

function showTypingIndicator() {
    hideTypingIndicator();
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const empty = container.querySelector('.chat-empty');
    if (empty) empty.remove();
    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.id = 'typing-indicator';
    typing.setAttribute('aria-label', 'Assistant is typing');
    typing.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(typing);
    if (autoscroll) scrollToBottom(true);
}

function hideTypingIndicator() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

function renderErrorNotice(text) {
    removeErrorNotice();
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const note = document.createElement('div');
    note.className = 'error-note';
    note.id = 'error-notice';
    note.innerHTML = '<i class="fas fa-triangle-exclamation" aria-hidden="true"></i>';
    const copy = document.createElement('p');
    copy.textContent = text;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-ghost btn-sm';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
        removeErrorNotice();
        generateReply();
    });
    note.append(copy, retry);
    container.appendChild(note);
    scrollToBottom(true);
}

function removeErrorNotice() {
    const note = document.getElementById('error-notice');
    if (note) note.remove();
}

function getFriendlyErrorMessage(error) {
    const raw = String((error && error.message) || 'Unknown error');
    const message = raw.toLowerCase();

    if (message.includes('missing authentication header') || message.includes('no auth credentials') || message.includes('api key is required')) {
        return 'No usable API key was found for this model. Open API keys and add one for the provider, then retry.';
    }
    if (message.includes('insufficient credits') || message.includes('never purchased credits')) {
        return 'The key works but the account has no credits. Add credits or pick a different key in API keys.';
    }
    if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid api key') || message.includes('invalid_api_key')) {
        return 'The provider rejected this API key. Check that the key is correct and still active.';
    }
    if (message.includes('429') || message.includes('rate limit')) {
        return 'Rate limit reached at the provider. Wait a moment and retry, or pick another key.';
    }
    if (message.includes('404') || message.includes('not a valid model') || message.includes('model not found')) {
        return 'This model is not available on the provider right now. Try another model from the picker.';
    }
    if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network request failed')) {
        return 'Network request failed. Check your connection or provider access, then retry.';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
        return 'The provider took too long to respond. Retry in a moment.';
    }

    const trimmed = raw.length > 220 ? raw.slice(0, 220) + '…' : raw;
    return `Request failed: ${trimmed}`;
}

/* ---------- Message actions ---------- */

async function copyMessage(message) {
    const text = message.image ? (message.prompt || 'Generated image') : message.content;
    const ok = await copyToClipboard(text);
    showToast(ok ? 'Copied to clipboard.' : 'Copy failed — select the text manually.', ok ? 'success' : 'error');
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
    area.remove();
    return ok;
}

function initEditModal() {
    const saveBtn = document.getElementById('save-edit-btn');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', async () => {
        const textarea = document.getElementById('edit-message-input');
        if (!textarea || editingIndex < 0) return;
        const value = textarea.value.trim();
        if (!value) {
            showToast('Message cannot be empty.', 'error');
            textarea.focus();
            return;
        }

        currentConversation[editingIndex].content = value;
        currentConversation[editingIndex].ts = Date.now();
        currentConversation = currentConversation.slice(0, editingIndex + 1);
        saveConversation();
        closeModal('edit-message-modal');
        renderChatMessages();
        updateConversationHistory();
        updateComposerState();
        await generateReply();
    });
}

function openEditModal(index) {
    const message = currentConversation[index];
    if (!message) return;
    editingIndex = index;
    const textarea = document.getElementById('edit-message-input');
    if (textarea) textarea.value = message.content;
    openModal('edit-message-modal');
    if (textarea) textarea.focus();
}

async function regenerateMessage(index) {
    if (isGenerating) return;
    const message = currentConversation[index];
    if (!message) return;

    let userIndex = index - 1;
    while (userIndex >= 0 && normalizeRole(currentConversation[userIndex].role) !== 'user') userIndex--;
    if (userIndex < 0) {
        showToast('No user message to regenerate from.', 'error');
        return;
    }

    if (!modelHasKey(currentModel)) {
        showToast('Add an API key for this provider first.', 'error');
        return;
    }

    currentConversation = currentConversation.slice(0, userIndex + 1);
    saveConversation();
    renderChatMessages();
    updateConversationHistory();
    await generateReply();
}

async function deleteMessage(index) {
    const confirmed = await confirmAction({
        title: 'Delete this message?',
        message: 'The message will be removed from this conversation on this device.',
        confirmLabel: 'Delete',
        danger: true
    });
    if (!confirmed) return;

    currentConversation.splice(index, 1);
    saveConversation();
    renderChatMessages();
    updateConversationHistory();
    showToast('Message deleted.', 'success');
}

async function clearCurrentChat() {
    if (!currentModel) return;
    const confirmed = await confirmAction({
        title: 'Clear this conversation?',
        message: `All messages with ${currentModel.name} will be deleted from this browser.`,
        confirmLabel: 'Clear chat',
        danger: true
    });
    if (!confirmed) return;

    currentConversation = [];
    try { localStorage.removeItem(`chat_${currentModel.id}`); } catch (error) { /* noop */ }
    clearDraft(currentModel.id);
    renderChatMessages();
    updateConversationHistory();
    updateComposerState();
    showToast('Conversation cleared.', 'success');
}

/* ---------- Composer extras ---------- */

function initQuickActions() {
    document.querySelectorAll('.chip[data-action]').forEach(chip => {
        chip.addEventListener('click', () => {
            const action = chip.dataset.action;
            if (action === 'templates') {
                if (typeof window.openTemplatesModal === 'function') window.openTemplatesModal();
                return;
            }

            const current = document.getElementById('message-input')?.value.trim() || '';
            const templates = {
                summarize: ['Summarize', 'Summarize the following in 3-5 bullet points:\n\n'],
                explain: ['Explain', 'Explain the following in simple terms for a beginner:\n\n'],
                translate: ['Translate', 'Translate the following text to Hindi:\n\n'],
                code: ['Code', 'Turn the following into working code with comments:\n\n']
            };
            const [label, prefix] = templates[action] || ['', ''];
            insertComposerText(`${prefix}${current || `[paste text to ${label.toLowerCase()}]`}`);
        });
    });
}

function initEmojiPicker() {
    const button = document.getElementById('emoji-btn');
    const picker = document.getElementById('emoji-picker');
    if (!button || !picker) return;

    button.addEventListener('click', (event) => {
        event.stopPropagation();
        picker.hidden = !picker.hidden;
        button.setAttribute('aria-expanded', String(!picker.hidden));
    });

    picker.querySelectorAll('.emoji-btn').forEach(emoji => {
        emoji.addEventListener('click', () => {
            insertComposerText(emoji.textContent);
            picker.hidden = true;
        });
    });

    document.addEventListener('click', (event) => {
        if (!picker.hidden && !picker.contains(event.target) && event.target !== button) {
            picker.hidden = true;
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !picker.hidden) {
            picker.hidden = true;
            button.focus();
        }
    });
}

function initVoiceInput() {
    const button = document.getElementById('voice-input-btn');
    if (!button) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        button.addEventListener('click', () => showToast('Voice input is not supported in this browser.', 'info'));
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let listening = false;
    let baseText = '';

    button.addEventListener('click', () => {
        if (listening) {
            recognition.stop();
            return;
        }
        const input = document.getElementById('message-input');
        baseText = input ? input.value : '';
        try {
            recognition.start();
        } catch (error) {
            showToast('Microphone could not start. Check browser permissions.', 'error');
        }
    });

    recognition.onstart = () => {
        listening = true;
        button.classList.add('is-active');
        button.setAttribute('aria-label', 'Stop voice input');
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        const input = document.getElementById('message-input');
        if (!input) return;
        const spacer = baseText && !baseText.endsWith(' ') ? ' ' : '';
        input.value = baseText + spacer + transcript;
        autoResizeInput();
        updateComposerState();
    };

    recognition.onend = () => {
        listening = false;
        button.classList.remove('is-active');
        button.setAttribute('aria-label', 'Start voice input');
        scheduleDraftSave();
    };

    recognition.onerror = (event) => {
        listening = false;
        button.classList.remove('is-active');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            showToast('Microphone permission was blocked.', 'error');
        } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
            showToast('Voice input stopped unexpectedly.', 'error');
        }
    };
}

/* ---------- Model requests ---------- */

async function requestAssistantReply(conversation, options) {
    if (!currentModel) throw new Error('No model selected');

    if (currentModel.isImageGenerator) {
        const lastUser = [...conversation].reverse().find(message => message.role === 'user');
        return generateImageWithHuggingFace(lastUser ? lastUser.content : '');
    }

    const messages = buildApiMessages(conversation);

    if (currentModel.provider === 'gemini') {
        return geminiReply(messages, options);
    }

    const apiKey = window.resolveProviderApiKey(currentModel.provider, currentModel.id);

    if (currentModel.provider === 'deepseek') {
        return openAICompatibleReply({
            url: 'https://api.deepseek.com/chat/completions',
            apiKey,
            models: [currentModel.apiModel || 'deepseek-chat'],
            messages,
            options
        });
    }

    if (currentModel.provider === 'grok') {
        return openAICompatibleReply({
            url: 'https://api.x.ai/v1/chat/completions',
            apiKey,
            models: [currentModel.apiModel || 'grok-4', 'grok-3', 'grok-beta'],
            messages,
            options
        });
    }

    if (apiKey.startsWith('AIza')) {
        throw new Error('This looks like a Gemini key. Add an OpenRouter key for OpenRouter models.');
    }

    return openAICompatibleReply({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey,
        models: [currentModel.id],
        messages,
        options,
        extraHeaders: {
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Alok Systems AI Chat'
        }
    });
}

function buildApiMessages(conversation) {
    const trimmed = conversation.slice(-MAX_CONTEXT_MESSAGES).map(message => {
        let content = message.content || '';
        if (message.image || content.startsWith('data:image')) {
            content = `[Generated image${message.prompt ? ` for: ${message.prompt}` : ''}]`;
        } else if (content.startsWith('<div class="generated-image">')) {
            const parsed = parseLegacyImageMessage(content);
            content = parsed ? `[Generated image${parsed.prompt ? ` for: ${parsed.prompt}` : ''}]` : '[Generated image]';
        }
        return {
            role: normalizeRole(message.role) === 'ai' ? 'assistant' : 'user',
            content
        };
    });

    const systemPrompt = window.getSystemPrompt ? window.getSystemPrompt(currentModel.id) : '';
    if (systemPrompt) trimmed.unshift({ role: 'system', content: systemPrompt });
    return trimmed;
}

async function openAICompatibleReply({ url, apiKey, models, messages, options, extraHeaders = {} }) {
    let lastError = null;

    for (const model of models) {
        try {
            return await openAICompatibleAttempt({ url, apiKey, model, messages, options, extraHeaders });
        } catch (error) {
            lastError = error;
            if (error.name === 'AbortError') throw error;
            const retryable = models.length > 1 && (error.status === 404 || /model/i.test(error.message));
            if (!retryable) throw error;
        }
    }

    throw lastError || new Error('No available model responded');
}

async function openAICompatibleAttempt({ url, apiKey, model, messages, options, extraHeaders }) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...extraHeaders
    };

    const body = {
        model,
        messages,
        max_tokens: 1200,
        temperature: 0.7,
        stream: true
    };

    let started = false;

    try {
        const text = await streamOpenAIResponse({
            url,
            headers,
            body,
            signal: options.signal,
            onDelta: (partial) => {
                started = true;
                options.onDelta(partial);
            }
        });
        return { type: 'text', content: text };
    } catch (error) {
        if (error.name === 'AbortError' || options.signal.aborted || started) throw error;

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...body, stream: false }),
            signal: options.signal
        });

        if (!response.ok) {
            const apiError = await buildApiError(response);
            throw apiError;
        }

        const data = await response.json();
        const content = extractOpenAIContent(data);
        if (!content) throw new Error('The provider returned an empty response.');
        options.onDelta(content);
        return { type: 'text', content };
    }
}

async function streamOpenAIResponse({ url, headers, body, signal, onDelta }) {
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) throw await buildApiError(response);

    const contentType = response.headers.get('content-type') || '';

    if (!response.body || contentType.includes('application/json')) {
        const data = await response.json();
        const content = extractOpenAIContent(data);
        if (!content) throw new Error('The provider returned an empty response.');
        onDelta(content);
        return content;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let done = false;

    while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;

            const payload = line.slice(5).trim();
            if (payload === '[DONE]') { done = true; break; }

            try {
                const json = JSON.parse(payload);
                if (json.error) throw new Error(json.error.message || 'Provider stream error');
                const delta = json.choices?.[0]?.delta?.content ?? '';
                if (delta) {
                    full += delta;
                    onDelta(full);
                }
            } catch (error) {
                if (error instanceof SyntaxError) continue;
                throw error;
            }
        }
    }

    if (!full.trim()) throw new Error('The provider stream ended without a reply.');
    return full;
}

function extractOpenAIContent(data) {
    const choice = data && data.choices && data.choices[0];
    if (!choice) return '';
    if (choice.message && typeof choice.message.content === 'string') return choice.message.content;
    if (typeof choice.text === 'string') return choice.text;
    if (typeof choice.content === 'string') return choice.content;
    return '';
}

async function buildApiError(response) {
    let message = `Request failed with status ${response.status}`;
    try {
        const text = await response.text();
        try {
            const data = JSON.parse(text);
            message = data.error?.message || data.message || text || message;
        } catch (error) {
            message = text || message;
        }
    } catch (error) { /* keep default */ }

    const apiError = new Error(message);
    apiError.status = response.status;
    return apiError;
}

/* ---------- Gemini ---------- */

let geminiCandidateCache = { key: '', models: [], at: 0 };

async function geminiModelCandidates(apiKey, signal) {
    const now = Date.now();
    if (geminiCandidateCache.key === apiKey && now - geminiCandidateCache.at < 10 * 60 * 1000) {
        return geminiCandidateCache.models;
    }

    const fallback = [
        'models/gemini-2.0-flash',
        'models/gemini-2.0-flash-lite',
        'models/gemini-1.5-flash-latest',
        'models/gemini-1.5-pro-latest',
        'models/gemini-pro'
    ];

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, { signal });
        if (!response.ok) return fallback;
        const data = await response.json();
        const models = Array.isArray(data.models) ? data.models : [];
        const supported = models
            .filter(model => model?.name && Array.isArray(model.supportedGenerationMethods) &&
                model.supportedGenerationMethods.includes('generateContent') && model.name.includes('gemini'))
            .map(model => model.name);
        const result = supported.length ? supported : fallback;
        geminiCandidateCache = { key: apiKey, models: result, at: now };
        return result;
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        return fallback;
    }
}

async function geminiReply(messages, options) {
    const apiKey = window.resolveProviderApiKey('gemini', currentModel.id);
    if (!apiKey) throw new Error('Gemini API key is required. Add it under API keys.');

    const systemPrompt = window.getSystemPrompt ? window.getSystemPrompt(currentModel.id) : '';
    const contents = messages
        .filter(message => message.role !== 'system')
        .map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
        }));

    const payload = {
        contents,
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
    };

    const candidates = await geminiModelCandidates(apiKey, options.signal);
    const versions = ['v1beta', 'v1'];
    let lastError = null;

    for (const version of versions) {
        for (const modelName of candidates) {
            const base = `https://generativelanguage.googleapis.com/${version}/${modelName}`;
            try {
                const text = await streamGeminiResponse(`${base}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, payload, options);
                if (text.trim()) return { type: 'text', content: text };
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                lastError = error;

                if (error.status === 404 || /not found|not supported/i.test(error.message)) {
                    continue;
                }

                try {
                    const text = await standardGeminiResponse(`${base}:generateContent?key=${encodeURIComponent(apiKey)}`, payload, options);
                    if (text.trim()) return { type: 'text', content: text };
                } catch (fallbackError) {
                    if (fallbackError.name === 'AbortError') throw fallbackError;
                    lastError = fallbackError;
                    if (!(fallbackError.status === 404 || /not found|not supported/i.test(fallbackError.message))) {
                        throw fallbackError;
                    }
                }
            }
        }
    }

    throw lastError || new Error('No available Gemini model responded.');
}

async function streamGeminiResponse(url, payload, options) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal
    });

    if (!response.ok) throw await buildApiError(response);

    const contentType = response.headers.get('content-type') || '';
    if (!response.body || contentType.includes('application/json')) {
        const data = await response.json();
        const text = extractGeminiText(data);
        if (!text.trim()) throw new Error('Gemini returned an empty response.');
        options.onDelta(text);
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let done = false;

    while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line || !line.startsWith('data:')) continue;
            const payloadText = line.slice(5).trim();
            if (!payloadText || payloadText === '[DONE]') continue;

            try {
                const json = JSON.parse(payloadText);
                const piece = extractGeminiText(json);
                if (piece) {
                    full = mergeStreamText(full, piece);
                    options.onDelta(full);
                }
            } catch (error) {
                if (error instanceof SyntaxError) continue;
                throw error;
            }
        }
    }

    if (!full.trim()) throw new Error('Gemini returned an empty response.');
    return full;
}

async function standardGeminiResponse(url, payload, options) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal
    });
    if (!response.ok) throw await buildApiError(response);
    const data = await response.json();
    const text = extractGeminiText(data);
    if (!text.trim()) throw new Error('Gemini returned an empty response.');
    options.onDelta(text);
    return text;
}

function extractGeminiText(data) {
    return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
}

function mergeStreamText(current, piece) {
    if (!current) return piece;
    if (piece.startsWith(current)) return piece;
    if (current.endsWith(piece)) return current;
    return current + piece;
}

/* ---------- Image generation ---------- */

async function generateImageWithHuggingFace(prompt) {
    if (!prompt.trim()) throw new Error('Describe the image you want to generate.');

    const apiKey = window.resolveProviderApiKey('huggingface', currentModel.id);
    if (!apiKey) throw new Error('A Hugging Face API key is required for image generation.');

    const endpoints = [
        'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0',
        'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0'
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } })
            });

            if (!response.ok) {
                lastError = await buildApiError(response);
                continue;
            }

            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) {
                lastError = new Error('The provider did not return an image. The model may be loading — try again.');
                continue;
            }

            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Could not read the generated image.'));
                reader.readAsDataURL(blob);
            });

            return { type: 'image', content: dataUrl, prompt };
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            lastError = error;
        }
    }

    throw lastError || new Error('Image generation failed.');
}

/* ---------- Markdown ---------- */

function renderMarkdown(source) {
    const fragment = document.createDocumentFragment();
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];

        if (!line.trim()) { index++; continue; }

        const fence = line.match(/^\s*```\s*([\w+#.-]*)\s*$/);
        if (fence) {
            const language = fence[1] || 'code';
            const codeLines = [];
            index++;
            while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
                codeLines.push(lines[index]);
                index++;
            }
            index++;
            fragment.appendChild(buildCodeBlock(codeLines.join('\n'), language));
            continue;
        }

        const heading = line.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
            const level = Math.min(heading[1].length + 1, 5);
            const element = document.createElement(`h${level}`);
            appendInline(element, heading[2]);
            fragment.appendChild(element);
            index++;
            continue;
        }

        if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
            fragment.appendChild(document.createElement('hr'));
            index++;
            continue;
        }

        if (/^\s*>/.test(line)) {
            const quoteLines = [];
            while (index < lines.length && /^\s*>/.test(lines[index])) {
                quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
                index++;
            }
            const quote = document.createElement('blockquote');
            const paragraph = document.createElement('p');
            appendInline(paragraph, quoteLines.join(' '));
            quote.appendChild(paragraph);
            fragment.appendChild(quote);
            continue;
        }

        if (/^\s*[-*+]\s+/.test(line)) {
            const list = document.createElement('ul');
            while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
                const item = document.createElement('li');
                appendInline(item, lines[index].replace(/^\s*[-*+]\s+/, ''));
                list.appendChild(item);
                index++;
            }
            fragment.appendChild(list);
            continue;
        }

        if (/^\s*\d+[.)]\s+/.test(line)) {
            const list = document.createElement('ol');
            const startNumber = parseInt(line, 10);
            if (startNumber > 1) list.start = startNumber;
            while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
                const item = document.createElement('li');
                appendInline(item, lines[index].replace(/^\s*\d+[.)]\s+/, ''));
                list.appendChild(item);
                index++;
            }
            fragment.appendChild(list);
            continue;
        }

        const paragraphLines = [];
        while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
            paragraphLines.push(lines[index].trim());
            index++;
        }
        if (paragraphLines.length) {
            const paragraph = document.createElement('p');
            appendInline(paragraph, paragraphLines.join(' '));
            fragment.appendChild(paragraph);
        }
    }

    return fragment;
}

function isBlockStart(line) {
    return /^\s*```/.test(line) ||
        /^(#{1,4})\s+/.test(line) ||
        /^\s*>/.test(line) ||
        /^\s*[-*+]\s+/.test(line) ||
        /^\s*\d+[.)]\s+/.test(line) ||
        /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line);
}

function appendInline(parent, text) {
    const pattern = /`([^`\n]+)`|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        if (match[1]) {
            const code = document.createElement('code');
            code.textContent = match[1];
            parent.appendChild(code);
        } else if (match[2] || match[3]) {
            const strong = document.createElement('strong');
            appendInline(strong, match[2] || match[3]);
            parent.appendChild(strong);
        } else if (match[4]) {
            const strike = document.createElement('s');
            appendInline(strike, match[4]);
            parent.appendChild(strike);
        } else if (match[5] || match[6]) {
            const em = document.createElement('em');
            appendInline(em, match[5] || match[6]);
            parent.appendChild(em);
        } else if (match[7] && match[8]) {
            const link = document.createElement('a');
            link.textContent = match[7];
            link.href = match[8];
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            parent.appendChild(link);
        }

        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
}

function buildCodeBlock(code, language) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';

    const head = document.createElement('div');
    head.className = 'code-head';

    const label = document.createElement('span');
    label.className = 'code-lang';
    label.textContent = language;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'code-copy';
    copyBtn.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i> Copy';
    copyBtn.addEventListener('click', async () => {
        const ok = await copyToClipboard(code);
        copyBtn.innerHTML = ok
            ? '<i class="fas fa-check" aria-hidden="true"></i> Copied'
            : '<i class="fas fa-xmark" aria-hidden="true"></i> Failed';
        window.setTimeout(() => {
            copyBtn.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i> Copy';
        }, 1800);
    });

    head.append(label, copyBtn);

    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.textContent = code;
    pre.appendChild(codeEl);

    wrapper.append(head, pre);
    return wrapper;
}

/* ---------- Key state ---------- */

function updateKeyWarning(model) {
    const warning = document.getElementById('key-warning');
    if (!warning) return;
    const missing = model ? !modelHasKey(model) : false;
    warning.hidden = !missing;
    const text = warning.querySelector('p');
    if (missing && text && currentModel) {
        text.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = `No API key for ${getProviderMeta(model.provider).name}.`;
        text.append(strong, ` Add one to send messages. Saved conversations stay readable.`);
    }
}

window.renderChatMessages = renderChatMessages;
window.updateComposerState = updateComposerState;
window.restoreDraft = restoreDraft;
window.updateKeyWarning = updateKeyWarning;
window.stopGeneration = stopGeneration;
window.insertComposerText = insertComposerText;
window.copyToClipboard = copyToClipboard;
