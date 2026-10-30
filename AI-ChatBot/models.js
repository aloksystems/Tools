// Providers, models, and navigation between the picker and the chat screen.

const availableModels = [
    {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        avatar: 'fa-robot',
        description: 'Fast, low-cost chat and text processing.',
        context: '200K context',
        maxTokens: 200000,
        provider: 'openrouter'
    },
    {
        id: 'anthropic/claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        avatar: 'fa-robot',
        description: 'Balanced intelligence and speed for daily work.',
        context: '200K context',
        maxTokens: 200000,
        provider: 'openrouter'
    },
    {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        avatar: 'fa-robot',
        description: 'Deep reasoning for complex, long-form tasks.',
        context: '100K context',
        maxTokens: 100000,
        provider: 'openrouter'
    },
    {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        avatar: 'fa-brain',
        description: 'OpenAI\'s general-purpose multimodal model.',
        context: '128K context',
        maxTokens: 128000,
        provider: 'openrouter'
    },
    {
        id: 'meta-llama/llama-3-70b-instruct',
        name: 'Llama 3 70B',
        avatar: 'fa-comment-alt',
        description: 'Meta\'s open model with strong general answers.',
        context: '8K context',
        maxTokens: 8000,
        provider: 'openrouter'
    },
    {
        id: 'meta-llama/llama-3-8b-instruct',
        name: 'Llama 3 8B',
        avatar: 'fa-comment-alt',
        description: 'Compact and efficient for everyday prompts.',
        context: '8K context',
        maxTokens: 8000,
        provider: 'openrouter'
    },
    {
        id: 'mistralai/mistral-large',
        name: 'Mistral Large',
        avatar: 'fa-wind',
        description: 'Strong reasoning with a general-purpose focus.',
        context: '32K context',
        maxTokens: 32000,
        provider: 'openrouter'
    },
    {
        id: 'google/gemini-pro',
        name: 'Gemini Pro',
        avatar: 'fa-comment-dots',
        description: 'Google Gemini through an AI Studio key.',
        context: 'Auto-detected model',
        maxTokens: 30000,
        provider: 'gemini'
    },
    {
        id: 'deepseek-coder',
        name: 'DeepSeek Chat',
        avatar: 'fa-code',
        description: 'Coding-focused model for programming help.',
        context: 'DeepSeek API',
        maxTokens: 8000,
        provider: 'deepseek',
        apiModel: 'deepseek-chat'
    },
    {
        id: 'huggingface-image',
        name: 'Image generation',
        avatar: 'fa-image',
        description: 'Create images from a text description.',
        context: 'Stable Diffusion XL',
        maxTokens: 1000,
        provider: 'huggingface',
        isImageGenerator: true
    },
    {
        id: 'grok-ai',
        name: 'Grok',
        avatar: 'fa-bolt',
        description: 'xAI Grok for fast reason-first answers.',
        context: 'xAI API',
        maxTokens: 4000,
        provider: 'grok',
        apiModel: 'grok-4'
    }
];

const providerDetails = {
    openrouter: {
        name: 'OpenRouter',
        avatar: 'fa-network-wired',
        description: 'Claude, GPT, Llama, Mistral and more with one key.',
        keyStorage: 'openrouter_api_key',
        keyUrl: 'https://openrouter.ai/keys',
        keyLinkLabel: 'OpenRouter keys'
    },
    gemini: {
        name: 'Google Gemini',
        avatar: 'fa-star',
        description: 'Native Gemini models through Google AI Studio.',
        keyStorage: 'gemini_api_key',
        keyUrl: 'https://aistudio.google.com/app/apikey',
        keyLinkLabel: 'Google AI Studio'
    },
    deepseek: {
        name: 'DeepSeek',
        avatar: 'fa-brain',
        description: 'DeepSeek chat and coding models.',
        keyStorage: 'deepseek_api_key',
        keyUrl: 'https://platform.deepseek.com/api_keys',
        keyLinkLabel: 'DeepSeek keys'
    },
    huggingface: {
        name: 'Hugging Face',
        avatar: 'fa-image',
        description: 'Image generation with open models.',
        keyStorage: 'huggingface_api_key',
        keyUrl: 'https://huggingface.co/settings/tokens',
        keyLinkLabel: 'Hugging Face tokens'
    },
    grok: {
        name: 'Grok',
        avatar: 'fa-bolt',
        description: 'xAI Grok models with an xAI key.',
        keyStorage: 'grok_api_key',
        keyUrl: 'https://console.x.ai',
        keyLinkLabel: 'xAI console'
    }
};

