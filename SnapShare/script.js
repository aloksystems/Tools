(function () {
  'use strict';

  var DB_NAME = 'snapshare';
  var DB_VERSION = 1;
  var STORE = 'transfers';
  var HISTORY_KEY = 'snapshare_history';
  var MAX_IMAGE = 15 * 1024 * 1024;
  var MAX_VIDEO = 10 * 1024 * 1024;
  var ONE_TIME_DELAY = 15000;

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    files: [],
    expiry: '1h',
    customMinutes: 12,
    current: null,
    activeIndex: 0,
    shareUrl: '',
    timer: null,
    objectUrls: []
  };

  /* ---------- storage ---------- */
  var dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function withStore(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var request = fn(store);
        tx.oncomplete = function () { resolve(request ? request.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function saveTransfer(record) { return withStore('readwrite', function (s) { return s.put(record); }); }
  function readTransfer(id) { return withStore('readonly', function (s) { return s.get(id); }); }
  function dropTransfer(id) { return withStore('readwrite', function (s) { return s.delete(id); }); }
  function allTransfers() { return withStore('readonly', function (s) { return s.getAll(); }); }

  function pruneExpired() {
    return allTransfers().then(function (list) {
      var now = Date.now();
      return Promise.all((list || []).filter(function (t) { return t.expiresAt <= now; }).map(function (t) { return dropTransfer(t.id); }));
    }).catch(function () {});
  }

  /* ---------- helpers ---------- */
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function showStatus(text, kind) {
    var el = $('statusMessage');
    if (!text) { el.hidden = true; return; }
    el.textContent = text;
    el.className = 'status-banner' + (kind ? ' ' + kind : '');
    el.hidden = false;
  }

  function fmtBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function fmtMinutes(minutes) {
    if (minutes >= 60) {
      var h = Math.floor(minutes / 60);
      var m = minutes % 60;
      return m ? h + 'h ' + m + 'm' : h + 'h';
    }
    return minutes + 'm';
  }

  function fmtRemaining(ms) {
    if (ms <= 0) return 'Expired';
    var total = Math.ceil(ms / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    if (m >= 60) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
    return m + 'm ' + (s < 10 ? '0' + s : s) + 's';
  }

  function uid(len) {
    var out = '';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var values = new Uint8Array(len || 8);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(values) : values.forEach(function (_, i) { values[i] = Math.floor(Math.random() * 256); });
    for (var i = 0; i < values.length; i += 1) out += chars[values[i] % chars.length];
    return out;
  }

  function hashPassword(id, password) {
    var input = id + ':' + password;
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('00' + b.toString(16)).slice(-2); }).join('');
      });
    }
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < input.length; i += 1) {
      var c = input.charCodeAt(i);
      h1 = ((h1 ^ c) * 16777619) >>> 0;
      h2 = ((h2 + c) * 2654435761) >>> 0;
    }
    return Promise.resolve(h1.toString(16) + h2.toString(16));
  }

  function objectUrl(blob) {
    var url = URL.createObjectURL(blob);
    state.objectUrls.push(url);
    return url;
  }

  function releaseUrls() {
    state.objectUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    state.objectUrls = [];
  }

  function expiryMinutes() {
    if (state.expiry === '5m') return 5;
    if (state.expiry === '10m') return 10;
    if (state.expiry === '30m') return 30;
    if (state.expiry === '1h') return 60;
    return state.customMinutes;
  }

  function shareLink(id) {
    return location.href.split('#')[0] + '#/s/' + id;
  }

  /* ---------- file picking ---------- */
  function addFiles(list) {
    var incoming = Array.prototype.slice.call(list || []);
    if (!incoming.length) return;
    var errors = [];
    var added = 0;

    incoming.forEach(function (file) {
      var isImage = file.type.indexOf('image/') === 0;
      var isVideo = file.type.indexOf('video/') === 0;
      if (!isImage && !isVideo) { errors.push(file.name + ' is not an image or video.'); return; }
      var limit = isVideo ? MAX_VIDEO : MAX_IMAGE;
      if (file.size > limit) { errors.push(file.name + ' is over ' + (isVideo ? '10' : '15') + 'MB.'); return; }
      var duplicate = state.files.some(function (f) { return f.name === file.name && f.size === file.size && f.type === file.type; });
      if (duplicate) return;
      state.files.push({ id: uid(6), name: file.name, size: file.size, type: file.type, blob: file });
      added += 1;
    });

    if (errors.length) showStatus(errors[0], 'error');
    else if (added) showStatus('', '');
    renderFiles();
  }

  function removeFile(id) {
    state.files = state.files.filter(function (f) { return f.id !== id; });
    renderFiles();
  }

  function renderFiles() {
    var list = $('fileList');
    (state.listUrls || []).forEach(function (url) { URL.revokeObjectURL(url); });
    state.listUrls = [];
    list.innerHTML = '';
    state.files.forEach(function (file) {
      var li = document.createElement('li');
      li.className = 'file-row';

      var thumb = document.createElement('div');
      thumb.className = 'file-thumb';
      var thumbUrl = URL.createObjectURL(file.blob);
      state.listUrls.push(thumbUrl);
      if (file.type.indexOf('video/') === 0) {
        var video = document.createElement('video');
        video.src = thumbUrl;
        video.muted = true;
        video.playsInline = true;
        thumb.appendChild(video);
      } else {
        var img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = '';
        thumb.appendChild(img);
      }

      var meta = document.createElement('div');
      meta.className = 'file-meta';
      var name = document.createElement('p');
      name.className = 'file-name';
      name.textContent = file.name;
      var size = document.createElement('p');
      size.className = 'file-size';
      size.textContent = fmtBytes(file.size);
      meta.appendChild(name);
      meta.appendChild(size);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn';
      remove.setAttribute('aria-label', 'Remove ' + file.name);
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      remove.addEventListener('click', function () { removeFile(file.id); });

      li.appendChild(thumb);
      li.appendChild(meta);
      li.appendChild(remove);
      list.appendChild(li);
    });

    var total = state.files.reduce(function (sum, f) { return sum + f.size; }, 0);
    var summary = $('fileSummary');
    if (state.files.length) {
      summary.textContent = state.files.length + (state.files.length === 1 ? ' file' : ' files') + ' · ' + fmtBytes(total);
      summary.hidden = false;
    } else {
      summary.hidden = true;
    }

    $('createBtn').disabled = !state.files.length;
    updateProfile();
  }

  /* ---------- settings ---------- */
  function updateProfile() {
    var minutes = expiryMinutes();
    var total = state.files.reduce(function (sum, f) { return sum + f.size; }, 0);
    $('profileCount').textContent = String(state.files.length);
    $('profileSize').textContent = fmtBytes(total);
    $('profileExpiry').textContent = fmtMinutes(minutes);
    $('profilePassword').textContent = $('passwordInput').value.trim() ? 'On' : 'Off';
    $('profileOneTime').textContent = $('oneTimeView').checked ? 'On' : 'Off';
    $('profileDownload').textContent = $('blockDownload').checked ? 'Blocked' : 'Allowed';
    $('expiryPreview').textContent = 'Expires in ' + fmtMinutes(minutes);
    var note = $('profileNote');
    if (!state.files.length) note.textContent = 'Add a file to see what your link will do.';
    else if ($('oneTimeView').checked) note.textContent = 'The link self-destructs shortly after it is opened.';
    else note.textContent = 'Ready — the link expires in ' + fmtMinutes(minutes) + '.';
  }

  function bindSettings() {
    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-expiry]'), function (chip) {
      chip.addEventListener('click', function () {
        state.expiry = chip.getAttribute('data-expiry');
        Array.prototype.forEach.call(document.querySelectorAll('.chip[data-expiry]'), function (other) {
          var on = other === chip;
          other.classList.toggle('is-active', on);
          other.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        $('customExpiryRow').hidden = state.expiry !== 'custom';
        updateProfile();
      });
    });

    $('customMinutes').addEventListener('input', function () {
      var value = parseInt(this.value, 10);
      if (!isFinite(value) || value < 1) value = 1;
      if (value > 60) value = 60;
      state.customMinutes = value;
      updateProfile();
    });

    ['passwordInput', 'oneTimeView', 'selfDestruct', 'blockDownload', 'hideFilenames'].forEach(function (id) {
      $(id).addEventListener('input', updateProfile);
      $(id).addEventListener('change', updateProfile);
    });
  }

  /* ---------- create ---------- */
  function createShare() {
    if (!state.files.length) return;
    var slug = $('slugInput').value.trim();
    if (slug && !/^[A-Za-z0-9-]{3,32}$/.test(slug)) {
      showStatus('Link name needs 3–32 letters, numbers, or dashes.', 'error');
      return;
    }

    var id = slug || uid(8);
    var password = $('passwordInput').value.trim();
    var minutes = expiryMinutes();

    readTransfer(id).then(function (existing) {
      if (existing && existing.expiresAt > Date.now()) {
        showStatus('That link name is already in use. Pick another.', 'error');
        return null;
      }
      return hashPassword(id, password || '').then(function (hash) {
        var record = {
          id: id,
          createdAt: Date.now(),
          expiresAt: Date.now() + minutes * 60000,
          files: state.files.map(function (f) { return { id: f.id, name: f.name, size: f.size, type: f.type, blob: f.blob }; }),
          passwordHash: password ? hash : null,
          oneTimeView: $('oneTimeView').checked,
          selfDestruct: $('selfDestruct').checked,
          allowDownload: !$('blockDownload').checked,
          hideFilename: $('hideFilenames').checked,
          openedAt: null
        };
        return saveTransfer(record).then(function () {
          addHistory(record);
          resetForm();
          toast('Secure link created');
          navigate('#/s/' + id);
        });
      });
    }).catch(function (err) {
      showStatus('Could not create the share: ' + (err && err.message ? err.message : 'storage error') + '.', 'error');
    });
  }

  function resetForm() {
    state.files = [];
    renderFiles();
    $('passwordInput').value = '';
    $('slugInput').value = '';
    $('oneTimeView').checked = false;
    $('selfDestruct').checked = false;
    $('blockDownload').checked = false;
    $('hideFilenames').checked = false;
    updateProfile();
  }

  function addHistory(record) {
    var list = readHistory();
    list.unshift({
      id: record.id,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      filesCount: record.files.length,
      passwordProtected: !!record.passwordHash
    });
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30))); } catch (e) {}
    renderHistory();
  }

  function readHistory() {
    try {
      var list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (!Array.isArray(list)) return [];
      var now = Date.now();
      return list.filter(function (item) { return item && item.expiresAt > now; });
    } catch (e) { return []; }
  }

  function renderHistory() {
    var list = readHistory();
    var wrap = $('historyList');
    wrap.innerHTML = '';
    $('historyEmpty').hidden = list.length > 0;

    list.forEach(function (item) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.className = 'history-item';
      link.href = '#/s/' + item.id;

      var main = document.createElement('span');
      main.className = 'history-item-main';
      var id = document.createElement('span');
      id.className = 'history-id';
      id.textContent = '/s/' + item.id;
      var meta = document.createElement('span');
      meta.className = 'history-meta';
      meta.textContent = item.filesCount + (item.filesCount === 1 ? ' file' : ' files') + ' · ' + (item.passwordProtected ? 'Password' : 'No password');
      main.appendChild(id);
      main.appendChild(meta);

      var time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = fmtRemaining(item.expiresAt - Date.now());

      link.appendChild(main);
      link.appendChild(time);
      li.appendChild(link);
      wrap.appendChild(li);
    });
  }

  /* ---------- routing ---------- */
  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function route() {
    var match = location.hash.match(/^#\/s\/([A-Za-z0-9-]+)/);
    cleanupShare();
    if (match) {
      $('viewHome').hidden = true;
      $('viewShare').hidden = false;
      openShare(match[1]);
    } else {
      $('viewShare').hidden = true;
      $('viewHome').hidden = false;
      renderHistory();
      updateProfile();
    }
  }

  function cleanupShare() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (state.oneTimeTimer) { clearTimeout(state.oneTimeTimer); state.oneTimeTimer = null; }
    if (state.stageUrl) { URL.revokeObjectURL(state.stageUrl); state.stageUrl = null; }
    releaseUrls();
    state.current = null;
    state.activeIndex = 0;
    $('shareLoading').hidden = false;
    $('shareGate').hidden = true;
    $('shareContent').hidden = true;
    $('shareExpired').hidden = true;
    $('gatePassword').value = '';
    $('gateError').hidden = true;
  }

  /* ---------- share view ---------- */
  function openShare(id) {
    readTransfer(id).then(function (record) {
      if (!record) { showExpired(); return; }
      if (record.expiresAt <= Date.now()) {
        dropTransfer(id);
        showExpired();
        return;
      }
      state.current = record;
      if (record.passwordHash) {
        $('shareLoading').hidden = true;
        $('shareGate').hidden = false;
        $('gatePassword').focus();
      } else {
        renderShare();
      }
    }).catch(function () {
      showExpired();
    });
  }

  function showExpired() {
    $('shareLoading').hidden = true;
    $('shareGate').hidden = true;
    $('shareContent').hidden = true;
    $('shareExpired').hidden = false;
  }

  function renderShare() {
    var record = state.current;
    $('shareLoading').hidden = true;
    $('shareGate').hidden = true;
    $('shareExpired').hidden = true;
    $('shareContent').hidden = false;

    $('assetCount').textContent = record.files.length + (record.files.length === 1 ? ' ASSET' : ' ASSETS');
    $('secPassword').textContent = record.passwordHash ? 'Protected' : 'None';
    $('secOneTime').textContent = record.oneTimeView ? 'On' : 'Off';
    $('secDownload').textContent = record.allowDownload ? 'Allowed' : 'Blocked';
    $('secNames').textContent = record.hideFilename ? 'Hidden' : 'Original';
    $('secExpiry').textContent = fmtMinutes(Math.max(1, Math.round((record.expiresAt - Date.now()) / 60000)));
    $('downloadBtn').disabled = !record.allowDownload;
    $('downloadBtn').title = record.allowDownload ? '' : 'Downloads are disabled for this transfer';

    renderThumbs();
    selectAsset(0);
    updateCountdown();
    state.timer = setInterval(updateCountdown, 1000);

    if (record.oneTimeView) {
      $('oneTimeNote').hidden = false;
      if (!record.openedAt) {
        record.openedAt = Date.now();
        saveTransfer(record).catch(function () {});
      }
      var remaining = Math.max(0, record.openedAt + ONE_TIME_DELAY - Date.now());
      $('oneTimeText').textContent = 'One-time view — this transfer will be deleted in ' + Math.ceil(remaining / 1000) + 's.';
      scheduleOneTimeDelete(remaining);
    } else {
      $('oneTimeNote').hidden = true;
    }
  }

  function scheduleOneTimeDelete(remaining) {
    if (state.oneTimeTimer) clearTimeout(state.oneTimeTimer);
    state.oneTimeTimer = setTimeout(function () {
      var record = state.current;
      if (record) {
        dropTransfer(record.id).catch(function () {});
        toast('Transfer deleted after one-time view');
        navigate('#/');
      }
    }, remaining);

    var tick = setInterval(function () {
      var record = state.current;
      if (!record || !record.oneTimeView) { clearInterval(tick); return; }
      var left = Math.max(0, record.openedAt + ONE_TIME_DELAY - Date.now());
      $('oneTimeText').textContent = 'One-time view — this transfer will be deleted in ' + Math.ceil(left / 1000) + 's.';
      if (left <= 0) clearInterval(tick);
    }, 1000);
  }

  function displayName(file, index) {
    var record = state.current;
    if (!record.hideFilename) return file.name;
    var ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    return 'Asset_' + (index + 1) + '.' + ext;
  }

  function renderThumbs() {
    var record = state.current;
    var strip = $('thumbStrip');
    strip.innerHTML = '';
    record.files.forEach(function (file, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb-btn' + (index === 0 ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      btn.setAttribute('aria-label', displayName(file, index));
      if (file.type.indexOf('video/') === 0) {
        var v = document.createElement('video');
        v.src = objectUrl(file.blob);
        v.muted = true;
        v.playsInline = true;
        btn.appendChild(v);
      } else {
        var i = document.createElement('img');
        i.src = objectUrl(file.blob);
        i.alt = '';
        btn.appendChild(i);
      }
      btn.addEventListener('click', function () { selectAsset(index); });
      strip.appendChild(btn);
    });
  }

  function selectAsset(index) {
    var record = state.current;
    if (!record) return;
    var file = record.files[index];
    if (!file) return;
    state.activeIndex = index;

    var image = $('stageImage');
    var video = $('stageVideo');
    var placeholder = $('stagePlaceholder');
    image.hidden = true;
    video.hidden = true;
    video.pause();
    placeholder.hidden = true;
    image.removeAttribute('src');
    video.removeAttribute('src');

    if (state.stageUrl) URL.revokeObjectURL(state.stageUrl);
    var url = URL.createObjectURL(file.blob);
    state.stageUrl = url;
    if (file.type.indexOf('video/') === 0) {
      video.src = url;
      video.hidden = false;
    } else {
      image.src = url;
      image.alt = displayName(file, index);
      image.hidden = false;
    }

    Array.prototype.forEach.call(document.querySelectorAll('.thumb-btn'), function (btn, i) {
      var on = i === index;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function updateCountdown() {
    var record = state.current;
    if (!record) return;
    var left = record.expiresAt - Date.now();
    if (left <= 0) {
      dropTransfer(record.id).catch(function () {});
      clearInterval(state.timer);
      state.timer = null;
      toast('Transfer expired');
      showExpired();
      return;
    }
    $('shareExpiry').textContent = 'Expires in ' + fmtRemaining(left);
  }

  function downloadCurrent() {
    var record = state.current;
    if (!record || !record.allowDownload) return;
    var file = record.files[state.activeIndex];
    if (!file) return;
    var a = document.createElement('a');
    var url = URL.createObjectURL(file.blob);
    a.href = url;
    a.download = displayName(file, state.activeIndex);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Download started');
    if (record.selfDestruct) {
      setTimeout(function () {
        dropTransfer(record.id).catch(function () {});
        toast('Transfer deleted after download');
        navigate('#/');
      }, 600);
    }
  }

  function deleteCurrent() {
    var record = state.current;
    if (!record) return;
    if (!window.confirm('Delete this transfer now? The link will stop working.')) return;
    dropTransfer(record.id).catch(function () {});
    toast('Transfer deleted');
    navigate('#/');
  }

  function copyLink() {
    var record = state.current;
    if (!record) return;
    var url = shareLink(record.id);
    var done = function () { toast('Share link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link', url); });
    } else {
      window.prompt('Copy this link', url);
    }
  }

  /* ---------- events ---------- */
  function bindHome() {
    var dropArea = $('dropArea');
    var input = $('fileInput');

    input.addEventListener('change', function () {
      addFiles(input.files);
      input.value = '';
    });

    $('chooseBtn').addEventListener('click', function (event) {
      event.stopPropagation();
      input.click();
    });

    dropArea.addEventListener('click', function () { input.click(); });
    dropArea.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
    ['dragenter', 'dragover'].forEach(function (type) {
      dropArea.addEventListener(type, function (event) {
        event.preventDefault();
        dropArea.classList.add('active');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (type) {
      dropArea.addEventListener(type, function (event) {
        event.preventDefault();
        dropArea.classList.remove('active');
      });
    });
    dropArea.addEventListener('drop', function (event) {
      if (event.dataTransfer && event.dataTransfer.files) addFiles(event.dataTransfer.files);
    });

    document.addEventListener('paste', function (event) {
      if ($('viewHome').hidden) return;
      var items = event.clipboardData && event.clipboardData.items;
      if (!items) return;
      var files = [];
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].type.indexOf('image/') === 0) {
          var file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length) addFiles(files);
    });

    $('createBtn').addEventListener('click', createShare);
  }

  function bindShare() {
    $('gateForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var record = state.current;
      if (!record) return;
      var attempt = $('gatePassword').value;
      hashPassword(record.id, attempt).then(function (hash) {
        if (hash === record.passwordHash) {
          $('gateError').hidden = true;
          renderShare();
        } else {
          $('gateError').hidden = false;
          $('gatePassword').select();
        }
      });
    });

    $('copyLinkBtn').addEventListener('click', copyLink);
    $('downloadBtn').addEventListener('click', downloadCurrent);
    $('deleteBtn').addEventListener('click', deleteCurrent);

    window.addEventListener('hashchange', route);
  }

  function init() {
    bindHome();
    bindShare();
    bindSettings();
    pruneExpired();
    renderFiles();
    renderHistory();
    updateProfile();
    route();
    setInterval(function () {
      if ($('viewHome').hidden) return;
      renderHistory();
    }, 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
