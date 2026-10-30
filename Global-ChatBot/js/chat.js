/* Global Chat — chat page
   Wires the RTDB message stream, presence, typing, reactions, replies,
   edits, deletes and the account drawer to chat.html. */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var cfg = window.APP_FIREBASE_CONFIG || {};
  var configMissing = !cfg.apiKey || !cfg.projectId ||
    String(cfg.apiKey).indexOf('REPLACE_WITH') !== -1 ||
    String(cfg.projectId).indexOf('YOUR_PROJECT') !== -1;

  var els = {};
  var auth = null;
  var rtdb = null;
  var firestore = null;
  var storage = null;

  var rawRoomId = new URLSearchParams(window.location.search).get('room') || '';
  var roomId = /^[A-Za-z0-9_-]{6,64}$/.test(rawRoomId) ? rawRoomId : null;

  var state = {
    user: null,
    started: false,
    redirecting: false,
    authErrored: false,
    messages: new Map(),
    hidden: new Set(),
    messagesPath: roomId ? 'room_messages/' + roomId : 'global_messages',
    typingPath: roomId ? 'typing/rooms/' + roomId : 'typing/global',
    optionsKey: null,
    editKey: null,
    reply: null,
    emojiMode: null,
    reactionKey: null,
    firstRender: true,
    renderQueued: false,
    typingTimer: null,
    typingSent: false,
    messagesErrorShown: false,
    onlineCount: 0
  };

  /* ---------- Small helpers ---------- */

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function displayNameOf(user) {
    if (!user) return 'Anonymous';
    if (user.displayName) return user.displayName;
    if (user.email) return user.email.split('@')[0];
    return 'Anonymous';
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function safeIcon(icon) {
    return /^fa-[a-z0-9-]+$/.test(String(icon || '')) ? icon : '';
  }

  function toMillis(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    var n = Number(value);
    return isFinite(n) ? n : Date.now();
  }

  function formatTime(ts) {
    return new Date(toMillis(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function dateLabel(ts) {
    var date = new Date(toMillis(ts));
    var today = new Date();
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function normalizeMessage(raw) {
    var m = raw && typeof raw === 'object' ? raw : {};
    var sender = m.sender || m.displayName || 'Unknown';
    var text = typeof m.text === 'string' ? m.text : (typeof m.message === 'string' ? m.message : '');
    return {
      uid: m.uid || '',
      sender: sender,
      text: text,
      timestamp: toMillis(m.timestamp),
      reactions: m.reactions && typeof m.reactions === 'object' ? m.reactions : null,
      replyTo: m.replyTo || null,
      replyToName: m.replyToName || null,
      replyToText: m.replyToText || null,
      deleted: m.deleted === true,
      edited: m.edited === true
    };
  }

  function formatMessageHTML(text) {
    var escaped = escapeHTML(text);
    var linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, function (url) {
      var clean = url.replace(/[.,;:!?)]+$/, '');
      var trailing = url.slice(clean.length);
      return '<a href="' + clean + '" target="_blank" rel="noopener noreferrer">' + clean + '</a>' + trailing;
    });
    return linked
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  /* ---------- Toasts ---------- */

  function showNotification(message, type) {
    if (!message) return;
    var container = els.toasts || $('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.className = 'gc-toasts';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'gc-toast' + (type === 'error' ? ' error' : '');
    var icon = document.createElement('i');
    icon.className = type === 'error' ? 'fas fa-circle-exclamation' : 'fas fa-circle-check';
    icon.setAttribute('aria-hidden', 'true');
    var text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);
    window.setTimeout(function () {
      toast.classList.add('is-leaving');
      window.setTimeout(function () { toast.remove(); }, 220);
    }, 4200);
  }

  /* ---------- Theme ---------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (els.themeToggle) els.themeToggle.checked = theme === 'dark';
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem('tools-theme'); } catch (e) {}
    var theme = (stored === 'dark' || stored === 'light')
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    if (els.themeToggle) {
      els.themeToggle.addEventListener('change', function () {
        var next = els.themeToggle.checked ? 'dark' : 'light';
        applyTheme(next);
        try { localStorage.setItem('tools-theme', next); } catch (e) {}
      });
    }
  }

  /* ---------- Notice / locked states ---------- */

  function setComposerEnabled(enabled) {
    if (els.messageInput) {
      els.messageInput.disabled = !enabled;
      els.messageInput.placeholder = enabled ? 'Type a message…' : 'Chat unavailable';
    }
    if (els.sendBtn) els.sendBtn.disabled = !enabled;
    if (els.emojiBtn) els.emojiBtn.disabled = !enabled;
  }

  function showLockedNotice(options) {
    if (!els.messages) return;
    var wrap = document.createElement('div');
    wrap.className = 'gc-empty';
    wrap.style.margin = '28px auto';
    wrap.style.maxWidth = '420px';

    var iconWrap = document.createElement('div');
    iconWrap.className = 'gc-empty-icon';
    var icon = document.createElement('i');
    icon.className = 'fas ' + (options.icon || 'fa-circle-exclamation');
    icon.setAttribute('aria-hidden', 'true');
    iconWrap.appendChild(icon);

    var title = document.createElement('h3');
    title.textContent = options.title || 'Chat unavailable';
    var text = document.createElement('p');
    text.textContent = options.text || '';

    wrap.appendChild(iconWrap);
    wrap.appendChild(title);
    wrap.appendChild(text);

    if (options.action) {
      var btn = document.createElement('a');
      btn.className = 'gc-btn gc-btn-primary';
      btn.href = options.href || 'dashboard.html';
      btn.textContent = options.action;
      wrap.appendChild(btn);
    }

    els.messages.replaceChildren(wrap);
  }

  function showConfigNotice() {
    showLockedNotice({
      icon: 'fa-plug-circle-xmark',
      title: 'Firebase is not configured',
      text: 'Add the project config to Global-ChatBot/js/firebase-config.js, then reload this page.',
      action: 'All chats',
      href: 'dashboard.html'
    });
    setComposerEnabled(false);
  }

  function showAuthNotice(error) {
    var code = error && error.code ? error.code : '';
    var text = 'Could not reach the sign-in service. Check your connection and reload.';
    if (code === 'auth/configuration-not-found' || /configuration/i.test(error && error.message || '')) {
      text = 'Sign-in is not enabled for this Firebase project yet. Enable Authentication in the Firebase console, then reload.';
    }
    showLockedNotice({
      icon: 'fa-user-lock',
      title: 'Sign-in unavailable',
      text: text,
      action: 'Back to sign in',
      href: 'login.html'
    });
    setComposerEnabled(false);
  }

  /* ---------- Avatars / profile paint ---------- */

  function paintAvatar(el, user) {
    if (!el) return;
    el.replaceChildren();
    if (user && user.photoURL) {
      var img = document.createElement('img');
      img.src = user.photoURL;
      img.alt = '';
      el.appendChild(img);
    } else {
      el.textContent = initials(displayNameOf(user));
    }
  }

  function paintUser() {
    if (!state.user) return;
    if (els.username) els.username.textContent = displayNameOf(state.user);
    if (els.userEmail) els.userEmail.textContent = state.user.email || '';
    paintAvatar(els.profilePic, state.user);
    if (els.displayUsername) els.displayUsername.textContent = displayNameOf(state.user);
    if (els.displayEmail) els.displayEmail.textContent = state.user.email || '';
    paintAvatar(els.picContainer, state.user);
  }

  /* ---------- Drawer & modals ---------- */

  function openDrawer() {
    if (!els.sideMenu) return;
    closeFloating();
    els.sideMenu.classList.add('active');
    if (els.menuOverlay) els.menuOverlay.classList.add('active');
    if (els.openMenuBtn) els.openMenuBtn.setAttribute('aria-expanded', 'true');
    if (els.menuClose) els.menuClose.focus();
  }

  function closeDrawer() {
    if (!els.sideMenu) return;
    els.sideMenu.classList.remove('active');
    if (els.menuOverlay) els.menuOverlay.classList.remove('active');
    if (els.openMenuBtn) els.openMenuBtn.setAttribute('aria-expanded', 'false');
  }

  function openModal(modal) {
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('is-open');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.style.display = 'none';
  }

  function showFadeModal(modal) {
    if (!modal) return;
    window.clearTimeout(modal._hideTimer);
    modal.style.display = 'flex';
    window.requestAnimationFrame(function () { modal.style.opacity = '1'; });
  }

  function hideFadeModal(modal) {
    if (!modal) return;
    modal.style.opacity = '0';
    window.clearTimeout(modal._hideTimer);
    modal._hideTimer = window.setTimeout(function () { modal.style.display = 'none'; }, 220);
  }

  function anyModalOpen() {
    return [els.profileModal, els.aboutModal, els.editModal].some(function (modal) {
      return modal && modal.classList.contains('is-open');
    }) || (els.deleteModal && els.deleteModal.style.display === 'flex') ||
      (els.deleteForMeModal && els.deleteForMeModal.classList.contains('active'));
  }

  function bindModalDismiss(modal, closeFn) {
    if (!modal) return;
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeFn();
    });
  }

  function bindChrome() {
    if (els.menuButton) {
      els.menuButton.addEventListener('click', function () {
        window.location.assign('dashboard.html');
      });
    }
    if (els.openMenuBtn) els.openMenuBtn.addEventListener('click', openDrawer);
    if (els.menuClose) els.menuClose.addEventListener('click', closeDrawer);
    if (els.menuOverlay) els.menuOverlay.addEventListener('click', closeDrawer);

    if (els.profileSettingsBtn) {
      els.profileSettingsBtn.addEventListener('click', function () {
        closeDrawer();
        paintUser();
        openModal(els.profileModal);
      });
    }
    if (els.aboutBtn) {
      els.aboutBtn.addEventListener('click', function () {
        closeDrawer();
        openModal(els.aboutModal);
      });
    }
    if (els.returnDashboardBtn) {
      els.returnDashboardBtn.addEventListener('click', function () {
        window.location.assign('dashboard.html');
      });
    }
    if (els.copyRoomIdBtn) els.copyRoomIdBtn.addEventListener('click', copyRoomId);
    if (els.leaveRoomBtn) els.leaveRoomBtn.addEventListener('click', confirmLeaveRoom);
    if (els.logoutBtn) els.logoutBtn.addEventListener('click', logout);
    if (els.logoutProfileBtn) els.logoutProfileBtn.addEventListener('click', logout);

    if (els.closeProfileBtn) els.closeProfileBtn.addEventListener('click', function () { closeModal(els.profileModal); });
    if (els.closeAboutBtn) els.closeAboutBtn.addEventListener('click', function () { closeModal(els.aboutModal); });
    bindModalDismiss(els.profileModal, function () { closeModal(els.profileModal); });
    bindModalDismiss(els.aboutModal, function () { closeModal(els.aboutModal); });
    bindModalDismiss(els.editModal, closeEditModal);

    if (els.editUsernameBtn) els.editUsernameBtn.addEventListener('click', startUsernameEdit);
    if (els.changePicBtn) els.changePicBtn.addEventListener('click', function () { els.picInput.click(); });
    if (els.picInput) els.picInput.addEventListener('change', handlePhotoSelected);

    if (els.cancelEditBtn) els.cancelEditBtn.addEventListener('click', closeEditModal);
    if (els.saveEditBtn) els.saveEditBtn.addEventListener('click', saveEdit);

    if (els.cancelDeleteBtn) els.cancelDeleteBtn.addEventListener('click', function () { hideFadeModal(els.deleteModal); });
    if (els.confirmDeleteBtn) {
      els.confirmDeleteBtn.addEventListener('click', function () {
        var key = els.deleteModal.dataset.messageKey;
        hideFadeModal(els.deleteModal);
        if (key) deleteForEveryone(key);
      });
    }
    if (els.deleteModal) {
      els.deleteModal.addEventListener('click', function (event) {
        if (event.target === els.deleteModal) hideFadeModal(els.deleteModal);
      });
    }

    if (els.cancelDeleteForMeBtn) {
      els.cancelDeleteForMeBtn.addEventListener('click', function () {
        if (els.deleteForMeModal) els.deleteForMeModal.classList.remove('active');
        state.optionsKey = null;
      });
    }
    if (els.confirmDeleteForMeBtn) {
      els.confirmDeleteForMeBtn.addEventListener('click', function () {
        var key = state.optionsKey;
        if (els.deleteForMeModal) els.deleteForMeModal.classList.remove('active');
        if (key) hideForMe(key);
      });
    }
    if (els.deleteForMeModal) {
      els.deleteForMeModal.addEventListener('click', function (event) {
        if (event.target === els.deleteForMeModal) els.deleteForMeModal.classList.remove('active');
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (anyModalOpen()) {
        closeModal(els.profileModal);
        closeModal(els.aboutModal);
        closeEditModal();
        hideFadeModal(els.deleteModal);
        if (els.deleteForMeModal) els.deleteForMeModal.classList.remove('active');
        return;
      }
      if (els.sideMenu && els.sideMenu.classList.contains('active')) {
        closeDrawer();
        return;
      }
      closeFloating();
    });
  }

  function logout() {
    if (!auth) return;
    auth.signOut().then(function () {
      state.redirecting = true;
      window.location.replace('login.html');
    }).catch(function (error) {
      console.error('Sign out failed', error);
      showNotification('Could not sign out. Try again.', 'error');
    });
  }

  /* ---------- Username ---------- */

  function startUsernameEdit() {
    if (!state.user) return;
    if ($('username-edit-input')) return;
    var strong = els.displayUsername;
    if (!strong) return;

    var current = displayNameOf(state.user);
    var input = document.createElement('input');
    input.id = 'username-edit-input';
    input.className = 'gc-input';
    input.value = current;
    input.maxLength = 40;
    input.setAttribute('aria-label', 'Username');

    strong.hidden = true;
    strong.insertAdjacentElement('afterend', input);
    input.focus();
    input.select();

    var finished = false;
    function finish(save) {
      if (finished) return;
      finished = true;
      var next = input.value.trim();
      input.remove();
      strong.hidden = false;
      if (!save || !next || next === current || !state.user) return;
      if (next.length < 2) {
        showNotification('Username needs at least 2 characters.', 'error');
        return;
      }
      state.user.updateProfile({ displayName: next }).then(function () {
        if (els.username) els.username.textContent = next;
        strong.textContent = next;
        if (rtdb) rtdb.ref('online/' + state.user.uid + '/displayName').set(next).catch(function () {});
        showNotification('Username updated.');
      }).catch(function (error) {
        console.error('Username update failed', error);
        showNotification('Could not update the username.', 'error');
      });
    }

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', function () { finish(true); });
  }

  /* ---------- Profile photo ---------- */

  var PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  var PHOTO_LIMIT = 2 * 1024 * 1024;

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function squareThumbnail(img) {
    return new Promise(function (resolve) {
      var size = 320;
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      var side = Math.min(img.width, img.height);
      var sx = (img.width - side) / 2;
      var sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', 0.86);
    });
  }

  function handlePhotoSelected(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!state.user) return;
    if (PHOTO_TYPES.indexOf(file.type) === -1) {
      showNotification('Use a JPG, PNG, GIF or WEBP image.', 'error');
      return;
    }
    if (file.size > PHOTO_LIMIT) {
      showNotification('Image must be smaller than 2 MB.', 'error');
      return;
    }
    if (!storage) {
      showNotification('Photo upload needs Firebase Storage.', 'error');
      return;
    }

    if (els.changePicBtn) els.changePicBtn.disabled = true;
    readFile(file)
      .then(loadImage)
      .then(squareThumbnail)
      .then(function (blob) {
        if (!blob) throw new Error('Could not process the image');
        var ref = storage.ref().child('profile_pics/' + state.user.uid + '.jpg');
        return ref.put(blob, { contentType: 'image/jpeg' }).then(function (snapshot) {
          return snapshot.ref.getDownloadURL();
        });
      })
      .then(function (url) {
        return state.user.updateProfile({ photoURL: url }).then(function () {
          paintUser();
          if (rtdb) rtdb.ref('online/' + state.user.uid + '/photoURL').set(url).catch(function () {});
          showNotification('Profile photo updated.');
        });
      })
      .catch(function (error) {
        console.error('Photo update failed', error);
        showNotification('Could not update the photo. Check Storage rules.', 'error');
      })
      .then(function () {
        if (els.changePicBtn) els.changePicBtn.disabled = false;
      });
  }

  /* ---------- Room helpers ---------- */

  function copyRoomId() {
    if (!roomId) return;
    function done() { showNotification('Room ID copied.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(roomId).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      var temp = document.createElement('textarea');
      temp.value = roomId;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      temp.remove();
      if (ok) done();
      else showNotification('Could not copy the room ID.', 'error');
    }
  }

  function confirmLeaveRoom() {
    if (!roomId || !firestore || !state.user) return;
    var overlay = document.createElement('div');
    overlay.className = 'confirmation-modal-overlay active';
    var content = document.createElement('div');
    content.className = 'confirmation-modal-content';
    content.setAttribute('role', 'alertdialog');
    content.setAttribute('aria-modal', 'true');

    var title = document.createElement('p');
    title.textContent = 'Leave this room?';
    var note = document.createElement('div');
    note.className = 'confirmation-modal-note';
    note.textContent = 'You can rejoin anytime from All chats.';

    var actions = document.createElement('div');
    actions.className = 'confirmation-modal-actions';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'confirmation-modal-button cancel';
    cancel.textContent = 'Cancel';
    var confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'confirmation-modal-button confirm';
    confirm.textContent = 'Leave room';
    actions.append(cancel, confirm);
    content.append(title, note, actions);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    function onKey(event) {
      if (event.key === 'Escape') close();
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    document.addEventListener('keydown', onKey);
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    confirm.addEventListener('click', function () {
      close();
      leaveRoom();
    });
    confirm.focus();
  }

  function leaveRoom() {
    if (!roomId || !firestore || !state.user) return;
    var uid = state.user.uid;
    firestore.collection('users').doc(uid).collection('rooms').doc(roomId).delete()
      .then(function () {
        if (rtdb) rtdb.ref('room_members/' + roomId + '/' + uid).remove().catch(function () {});
        showNotification('You left the room.');
        window.setTimeout(function () { window.location.assign('dashboard.html'); }, 500);
      })
      .catch(function (error) {
        console.error('Leave room failed', error);
        showNotification('Could not leave the room. Try again.', 'error');
      });
  }

  function setHeader(name, icon) {
    if (els.chatName) els.chatName.textContent = name;
    if (!els.chatAvatar) return;
    els.chatAvatar.replaceChildren();
    var i = document.createElement('i');
    i.className = 'fas ' + (safeIcon(icon) || 'fa-globe');
    i.setAttribute('aria-hidden', 'true');
    els.chatAvatar.appendChild(i);
  }

  function setupRoom() {
    if (!roomId) {
      document.title = 'Global Chat — Chat';
      setHeader('Global Chat', 'fa-globe');
      return Promise.resolve(true);
    }
    return firestore.collection('rooms').doc(roomId).get().then(function (snap) {
      if (!snap.exists) {
        showLockedNotice({
          icon: 'fa-circle-question',
          title: 'Room not found',
          text: 'This chat room does not exist or was deleted.',
          action: 'All chats',
          href: 'dashboard.html'
        });
        setComposerEnabled(false);
        return false;
      }
      var room = snap.data() || {};
      var name = room.name || 'Room';
      document.title = name + ' — Global Chat';
      setHeader(name, room.icon || 'fa-users');

      if (els.roomIdRow) els.roomIdRow.hidden = false;
      if (els.roomIdDivider) els.roomIdDivider.hidden = false;
      if (els.roomIdValue) els.roomIdValue.textContent = roomId;
      if (els.leaveRoomBtn) els.leaveRoomBtn.hidden = false;

      return firestore.collection('users').doc(state.user.uid).collection('rooms').doc(roomId).get()
        .then(function (memberSnap) {
          if (memberSnap.exists) {
            if (rtdb) rtdb.ref('room_members/' + roomId + '/' + state.user.uid).set(true).catch(function () {});
            return true;
          }
          showLockedNotice({
            icon: 'fa-lock',
            title: 'You are not a member',
            text: 'Join this room from All chats before opening it.',
            action: 'All chats',
            href: 'dashboard.html'
          });
          setComposerEnabled(false);
          return false;
        });
    }).catch(function (error) {
      console.error('Room load failed', error);
      showLockedNotice({
        icon: 'fa-plug-circle-xmark',
        title: 'Could not open this room',
        text: 'Check your connection and reload the page.',
        action: 'All chats',
        href: 'dashboard.html'
      });
      setComposerEnabled(false);
      return false;
    });
  }

  /* ---------- Presence & typing ---------- */

  function setupPresence() {
    if (!rtdb || !state.user) return;
    var ref = rtdb.ref('online/' + state.user.uid);
    ref.set({
      displayName: displayNameOf(state.user),
      photoURL: state.user.photoURL || null,
      lastOnline: firebase.database.ServerValue.TIMESTAMP
    }).catch(function (error) { console.warn('Presence write failed', error); });
    ref.onDisconnect().remove();

    rtdb.ref('online').on('value', function (snapshot) {
      state.onlineCount = snapshot.numChildren();
      if (els.onlineDisplay) {
        els.onlineDisplay.textContent = state.onlineCount > 0 ? state.onlineCount + ' online' : '';
      }
    }, function () {});
  }

  function setTyping(isTyping) {
    if (!rtdb || !state.user) return;
    if (state.typingSent === isTyping) return;
    state.typingSent = isTyping;
    var ref = rtdb.ref(state.typingPath + '/' + state.user.uid);
    if (isTyping) {
      ref.set({
        uid: state.user.uid,
        displayName: displayNameOf(state.user),
        timestamp: firebase.database.ServerValue.TIMESTAMP
      }).catch(function () {});
      ref.onDisconnect().remove();
    } else {
      ref.remove().catch(function () {});
    }
  }

  function bindComposer() {
    if (els.messageInput) {
      els.messageInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });
      els.messageInput.addEventListener('input', function () {
        var hasText = els.messageInput.value.trim().length > 0;
        if (hasText) {
          setTyping(true);
          window.clearTimeout(state.typingTimer);
          state.typingTimer = window.setTimeout(function () { setTyping(false); }, 2500);
        } else {
          setTyping(false);
          window.clearTimeout(state.typingTimer);
        }
      });
    }
    if (els.sendBtn) els.sendBtn.addEventListener('click', sendMessage);
    if (els.cancelReplyBtn) els.cancelReplyBtn.addEventListener('click', cancelReply);
    if (els.emojiBtn) {
      els.emojiBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        if (els.emojiPicker && els.emojiPicker.classList.contains('active') && state.emojiMode === 'composer') {
          closeFloating();
          return;
        }
        openEmojiPicker('composer', null, els.emojiBtn.getBoundingClientRect());
      });
    }
  }

  function startTypingIndicator() {
    if (!rtdb || !state.user) return;
    rtdb.ref(state.typingPath).on('value', function (snapshot) {
      if (!state.user) return;
      var name = '';
      snapshot.forEach(function (child) {
        if (child.key === state.user.uid) return;
        var data = child.val();
        if (data && typeof data === 'object') {
          name = data.displayName || 'Someone';
          return true;
        }
      });
      if (els.typingUsername) els.typingUsername.textContent = name ? name + ' is typing' : '';
      if (els.typingIndicator) els.typingIndicator.classList.toggle('active', !!name);
    }, function () {});
  }

  /* ---------- Messages ---------- */

  function scheduleRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    window.requestAnimationFrame(function () {
      state.renderQueued = false;
      renderMessages();
    });
  }

  function scrollToBottom() {
    if (!els.messages) return;
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function isNearBottom() {
    if (!els.messages) return true;
    return els.messages.scrollTop + els.messages.clientHeight > els.messages.scrollHeight - 160;
  }

  function renderMessages() {
    if (!els.messages) return;
    closeMessageOptions();

    var stick = state.firstRender || isNearBottom();
    var previousTop = els.messages.scrollTop;

    var list = Array.prototype.slice.call(state.messages.entries()).sort(function (a, b) {
      var diff = toMillis(a[1] && a[1].timestamp) - toMillis(b[1] && b[1].timestamp);
      return diff !== 0 ? diff : (a[0] < b[0] ? -1 : 1);
    });

    var fragment = document.createDocumentFragment();
    var lastDate = '';
    var shown = 0;

    list.forEach(function (entry) {
      var key = entry[0];
      if (state.hidden.has(key)) return;
      var message = normalizeMessage(entry[1]);
      var label = dateLabel(message.timestamp);
      if (label !== lastDate) {
        var dateEl = document.createElement('div');
        dateEl.className = 'message-date';
        var dateChip = document.createElement('span');
        dateChip.textContent = label;
        dateEl.appendChild(dateChip);
        fragment.appendChild(dateEl);
        lastDate = label;
      }
      fragment.appendChild(buildMessageRow(key, message));
      shown += 1;
    });

    if (!shown) {
      var empty = document.createElement('div');
      empty.className = 'system-message';
      var chip = document.createElement('span');
      chip.textContent = 'No messages yet. Say hello!';
      empty.appendChild(chip);
      fragment.appendChild(empty);
    }

    els.messages.replaceChildren(fragment);
    state.firstRender = false;

    if (stick) scrollToBottom();
    else els.messages.scrollTop = previousTop;
  }

  function buildMessageRow(key, message) {
    var mine = state.user && message.uid === state.user.uid;
    var row = document.createElement('div');
    row.className = 'message-row' + (mine ? ' my-message' : '') + (message.deleted ? ' deleted' : '');
    row.dataset.key = key;

    var info = document.createElement('div');
    info.className = 'message-info';
    var sender = document.createElement('span');
    sender.className = 'message-sender';
    sender.textContent = message.sender;
    var time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatTime(message.timestamp);
    info.append(sender, time);

    var bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (message.deleted) {
      var placeholder = document.createElement('div');
      placeholder.className = 'message-text';
      placeholder.textContent = 'This message was deleted';
      bubble.appendChild(placeholder);
      bindBubble(bubble, key, true);
      row.append(info, bubble);
      return row;
    }

    if (message.replyTo) {
      var ref = document.createElement('div');
      ref.className = 'reply-reference';
      var author = document.createElement('div');
      author.className = 'reply-author';
      author.textContent = message.replyToName || 'Someone';
      var snippet = document.createElement('div');
      snippet.className = 'reply-text';
      snippet.textContent = message.replyToText || '';
      ref.append(author, snippet);
      bubble.appendChild(ref);
    }

    var text = document.createElement('div');
    text.className = 'message-text';
    text.innerHTML = formatMessageHTML(message.text);
    bubble.appendChild(text);

    if (message.edited) {
      var edited = document.createElement('span');
      edited.className = 'edited-tag';
      edited.textContent = '(edited)';
      bubble.appendChild(edited);
    }

    var reactions = buildReactions(key, message.reactions);
    if (reactions) bubble.appendChild(reactions);

    bindBubble(bubble, key, false);
    row.append(info, bubble);
    return row;
  }

  function buildReactions(key, reactions) {
    if (!reactions) return null;
    var counts = new Map();
    var mine = new Set();
    Object.keys(reactions).forEach(function (uid) {
      var emoji = reactions[uid];
      if (typeof emoji !== 'string' || !emoji) return;
      counts.set(emoji, (counts.get(emoji) || 0) + 1);
      if (state.user && uid === state.user.uid) mine.add(emoji);
    });
    if (!counts.size) return null;

    var wrap = document.createElement('div');
    wrap.className = 'message-reactions';
    counts.forEach(function (count, emoji) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'reaction' + (mine.has(emoji) ? ' active' : '');
      chip.title = mine.has(emoji) ? 'Remove your reaction' : 'React with ' + emoji;
      var emojiSpan = document.createElement('span');
      emojiSpan.className = 'reaction-emoji';
      emojiSpan.textContent = emoji;
      var countSpan = document.createElement('span');
      countSpan.className = 'count';
      countSpan.textContent = String(count);
      chip.append(emojiSpan, countSpan);
      chip.addEventListener('click', function () { toggleReaction(key, emoji); });
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function bindBubble(bubble, key, deleted) {
    var timer = null;
    var longPressed = false;

    function start(event) {
      if (event.type === 'mousedown' && event.button !== 0) return;
      longPressed = false;
      bubble.classList.add('pressing');
      timer = window.setTimeout(function () {
        longPressed = true;
        bubble.classList.remove('pressing');
        if (navigator.vibrate) navigator.vibrate(12);
        if (deleted) openDeleteForMe(key);
        else openMessageOptions(key, bubble);
      }, 450);
    }

    function stop() {
      if (timer) window.clearTimeout(timer);
      timer = null;
      bubble.classList.remove('pressing');
    }

    bubble.addEventListener('touchstart', start, { passive: true });
    bubble.addEventListener('mousedown', start);
    bubble.addEventListener('touchend', stop);
    bubble.addEventListener('touchmove', stop);
    bubble.addEventListener('touchcancel', stop);
    bubble.addEventListener('mouseup', stop);
    bubble.addEventListener('mouseleave', stop);
    bubble.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      stop();
      if (deleted) openDeleteForMe(key);
      else openMessageOptions(key, bubble);
    });
    bubble.addEventListener('click', function () {
      longPressed = false;
    });
  }

  function startMessages() {
    if (!rtdb) return;
    els.messages.replaceChildren();
    state.firstRender = true;

    var query = rtdb.ref(state.messagesPath).orderByChild('timestamp').limitToLast(50);
    query.on('child_added', function (snapshot) {
      state.messages.set(snapshot.key, snapshot.val());
      scheduleRender();
    }, handleMessagesError);
    query.on('child_changed', function (snapshot) {
      state.messages.set(snapshot.key, snapshot.val());
      scheduleRender();
    }, handleMessagesError);
    query.on('child_removed', function (snapshot) {
      state.messages.delete(snapshot.key);
      scheduleRender();
    }, handleMessagesError);
  }

  function handleMessagesError(error) {
    console.error('Messages listener failed', error);
    if (state.messagesErrorShown) return;
    state.messagesErrorShown = true;
    var denied = (error && (error.code === 'PERMISSION_DENIED' || /permission/i.test(error.message || '')));
    showLockedNotice({
      icon: denied ? 'fa-lock' : 'fa-plug-circle-xmark',
      title: denied ? 'No access to this chat' : 'Could not load messages',
      text: denied
        ? 'Join this room from All chats, or ask a member for the room ID.'
        : 'Check your connection and reload the page.',
      action: 'All chats',
      href: 'dashboard.html'
    });
    setComposerEnabled(false);
  }

  function sendMessage() {
    if (!rtdb || !state.user || !els.messageInput) return;
    var value = els.messageInput.value.trim();
    if (!value) return;

    var name = displayNameOf(state.user);
    var message = {
      uid: state.user.uid,
      sender: name,
      displayName: name,
      photoURL: state.user.photoURL || null,
      text: value,
      message: value,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      status: 'sent'
    };

    if (state.reply) {
      message.replyTo = state.reply.key;
      message.replyToName = state.reply.name;
      message.replyToText = (state.reply.text || '').slice(0, 180);
    }

    els.messageInput.value = '';
    setTyping(false);
    window.clearTimeout(state.typingTimer);
    cancelReply();
    if (els.sendBtn) els.sendBtn.disabled = true;

    rtdb.ref(state.messagesPath).push(message)
      .then(function () {
        scrollToBottom();
      })
      .catch(function (error) {
        console.error('Send failed', error);
        els.messageInput.value = value;
        showNotification('Message not sent. Check your connection.', 'error');
      })
      .then(function () {
        if (els.sendBtn) els.sendBtn.disabled = false;
      });
  }

  /* ---------- Reply ---------- */

  function prepareReply(name, text, key) {
    state.reply = { key: key, name: name || 'Message', text: text || '' };
    if (els.replyName) els.replyName.textContent = state.reply.name;
    if (els.replyText) els.replyText.textContent = state.reply.text;
    if (els.replyPreview) els.replyPreview.hidden = false;
    if (els.messageInput) els.messageInput.focus();
  }

  function cancelReply() {
    state.reply = null;
    if (els.replyPreview) els.replyPreview.hidden = true;
    if (els.replyName) els.replyName.textContent = '';
    if (els.replyText) els.replyText.textContent = '';
  }

  /* ---------- Message options ---------- */

  function openMessageOptions(key, bubble) {
    var raw = state.messages.get(key);
    if (!raw || !els.messageOptions) return;
    var message = normalizeMessage(raw);
    var mine = state.user && message.uid === state.user.uid;

    state.optionsKey = key;
    closeEmojiPicker();

    if (els.editOption) els.editOption.hidden = !mine;
    if (els.deleteOption) els.deleteOption.hidden = !mine;
    if (els.deleteLabel) els.deleteLabel.textContent = 'Delete';

    var rect = bubble.getBoundingClientRect();
    els.messageOptions.classList.add('active');

    var menuWidth = els.messageOptions.offsetWidth;
    var menuHeight = els.messageOptions.offsetHeight;
    var left = rect.left + rect.width / 2 - menuWidth / 2;
    var top = rect.top - menuHeight - 8;
    if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 8);
    left = Math.min(Math.max(8, left), window.innerWidth - menuWidth - 8);
    top = Math.min(Math.max(8, top), window.innerHeight - menuHeight - 8);

    els.messageOptions.style.left = left + 'px';
    els.messageOptions.style.top = top + 'px';

    if (els.reactOption) {
      els.reactOption.onclick = function () {
        closeMessageOptions();
        openEmojiPicker('react', key, rect);
      };
    }
    if (els.replyOption) {
      els.replyOption.onclick = function () {
        closeMessageOptions();
        prepareReply(message.sender, message.text, key);
      };
    }
    if (els.editOption) {
      els.editOption.onclick = function () {
        closeMessageOptions();
        openEditModal(key);
      };
    }
    if (els.deleteOption) {
      els.deleteOption.onclick = function () {
        closeMessageOptions();
        openDeleteConfirm(key);
      };
    }

    window.setTimeout(function () {
      document.addEventListener('pointerdown', outsideOptions);
      if (els.messages) els.messages.addEventListener('scroll', closeFloating, { passive: true, once: true });
    }, 0);
  }

  function outsideOptions(event) {
    if (els.messageOptions && els.messageOptions.contains(event.target)) return;
    closeMessageOptions();
    document.removeEventListener('pointerdown', outsideOptions);
  }

  function closeMessageOptions() {
    if (els.messageOptions) els.messageOptions.classList.remove('active');
    document.removeEventListener('pointerdown', outsideOptions);
  }

  function openDeleteConfirm(key) {
    if (!els.deleteModal) return;
    els.deleteModal.dataset.messageKey = key;
    showFadeModal(els.deleteModal);
  }

  function openDeleteForMe(key) {
    state.optionsKey = key;
    if (els.deleteForMeModal) els.deleteForMeModal.classList.add('active');
  }

  function hideForMe(key) {
    state.hidden.add(key);
    saveHidden();
    renderMessages();
    showNotification('Message hidden for you.');
  }

  function hiddenStorageKey() {
    return 'gc-hidden:' + state.messagesPath;
  }

  function loadHidden() {
    try {
      var raw = localStorage.getItem(hiddenStorageKey());
      var list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) state.hidden = new Set(list.filter(function (key) { return typeof key === 'string'; }).slice(-300));
    } catch (e) {
      state.hidden = new Set();
    }
  }

  function saveHidden() {
    try {
      var list = Array.from(state.hidden).slice(-300);
      localStorage.setItem(hiddenStorageKey(), JSON.stringify(list));
    } catch (e) {}
  }

  function deleteForEveryone(key) {
    if (!rtdb || !state.user) return;
    var message = normalizeMessage(state.messages.get(key));
    if (message.uid !== state.user.uid) return;
    rtdb.ref(state.messagesPath + '/' + key).update({
      deleted: true,
      text: null,
      message: null,
      reactions: null,
      replyTo: null,
      replyToName: null,
      replyToText: null,
      edited: null
    }).then(function () {
      showNotification('Message deleted.');
    }).catch(function (error) {
      console.error('Delete failed', error);
      showNotification('Could not delete the message.', 'error');
    });
  }

  /* ---------- Reactions ---------- */

  function toggleReaction(key, emoji) {
    if (!rtdb || !state.user) return;
    var ref = rtdb.ref(state.messagesPath + '/' + key + '/reactions/' + state.user.uid);
    ref.once('value').then(function (snapshot) {
      if (snapshot.val() === emoji) return ref.remove();
      return ref.set(emoji);
    }).catch(function (error) {
      console.error('Reaction failed', error);
      showNotification('Could not update the reaction.', 'error');
    });
  }

  /* ---------- Emoji picker ---------- */

  function openEmojiPicker(mode, key, anchorRect) {
    if (!els.emojiPicker) return;
    closeMessageOptions();
    state.emojiMode = mode;
    state.reactionKey = key || null;
    els.emojiPicker.classList.toggle('reaction-mode', mode === 'react');
    els.emojiPicker.classList.add('active');

    var width = els.emojiPicker.offsetWidth;
    var height = els.emojiPicker.offsetHeight;
    var left = anchorRect ? (anchorRect.left + anchorRect.width / 2 - width / 2) : 12;
    var top;

    if (mode === 'composer') {
      top = anchorRect.top - height - 10;
      if (top < 8) top = Math.min(anchorRect.bottom + 10, window.innerHeight - height - 8);
    } else {
      top = anchorRect.bottom + 8;
      if (top + height > window.innerHeight - 8) top = Math.max(8, anchorRect.top - height - 8);
    }

    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    els.emojiPicker.style.left = left + 'px';
    els.emojiPicker.style.top = top + 'px';

    window.setTimeout(function () {
      document.addEventListener('pointerdown', outsideEmoji);
    }, 0);
  }

  function outsideEmoji(event) {
    if (els.emojiPicker && els.emojiPicker.contains(event.target)) return;
    if (els.emojiBtn && els.emojiBtn.contains(event.target)) return;
    closeEmojiPicker();
  }

  function closeEmojiPicker() {
    if (els.emojiPicker) {
      els.emojiPicker.classList.remove('active');
      els.emojiPicker.classList.remove('reaction-mode');
    }
    state.emojiMode = null;
    state.reactionKey = null;
    document.removeEventListener('pointerdown', outsideEmoji);
  }

  function closeFloating() {
    closeMessageOptions();
    closeEmojiPicker();
  }

  function bindEmojiPicker() {
    if (!els.emojiPicker) return;
    els.emojiPicker.addEventListener('click', function (event) {
      var tile = event.target.closest('.emoji');
      if (!tile) return;
      var emoji = tile.getAttribute('data-emoji') || tile.textContent;
      if (!emoji) return;
      if (state.emojiMode === 'react' && state.reactionKey) {
        toggleReaction(state.reactionKey, emoji);
        closeEmojiPicker();
        return;
      }
      insertEmoji(emoji);
    });
  }

  function insertEmoji(emoji) {
    if (!els.messageInput) return;
    var input = els.messageInput;
    var start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    var caret = start + emoji.length;
    input.focus();
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ---------- Edit ---------- */

  function openEditModal(key) {
    var message = normalizeMessage(state.messages.get(key));
    if (!state.user || message.uid !== state.user.uid || !els.editModal) return;
    state.editKey = key;
    if (els.editInput) els.editInput.value = message.text;
    openModal(els.editModal);
    if (els.editInput) {
      window.setTimeout(function () {
        els.editInput.focus();
        els.editInput.setSelectionRange(els.editInput.value.length, els.editInput.value.length);
      }, 30);
    }
  }

  function closeEditModal() {
    state.editKey = null;
    closeModal(els.editModal);
  }

  function saveEdit() {
    if (!rtdb || !state.user || !state.editKey || !els.editInput) return;
    var key = state.editKey;
    var value = els.editInput.value.trim();
    var original = normalizeMessage(state.messages.get(key)).text;
    if (!value) {
      showNotification('Message cannot be empty.', 'error');
      return;
    }
    if (value === original) {
      closeEditModal();
      return;
    }
    var path = state.messagesPath + '/' + key;
    rtdb.ref(path).update({ text: value, message: value, edited: true })
      .then(function () {
        closeEditModal();
        showNotification('Message updated.');
      })
      .catch(function (error) {
        console.error('Edit failed', error);
        showNotification('Could not edit the message.', 'error');
      });
  }

  /* ---------- Auth ---------- */

  function handleUser(user) {
    if (state.authErrored) return;
    if (!user) {
      if (state.redirecting) return;
      state.redirecting = true;
      window.location.replace('login.html');
      return;
    }
    if (state.started) {
      if (state.startedUid !== user.uid) window.location.reload();
      return;
    }
    state.started = true;
    state.startedUid = user.uid;
    state.user = user;

    paintUser();
    setupPresence();

    setupRoom().then(function (ready) {
      if (!ready) return;
      startMessages();
      startTypingIndicator();
      setComposerEnabled(true);
    });
  }

  function handleAuthError(error) {
    if (state.authErrored) return;
    state.authErrored = true;
    console.error('Auth listener failed', error);
    showAuthNotice(error);
  }

  /* ---------- Boot ---------- */

  function cacheElements() {
    els = {
      messages: $('messages-container'),
      messageInput: $('message-input'),
      sendBtn: $('send-btn'),
      emojiBtn: $('emoji-btn'),
      typingIndicator: $('typing-indicator'),
      typingUsername: $('typing-username'),
      onlineDisplay: $('online-users-display'),
      chatName: document.querySelector('.chat-name'),
      chatAvatar: $('chat-avatar'),
      menuButton: $('menu-button'),
      openMenuBtn: $('open-menu-btn'),
      sideMenu: $('side-menu'),
      menuOverlay: $('menu-overlay'),
      menuClose: $('menu-close'),
      username: $('username'),
      userEmail: $('user-email'),
      profilePic: $('profile-pic'),
      profileSettingsBtn: $('profile-settings'),
      aboutBtn: $('about-funchat'),
      returnDashboardBtn: $('return-dashboard'),
      themeToggle: $('theme-toggle'),
      leaveRoomBtn: $('leave-room-btn'),
      logoutBtn: $('logout-btn'),
      roomIdRow: $('room-id-row'),
      roomIdDivider: $('room-id-divider'),
      roomIdValue: $('room-id-value'),
      copyRoomIdBtn: $('copy-room-id'),
      messageOptions: $('message-options'),
      reactOption: document.querySelector('.react-option'),
      replyOption: document.querySelector('.reply-option'),
      editOption: document.querySelector('.edit-option'),
      deleteOption: document.querySelector('.delete-option'),
      deleteLabel: document.querySelector('.delete-option .delete-label'),
      emojiPicker: $('emoji-picker'),
      replyPreview: $('reply-preview'),
      replyName: $('reply-preview-name'),
      replyText: $('reply-preview-text'),
      cancelReplyBtn: $('cancel-reply-btn'),
      editModal: $('edit-message-modal'),
      editInput: $('edit-message-input'),
      saveEditBtn: $('save-edit-btn'),
      cancelEditBtn: $('cancel-edit-btn'),
      deleteModal: $('delete-confirmation-modal'),
      cancelDeleteBtn: $('cancel-delete'),
      confirmDeleteBtn: $('confirm-delete'),
      deleteForMeModal: $('delete-for-me-confirmation-modal'),
      cancelDeleteForMeBtn: $('cancel-delete-for-me'),
      confirmDeleteForMeBtn: $('confirm-delete-for-me'),
      profileModal: $('profileSettingsModal'),
      closeProfileBtn: $('closeProfileBtn'),
      displayUsername: $('displayUsername'),
      displayEmail: $('displayEmail'),
      editUsernameBtn: $('editUsernameBtn'),
      logoutProfileBtn: $('logoutProfileBtn'),
      picContainer: $('profilePicContainer'),
      changePicBtn: $('changeProfilePicBtn'),
      picInput: $('profilePicInput'),
      aboutModal: $('aboutAIChatModal'),
      closeAboutBtn: $('closeAboutBtn'),
      toasts: $('notification-container')
    };
  }

  function boot() {
    cacheElements();
    initTheme();
    loadHidden();
    bindChrome();
    bindComposer();
    bindEmojiPicker();
    setComposerEnabled(false);

    if (configMissing) {
      showConfigNotice();
      return;
    }

    firebase.initializeApp(cfg);
    auth = firebase.auth();
    rtdb = firebase.database();
    firestore = firebase.firestore();
    storage = firebase.storage();

    auth.onAuthStateChanged(handleUser, handleAuthError);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
