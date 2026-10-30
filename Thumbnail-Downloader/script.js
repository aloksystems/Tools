(function () {
  'use strict';

  const QUALITIES = [
    { key: 'maxres', name: 'Max resolution', file: 'maxresdefault.jpg', category: 'hd', minWidth: 640 },
    { key: 'sd', name: 'Standard definition', file: 'sddefault.jpg', category: 'hd', minWidth: 480 },
    { key: 'hq', name: 'High quality', file: 'hqdefault.jpg', category: 'hd', minWidth: 320 },
    { key: 'mq', name: 'Medium quality', file: 'mqdefault.jpg', category: 'sd', minWidth: 200 },
    { key: 'default', name: 'Default', file: 'default.jpg', category: 'sd', minWidth: 100 }
  ];
  const DEFAULT_HINT = 'Supports youtube.com/watch, youtu.be, Shorts, embed, live, or a raw 11-character ID.';

  const els = {
    form: document.getElementById('thumbnailForm'),
    videoUrl: document.getElementById('videoUrl'),
    urlField: document.getElementById('urlField'),
    urlHint: document.getElementById('urlHint'),
    clearBtn: document.getElementById('clearBtn'),
    submitBtn: document.getElementById('getThumbnails'),
    submitText: document.getElementById('getBtnText'),
    videoPanel: document.getElementById('videoPanel'),
    videoPreview: document.getElementById('videoPreview'),
    videoTitle: document.getElementById('videoTitle'),
    videoAuthor: document.getElementById('videoAuthor'),
    videoIdText: document.getElementById('videoIdText'),
    videoSizeCount: document.getElementById('videoSizeCount'),
    videoLink: document.getElementById('videoLink'),
    resultPanel: document.getElementById('resultPanel'),
    resultStatus: document.getElementById('resultStatus'),
    placeholder: document.getElementById('resultPlaceholder'),
    loading: document.getElementById('loadingState'),
    resultError: document.getElementById('resultError'),
    resultErrorText: document.getElementById('resultErrorText'),
    results: document.getElementById('resultsArea'),
    cards: document.getElementById('thumbnailCards'),
    countAll: document.getElementById('countAll'),
    countHd: document.getElementById('countHd'),
    countSd: document.getElementById('countSd'),
    filterButtons: Array.from(document.querySelectorAll('.filter-btn')),
    downloadAll: document.getElementById('downloadAll'),
    copyAll: document.getElementById('copyAllLinks'),
    availabilityNote: document.getElementById('availabilityNote'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    toastClose: document.getElementById('toastClose')
  };

  const state = {
    videoId: null,
    title: '',
    thumbnails: [],
    filter: 'all',
    loading: false
  };
  let requestSequence = 0;
  let toastTimer = null;
  const copyTimers = new WeakMap();

  function extractVideoId(rawValue) {
    const value = String(rawValue || '').trim().replace(/^['"]+|['"]+$/g, '');
    if (!value) return null;
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;

    const patterns = [
      /[?&]v=([A-Za-z0-9_-]{11})(?=[&#]|$)/,
      /youtu\.be\/([A-Za-z0-9_-]{11})(?=[?#&]|$)/,
      /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?=[?#&]|$)/i
    ];
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match && match[1]) return match[1];
    }

    try {
      const url = new URL(value.startsWith('http') ? value : 'https://' + value);
      const host = url.hostname.toLowerCase();
      if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(host)) return null;
      const v = url.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      if (host.endsWith('youtu.be')) {
        const id = url.pathname.split('/').filter(Boolean)[0];
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function updateValidation() {
    const raw = els.videoUrl.value.trim();
    const id = extractVideoId(raw);
    els.clearBtn.hidden = raw.length === 0;

    if (!raw) {
      els.urlHint.textContent = DEFAULT_HINT;
      els.urlHint.className = 'field-hint';
      els.urlField.classList.remove('has-error');
      els.videoUrl.removeAttribute('aria-invalid');
    } else if (id) {
      els.urlHint.textContent = 'Video ID detected: ' + id;
      els.urlHint.className = 'field-hint is-valid';
      els.urlField.classList.remove('has-error');
      els.videoUrl.setAttribute('aria-invalid', 'false');
    } else {
      els.urlHint.textContent = 'That does not contain a valid 11-character YouTube video ID.';
      els.urlHint.className = 'field-hint is-invalid';
      els.urlField.classList.add('has-error');
      els.videoUrl.setAttribute('aria-invalid', 'true');
    }

    els.submitBtn.disabled = state.loading || raw.length === 0;
    return id;
  }

  function finishLoading() {
    state.loading = false;
    els.loading.hidden = true;
    els.submitText.textContent = 'Get thumbnails';
    els.resultPanel.setAttribute('aria-busy', 'false');
    updateValidation();
  }

  function resetResultView() {
    els.placeholder.hidden = false;
    els.loading.hidden = true;
    els.resultError.hidden = true;
    els.results.hidden = true;
    els.resultStatus.textContent = 'Paste a link to see every available size.';
  }

  function clearResults() {
    requestSequence += 1;
    state.videoId = null;
    state.title = '';
    state.thumbnails = [];
    state.filter = 'all';
    els.videoPanel.hidden = true;
    els.cards.replaceChildren();
    els.videoPreview.removeAttribute('src');
    els.videoPreview.hidden = true;
    resetResultView();
    setFilter('all');
  }

  function showResultError(message) {
    els.placeholder.hidden = true;
    els.loading.hidden = true;
    els.results.hidden = true;
    els.resultErrorText.textContent = message;
    els.resultError.hidden = false;
    els.resultStatus.textContent = 'Nothing to download yet.';
  }

  function fetchVideoMeta(videoId, signal) {
    const watchUrl = 'https://www.youtube.com/watch?v=' + videoId;
    return fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(watchUrl) + '&format=json', { signal: signal })
      .then(function (response) {
        if (!response.ok) throw new Error('oEmbed unavailable');
        return response.json();
      })
      .then(function (data) {
        return {
          title: data && data.title ? String(data.title) : 'YouTube video',
          authorName: data && data.author_name ? String(data.author_name) : '',
          authorUrl: data && data.author_url ? String(data.author_url) : ''
        };
      })
      .catch(function () {
        return { title: 'YouTube video', authorName: '', authorUrl: '' };
      });
  }

  function checkImage(quality, videoId) {
    return new Promise(function (resolve) {
      const image = new Image();
      const url = 'https://img.youtube.com/vi/' + videoId + '/' + quality.file;
      let settled = false;
      let timeoutId = null;

      function finish(value) {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(value);
      }

      image.onload = function () {
        if (image.naturalWidth < quality.minWidth) {
          finish(null);
          return;
        }
        finish({
          key: quality.key,
          name: quality.name,
          category: quality.category,
          url: url,
          width: image.naturalWidth,
          height: image.naturalHeight
        });
      };
      image.onerror = function () { finish(null); };
      timeoutId = setTimeout(function () { finish(null); }, 9000);
      image.src = url;
    });
  }

  function loadThumbnails(videoId) {
    return Promise.all(QUALITIES.map(function (quality) {
      return checkImage(quality, videoId);
    })).then(function (items) {
      return items.filter(Boolean);
    });
  }

  function renderVideoDetails(meta, thumbs, videoId) {
    const watchUrl = 'https://www.youtube.com/watch?v=' + videoId;
    const authorRow = els.videoAuthor.closest('.video-author');

    els.videoTitle.textContent = meta.title;
    els.videoIdText.textContent = videoId;
    els.videoSizeCount.textContent = thumbs.length + ' of ' + QUALITIES.length + ' sizes';
    els.videoLink.href = watchUrl;

    if (meta.authorName) {
      els.videoAuthor.textContent = meta.authorName;
      els.videoAuthor.href = meta.authorUrl || watchUrl;
      authorRow.hidden = false;
    } else {
      authorRow.hidden = true;
    }

    els.videoPreview.src = thumbs[0].url;
    els.videoPreview.alt = thumbs[0].name + ' thumbnail for ' + meta.title;
    els.videoPreview.hidden = false;
    els.videoPanel.hidden = false;
  }

  function makeCard(thumbnail, meta) {
    const card = document.createElement('article');
    card.className = 'thumb-card ' + thumbnail.category;
    card.dataset.size = thumbnail.key;

    const previewWrap = document.createElement('div');
    previewWrap.className = 'thumb-preview-wrap';
    const image = document.createElement('img');
    image.className = 'thumb-preview';
    image.src = thumbnail.url;
    image.alt = thumbnail.name + ' thumbnail (' + thumbnail.width + ' by ' + thumbnail.height + ') for ' + meta.title;
    image.loading = 'lazy';
    image.decoding = 'async';
    previewWrap.appendChild(image);

    const body = document.createElement('div');
    body.className = 'thumb-card-body';
    const head = document.createElement('div');
    head.className = 'thumb-card-head';
    const nameWrap = document.createElement('div');
    const name = document.createElement('h3');
    name.className = 'thumb-name';
    name.textContent = thumbnail.name;
    const dimensions = document.createElement('p');
    dimensions.className = 'thumb-dimensions';
    dimensions.textContent = thumbnail.width + ' × ' + thumbnail.height + ' px';
    nameWrap.append(name, dimensions);
    const chip = document.createElement('span');
    chip.className = 'quality-chip';
    chip.textContent = thumbnail.category.toUpperCase();
    head.append(nameWrap, chip);

    const actions = document.createElement('div');
    actions.className = 'thumb-actions';

    const openLink = document.createElement('a');
    openLink.className = 'mini-btn';
    openLink.href = thumbnail.url;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.textContent = 'Open';
    openLink.setAttribute('aria-label', 'Open ' + thumbnail.name.toLowerCase() + ' thumbnail in a new tab');

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'mini-btn';
    saveButton.textContent = 'Save';
    saveButton.setAttribute('aria-label', 'Download ' + thumbnail.name.toLowerCase() + ' thumbnail');
    saveButton.addEventListener('click', function () {
      saveOneThumbnail(thumbnail, saveButton);
    });

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'mini-btn';
    copyButton.textContent = 'Copy';
    copyButton.setAttribute('aria-label', 'Copy the ' + thumbnail.name.toLowerCase() + ' image URL');
    copyButton.addEventListener('click', function () {
      copyWithConfirmation(thumbnail, copyButton);
    });

    actions.append(openLink, saveButton, copyButton);
    body.append(head, actions);
    card.append(previewWrap, body);
    return card;
  }

  function renderThumbnails(meta, thumbs) {
    els.countAll.textContent = String(thumbs.length);
    els.countHd.textContent = String(thumbs.filter(function (item) { return item.category === 'hd'; }).length);
    els.countSd.textContent = String(thumbs.filter(function (item) { return item.category === 'sd'; }).length);

    const fragment = document.createDocumentFragment();
    thumbs.forEach(function (thumbnail) {
      fragment.appendChild(makeCard(thumbnail, meta));
    });
    els.cards.replaceChildren(fragment);
    setFilter(state.filter);
  }

  function setFilter(filter) {
    state.filter = filter;
    els.filterButtons.forEach(function (button) {
      const active = button.dataset.filter === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    Array.from(els.cards.children).forEach(function (card) {
      card.hidden = filter !== 'all' && !card.classList.contains(filter);
    });
  }

  function safeFilename(thumbnail) {
    const title = (state.title || state.videoId || 'youtube-video')
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    return (title || 'youtube-video') + ' - ' + thumbnail.width + 'x' + thumbnail.height + '.jpg';
  }

  function saveBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 20000);
  }

  function openImageFallback(thumbnail) {
    const link = document.createElement('a');
    link.href = thumbnail.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function fetchThumbnailBlob(thumbnail) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      const response = await fetch(thumbnail.url, { signal: controller.signal });
      if (!response.ok) throw new Error('Image request failed');
      return await response.blob();
    } finally {
      clearTimeout(timer);
    }
  }

  async function saveOneThumbnail(thumbnail, button) {
    const filename = safeFilename(thumbnail);
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const blob = await fetchThumbnailBlob(thumbnail);
      saveBlob(blob, filename);
      showToast('Saved ' + thumbnail.width + ' × ' + thumbnail.height + ' thumbnail.');
    } catch (error) {
      openImageFallback(thumbnail);
      showToast('Your browser opened the image. Right-click it and choose “Save image as…”.', 6500);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function downloadAllThumbnails() {
    if (!state.thumbnails.length) return;
    const total = state.thumbnails.length;
    let saved = 0;
    els.downloadAll.disabled = true;
    els.downloadAll.setAttribute('aria-busy', 'true');
    showToast('Saving ' + total + ' thumbnails…', 4000);
    try {
      for (const thumbnail of state.thumbnails) {
        try {
          const blob = await fetchThumbnailBlob(thumbnail);
          saveBlob(blob, safeFilename(thumbnail));
          saved += 1;
        } catch (error) {
          // Keep going; the summary below explains any misses.
        }
        await new Promise(function (resolve) { setTimeout(resolve, 350); });
      }
      if (saved === total) {
        showToast('Saved all ' + total + ' thumbnail sizes.');
      } else if (saved > 0) {
        showToast('Saved ' + saved + ' of ' + total + '. Save the rest individually with their Save button.', 6500);
      } else {
        showToast('Could not save automatically. Use each card’s Save button.', 6500);
      }
    } finally {
      els.downloadAll.disabled = false;
      els.downloadAll.removeAttribute('aria-busy');
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Fall through to the legacy method.
      }
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function copyWithConfirmation(thumbnail, button) {
    const copied = await copyText(thumbnail.url);
    if (!copied) {
      showToast('Copy failed. Select the image URL manually.', 6000);
      return;
    }
    button.textContent = 'Copied';
    button.classList.add('is-copied');
    clearTimeout(copyTimers.get(button));
    copyTimers.set(button, setTimeout(function () {
      button.textContent = 'Copy';
      button.classList.remove('is-copied');
    }, 1600));
    showToast(thumbnail.width + ' × ' + thumbnail.height + ' image URL copied.');
  }

  async function copyAllLinks() {
    if (!state.thumbnails.length) return;
    const text = state.thumbnails.map(function (thumbnail) {
      return thumbnail.name + ' (' + thumbnail.width + ' × ' + thumbnail.height + '): ' + thumbnail.url;
    }).join('\n');
    const copied = await copyText(text);
    if (copied) {
      showToast('Copied ' + state.thumbnails.length + ' image URLs.');
    } else {
      showToast('Copy failed. Open a size and copy its URL from the address bar.', 6000);
    }
  }

  function showToast(message, duration) {
    els.toastMessage.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, duration || 5000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    els.toast.hidden = true;
  }

  async function handleSubmit(event) {
    if (event) event.preventDefault();
    const raw = els.videoUrl.value.trim();
    if (!raw) {
      showResultError('Paste a YouTube video link first.');
      els.videoUrl.focus();
      return;
    }
    const videoId = extractVideoId(raw);
    if (!videoId) {
      updateValidation();
      showResultError('That link does not contain a valid 11-character video ID. Try a watch, youtu.be, Shorts, embed, or live URL.');
      els.videoUrl.focus();
      return;
    }
    if (state.loading) return;

    const token = ++requestSequence;
    state.loading = true;
    state.videoId = videoId;
    state.title = '';
    state.thumbnails = [];
    els.submitBtn.disabled = true;
    els.submitText.textContent = 'Checking sizes…';
    els.resultPanel.setAttribute('aria-busy', 'true');
    els.placeholder.hidden = true;
    els.resultError.hidden = true;
    els.results.hidden = true;
    els.videoPanel.hidden = true;
    els.loading.hidden = false;
    els.resultStatus.textContent = 'Checking which sizes YouTube has for this video…';

    const controller = new AbortController();
    const metaTimeout = setTimeout(function () { controller.abort(); }, 9000);
    let meta;
    let thumbs;
    try {
      const results = await Promise.all([
        fetchVideoMeta(videoId, controller.signal),
        loadThumbnails(videoId)
      ]);
      meta = results[0];
      thumbs = results[1];
    } catch (error) {
      meta = { title: 'YouTube video', authorName: '', authorUrl: '' };
      thumbs = [];
    } finally {
      clearTimeout(metaTimeout);
    }

    if (token !== requestSequence) {
      finishLoading();
      return;
    }

    if (!thumbs.length) {
      state.videoId = null;
      finishLoading();
      updateValidation();
      showResultError('No thumbnail sizes were found for video ' + videoId + '. Check that the video is public, or try another link.');
      return;
    }

    state.title = meta.title;
    state.thumbnails = thumbs;
    renderVideoDetails(meta, thumbs, videoId);
    renderThumbnails(meta, thumbs);
    els.loading.hidden = true;
    els.resultError.hidden = true;
    els.results.hidden = false;
    els.resultStatus.textContent = thumbs.length + ' size' + (thumbs.length === 1 ? '' : 's') + ' available. Choose one to save or copy.';
    els.availabilityNote.textContent = thumbs.length === QUALITIES.length
      ? 'All five common thumbnail sizes are available for this video.'
      : 'YouTube does not store all five sizes for this video — only the available ones are shown.';
    finishLoading();
    updateValidation();

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('url');
      url.searchParams.set('v', videoId);
      window.history.replaceState({}, '', url);
    } catch (error) {
      // History updates are optional.
    }
  }

  function clearAll() {
    els.videoUrl.value = '';
    clearResults();
    updateValidation();
    hideToast();
    els.videoUrl.focus();
  }

  els.form.addEventListener('submit', handleSubmit);
  els.videoUrl.addEventListener('input', function () {
    const id = updateValidation();
    if (els.resultError.hidden === false) {
      resetResultView();
    }
    if (state.videoId && id !== state.videoId && !state.loading) {
      clearResults();
      updateValidation();
    }
    if (!els.videoUrl.value.trim()) {
      clearResults();
      updateValidation();
    }
  });
  els.clearBtn.addEventListener('click', clearAll);
  els.filterButtons.forEach(function (button) {
    button.addEventListener('click', function () { setFilter(button.dataset.filter); });
  });
  els.downloadAll.addEventListener('click', downloadAllThumbnails);
  els.copyAll.addEventListener('click', copyAllLinks);
  els.toastClose.addEventListener('click', hideToast);

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      els.videoUrl.focus();
      els.videoUrl.select();
    }
    if (event.key === 'Escape') {
      if (els.toast.hidden === false) hideToast();
      if (els.videoUrl.value) clearAll();
    }
  });

  (function loadFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('url') || params.get('v');
    if (!value) {
      updateValidation();
      return;
    }
    els.videoUrl.value = value;
    updateValidation();
    handleSubmit();
  })();

  updateValidation();
})();