let currentModel = null;
let currentProviderFilter = null;

function getProviderMeta(providerId) {
    return providerDetails[providerId] || {
        name: providerId,
        avatar: 'fa-robot',
        description: 'Available models',
        keyStorage: 'openrouter_api_key',
        keyUrl: 'https://openrouter.ai/keys',
        keyLinkLabel: 'provider dashboard'
    };
}

function providerHasKey(providerId, modelId = null) {
    if (typeof window.resolveProviderApiKey !== 'function') return false;
    return Boolean(window.resolveProviderApiKey(providerId, modelId));
}

function modelHasKey(model) {
    if (model.isImageGenerator) return providerHasKey('huggingface', model.id);
    return providerHasKey(model.provider, model.id);
}

function getModelById(modelId) {
    return availableModels.find(model => model.id === modelId) || null;
}

/* ---------- Home screen ---------- */

function initializeModelsGrid() {
    renderProviderGrid();
}

function setHomeHeader(title, hint, showBack) {
    const heading = document.getElementById('home-heading');
    const hintEl = document.getElementById('provider-hint');
    const backBtn = document.getElementById('home-back');
    if (heading) heading.textContent = title;
    if (hintEl) hintEl.textContent = hint;
    if (backBtn) backBtn.hidden = !showBack;
}

function renderProviderGrid() {
    currentProviderFilter = null;
    setHomeHeader('Pick a provider to start', 'All requests are sent directly to the provider you choose.', false);

    const grid = document.getElementById('models-grid');
    if (!grid) return;
    grid.replaceChildren();

    const providers = Object.keys(providerDetails).filter(providerId =>
        availableModels.some(model => model.provider === providerId)
    );

    providers.forEach(providerId => {
        const provider = getProviderMeta(providerId);
        const models = availableModels.filter(model => model.provider === providerId);
        const ready = models.some(modelHasKey);

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'model-card';
        card.dataset.providerId = providerId;
        card.innerHTML = `
            <div class="model-card-head">
                <span class="model-avatar" aria-hidden="true"><i class="fas ${provider.avatar}"></i></span>
                <span class="model-key-state ${ready ? 'is-ready' : ''}">
                    <i class="fas ${ready ? 'fa-circle-check' : 'fa-key'}" aria-hidden="true"></i>
                    ${ready ? 'Key ready' : 'Add key'}
                </span>
            </div>
            <h3></h3>
            <p class="model-desc"></p>
            <div class="model-card-foot">
                <span class="model-count">${models.length} ${models.length === 1 ? 'model' : 'models'}</span>
                <span class="model-cta">Browse <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
            </div>
        `;
        card.querySelector('h3').textContent = provider.name;
        card.querySelector('.model-desc').textContent = provider.description;
        card.addEventListener('click', () => renderProviderModels(providerId));
        grid.appendChild(card);
    });
}

function renderProviderModels(providerId) {
    currentProviderFilter = providerId;
    const provider = getProviderMeta(providerId);
    setHomeHeader(`${provider.name} models`, provider.description, true);

    const grid = document.getElementById('models-grid');
    if (!grid) return;
    grid.replaceChildren();

    const models = availableModels.filter(model => model.provider === providerId);
    models.forEach(model => {
        const ready = modelHasKey(model);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'model-card';
        card.dataset.modelId = model.id;
        card.innerHTML = `
            <div class="model-card-head">
                <span class="model-avatar" aria-hidden="true"><i class="fas ${model.avatar}"></i></span>
                <span class="model-key-state ${ready ? 'is-ready' : ''}">
                    <i class="fas ${ready ? 'fa-circle-check' : 'fa-key'}" aria-hidden="true"></i>
                    ${ready ? 'Ready' : 'No key'}
                </span>
            </div>
            <h3></h3>
            <p class="model-desc"></p>
            <div class="model-card-foot">
                <span class="model-badge"></span>
                <span class="model-cta">Chat <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
            </div>
        `;
        card.querySelector('h3').textContent = model.name;
        card.querySelector('.model-desc').textContent = model.description;
        card.querySelector('.model-badge').textContent = model.context || provider.name;
        card.addEventListener('click', () => selectModel(model));
        grid.appendChild(card);
    });
}

function refreshHomeView() {
    if (document.getElementById('chat-screen') && !document.getElementById('chat-screen').hidden) return;
    if (currentProviderFilter) renderProviderModels(currentProviderFilter);
    else renderProviderGrid();
}

function initModelNavigation() {
    const backBtn = document.getElementById('home-back');
    if (backBtn) backBtn.addEventListener('click', renderProviderGrid);
}

/* ---------- Opening a conversation ---------- */

function selectModel(model) {
    loadChatWithSelectedModel(model);
}

function loadChatWithSelectedModel(model) {
    if (!model) return;
    const provider = getProviderMeta(model.provider);

    currentModel = model;
    currentConversation = loadChatHistory(model.id);

    document.getElementById('home-screen').hidden = true;
    document.getElementById('chat-screen').hidden = false;
    document.body.classList.add('chat-open');

    const nameEl = document.getElementById('current-model-name');
    const metaEl = document.getElementById('current-model-meta');
    const avatarEl = document.getElementById('chat-model-avatar');
    if (nameEl) nameEl.textContent = model.name;
    if (metaEl) metaEl.textContent = `${provider.name} · ${model.context || 'Ready'}`;
    if (avatarEl) avatarEl.innerHTML = `<i class="fas ${model.avatar}" aria-hidden="true"></i>`;

    const context = document.getElementById('app-context');
    if (context) context.textContent = `Chatting with ${model.name}`;

    const promptDot = document.getElementById('prompt-dot');
    if (promptDot) promptDot.hidden = !(typeof getSystemPrompt === 'function' && getSystemPrompt(model.id));

    if (typeof window.renderChatMessages === 'function') window.renderChatMessages();
    if (typeof window.updateKeyWarning === 'function') window.updateKeyWarning(model);
    if (typeof window.restoreDraft === 'function') window.restoreDraft(model.id);
    if (typeof window.updateComposerState === 'function') window.updateComposerState();
    if (typeof window.updateKeyStatus === 'function') window.updateKeyStatus();

    highlightCurrentConversation(model.id);

    const input = document.getElementById('message-input');
    if (input && window.matchMedia('(min-width: 861px)').matches) input.focus();
}

function highlightCurrentConversation(modelId) {
    document.querySelectorAll('[data-conversation-id]').forEach(item => {
        item.classList.toggle('active-conversation', item.dataset.conversationId === modelId);
    });
}

function backToModelSelection() {
    if (typeof window.stopGeneration === 'function') window.stopGeneration(true);

    document.getElementById('chat-screen').hidden = true;
    document.getElementById('home-screen').hidden = false;
    document.body.classList.remove('chat-open');

    const context = document.getElementById('app-context');
    if (context) context.textContent = 'One workspace, every model';

    currentModel = null;
    if (currentProviderFilter) renderProviderModels(currentProviderFilter);
    else renderProviderGrid();

    renderRecentConversations();
    if (typeof window.closeSidebar === 'function') window.closeSidebar();
    if (typeof window.updateKeyStatus === 'function') window.updateKeyStatus();
}

function loadChatHistory(modelId) {
    try {
        const raw = localStorage.getItem(`chat_${modelId}`);
        if (!raw) return [];
        const messages = JSON.parse(raw);
        return Array.isArray(messages) ? messages.filter(message => message && message.content) : [];
    } catch (error) {
        return [];
    }
}

/* ---------- Conversation metadata ---------- */

function getConversationMessages(modelId) {
    return loadChatHistory(modelId);
}

function getConversationTitle(modelId) {
    try {
        const custom = JSON.parse(localStorage.getItem('conversation_titles') || '{}');
        if (custom && typeof custom[modelId] === 'string' && custom[modelId].trim()) {
            return custom[modelId].trim();
        }
    } catch (error) { /* fall through to derived title */ }

    const messages = getConversationMessages(modelId);
    const firstUser = messages.find(message => message.role === 'user' && message.content);
    if (firstUser) {
        const text = String(firstUser.content).replace(/\s+/g, ' ').trim();
        return text.length > 46 ? text.slice(0, 46).trimEnd() + '…' : text;
    }
    const model = getModelById(modelId);
    return model ? `New chat · ${model.name}` : 'New chat';
}

function getConversationTimestamp(modelId) {
    const messages = getConversationMessages(modelId);
    const last = messages[messages.length - 1];
    return last && last.ts ? Number(last.ts) : 0;
}

function getConversationMessageCount(modelId) {
    return getConversationMessages(modelId).length;
}

function formatWhen(timestamp) {
    if (!timestamp) return 'Saved chat';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' hr ago';
    if (diff < 172800000) return 'Yesterday';
    return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function getConversationMeta(modelId) {
    const model = getModelById(modelId);
    const count = getConversationMessageCount(modelId);
    const when = formatWhen(getConversationTimestamp(modelId));
    const provider = model ? getProviderMeta(model.provider).name : '';
    return [provider, count ? `${count} messages` : 'Empty', when].filter(Boolean).join(' · ');
}

/* ---------- Recents ---------- */

function renderRecentConversations() {
    const section = document.getElementById('recent-section');
    const list = document.getElementById('recent-list');
    if (!section || !list) return;

    const conversations = Object.keys(localStorage)
        .filter(key => key.startsWith('chat_'))
        .map(key => key.slice(5))
        .filter(modelId => getConversationMessageCount(modelId) > 0)
        .sort((a, b) => getConversationTimestamp(b) - getConversationTimestamp(a))
        .slice(0, 4);

    list.replaceChildren();
    if (conversations.length === 0) {
        section.hidden = true;
        return;
    }

    section.hidden = false;
    conversations.forEach(modelId => {
        const model = getModelById(modelId);
        if (!model) return;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'recent-card';
        card.dataset.conversationId = modelId;
        card.innerHTML = `
            <span class="recent-avatar" aria-hidden="true"><i class="fas ${model.avatar}"></i></span>
            <span class="recent-copy">
                <span class="recent-title"></span>
                <span class="recent-meta"></span>
            </span>
            <span class="recent-go" aria-hidden="true"><i class="fas fa-arrow-right"></i></span>
        `;
        card.querySelector('.recent-title').textContent = getConversationTitle(modelId);
        card.querySelector('.recent-meta').textContent = `${model.name} · ${formatWhen(getConversationTimestamp(modelId))}`;
        card.addEventListener('click', () => loadChatWithSelectedModel(model));
        list.appendChild(card);
    });
}

/* ---------- Conversation folders sync ---------- */

function updateConversationHistory() {
    const conversationIds = Object.keys(localStorage)
        .filter(key => key.startsWith('chat_'))
        .map(key => key.slice(5))
        .filter(modelId => getModelById(modelId));

    const folders = window.conversationFolders || [];
    const defaultFolder = folders.find(folder => folder.isDefault);

    folders.forEach(folder => {
        if (!Array.isArray(folder.conversations)) folder.conversations = [];
        folder.conversations = folder.conversations.filter(id => conversationIds.includes(id));
    });

    if (defaultFolder) {
        conversationIds.forEach(id => {
            const placed = folders.some(folder => folder.conversations.includes(id));
            if (!placed) defaultFolder.conversations.push(id);
        });
    }

    if (typeof saveFolders === 'function') saveFolders();
    if (typeof renderFolderTree === 'function') renderFolderTree();
    renderRecentConversations();
}

window.getConversationTitle = getConversationTitle;
window.getConversationMeta = getConversationMeta;
window.getConversationMessages = getConversationMessages;
window.getModelById = getModelById;
window.providerHasKey = providerHasKey;
window.providerDetails = providerDetails;
window.getProviderMeta = getProviderMeta;
window.updateConversationHistory = updateConversationHistory;
window.renderRecentConversations = renderRecentConversations;
window.refreshHomeView = refreshHomeView;
