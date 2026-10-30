(function () {
  'use strict';

  var MAX_OWNED_ROOMS = 3;
  var config = window.APP_FIREBASE_CONFIG;
  var configMissing = !config ||
    !config.apiKey ||
    String(config.apiKey).indexOf('REPLACE_WITH_NEW_RESTRICTED_API_KEY') !== -1 ||
    String(config.projectId || '').indexOf('YOUR_PROJECT') !== -1;

  var auth = null;
  var db = null;
  var rtdb = null;
  var storage = null;

  if (!configMissing) {
    if (!firebase.apps.length) firebase.initializeApp(config);
    auth = firebase.auth();
    db = firebase.firestore();
    rtdb = firebase.database();
    storage = firebase.storage();
  }

  var els = {};
  var currentUser = null;
  var roomPreviewRefs = [];
  var roomUnsubscribers = [];

  function $(id) {
    return document.getElementById(id);
  }

  function showToast(message, type) {
    var container = els.toasts || $('notification-container');
    if (!container || !message) return;
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
      window.setTimeout(function () {
        toast.remove();
      }, 220);
    }, 4200);
  }

  function setNotice(message) {
    if (!els.configNotice) return;
    var text = els.configNotice.querySelector('div');
    if (text && message) text.textContent = message;
    els.configNotice.hidden = false;
  }

  function initials(name) {
    return (String(name || 'U').trim().charAt(0) || 'U').toUpperCase();
  }

  function paintAvatar(element, user) {
    if (!element) return;
    var photo = user && user.photoURL;
    if (photo) {
      element.textContent = '';
      var img = document.createElement('img');
      img.src = photo;
      img.alt = '';
      img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
      element.appendChild(img);
    } else {
      element.textContent = initials(user && (user.displayName || user.email));
    }
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeIcon(icon) {
    return /^fa-[a-z0-9-]+$/.test(String(icon || '')) ? icon : 'fa-users';
  }

  function toMillis(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    var parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatRelativeTime(value) {
    var time = toMillis(value);
    if (!time) return '';
    var diff = Date.now() - time;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd';
    return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ---------- Theme ---------- */

  function bindTheme() {
    if (!els.themeToggle) return;
    els.themeToggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
    els.themeToggle.addEventListener('change', function () {
      var next = els.themeToggle.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('tools-theme', next);
      } catch (e) {}
    });
  }

  /* ---------- Drawer & modals ---------- */

  function openDrawer() {
    if (!els.sideMenu) return;
    els.sideMenu.classList.add('active');
    if (els.menuOverlay) els.menuOverlay.classList.add('active');
    if (els.menuButton) els.menuButton.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    if (!els.sideMenu) return;
    els.sideMenu.classList.remove('active');
    if (els.menuOverlay) els.menuOverlay.classList.remove('active');
    if (els.menuButton) els.menuButton.setAttribute('aria-expanded', 'false');
  }

  function openModal(modal) {
    if (modal) modal.classList.add('is-open');
  }

  function closeModal(modal) {
    if (modal) modal.classList.remove('is-open');
  }

  function closeTopLayer() {
    var open = document.querySelector('.gc-modal.is-open');
    if (open) {
      closeModal(open);
      return;
    }
    closeDrawer();
  }

  function bindShell() {
    if (els.menuButton) els.menuButton.addEventListener('click', openDrawer);
    if (els.menuClose) els.menuClose.addEventListener('click', closeDrawer);
    if (els.menuOverlay) els.menuOverlay.addEventListener('click', closeDrawer);

    Array.prototype.forEach.call(document.querySelectorAll('.gc-modal'), function (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeModal(modal);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeTopLayer();
    });

    if (els.closeProfileBtn) els.closeProfileBtn.addEventListener('click', function () { closeModal(els.profileSettingsModal); });
    if (els.closeAboutBtn) els.closeAboutBtn.addEventListener('click', function () { closeModal(els.aboutAIChatModal); });
    if (els.closeManageRoomsBtn) els.closeManageRoomsBtn.addEventListener('click', function () { closeModal(els.manageRoomsModal); });

    if (els.profileSettings) {
      els.profileSettings.addEventListener('click', function () {
        closeDrawer();
        fillProfileModal();
        openModal(els.profileSettingsModal);
      });
    }

    if (els.aboutFunChat) {
      els.aboutFunChat.addEventListener('click', function () {
        closeDrawer();
        openModal(els.aboutAIChatModal);
      });
    }

    [els.createRoomFab, els.newChatHeaderBtn, els.emptyCreateBtn].forEach(function (button) {
      if (!button) return;
      button.addEventListener('click', function () {
        openModal(els.manageRoomsModal);
        window.setTimeout(function () {
          if (els.newRoomName) els.newRoomName.focus();
        }, 120);
      });
    });

    els.iconOptions.forEach(function (option) {
      option.addEventListener('click', function () {
        els.iconOptions.forEach(function (item) { item.classList.remove('selected'); });
        option.classList.add('selected');
      });
    });

    if (els.newRoomName) {
      els.newRoomName.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          createRoom();
        }
      });
    }

    if (els.roomIdInput) {
      els.roomIdInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          joinRoom();
        }
      });
    }
  }

  /* ---------- Profile ---------- */

  function renderUser(user) {
    if (!user) return;
    if (els.username) els.username.textContent = user.displayName || 'User';
    if (els.userEmail) els.userEmail.textContent = user.email || '';
    paintAvatar(els.profilePic, user);
    paintAvatar(els.profilePicContainer, user);
  }

  function fillProfileModal() {
    if (!currentUser) return;
    if (els.displayUsername) els.displayUsername.textContent = currentUser.displayName || 'User';
    if (els.displayEmail) els.displayEmail.textContent = currentUser.email || '';
    paintAvatar(els.profilePicContainer, currentUser);
    if (els.usernameForm) els.usernameForm.hidden = true;
  }

  function handleLogout() {
    if (!auth) return;
    closeDrawer();
    auth.signOut().then(function () {
      window.location.href = 'login.html';
    }).catch(function (error) {
      console.error('Sign out failed', error);
      showToast('Could not sign out. Try again.', 'error');
    });
  }

  function bindProfile() {
    if (els.logoutBtn) els.logoutBtn.addEventListener('click', handleLogout);
    if (els.logoutProfileBtn) els.logoutProfileBtn.addEventListener('click', handleLogout);

    if (els.editUsernameBtn) {
      els.editUsernameBtn.addEventListener('click', function () {
        if (!els.usernameForm || !currentUser) return;
        els.usernameForm.hidden = false;
        els.usernameInput.value = currentUser.displayName || '';
        els.usernameInput.focus();
        els.usernameInput.select();
      });
    }

    if (els.cancelUsernameBtn) {
      els.cancelUsernameBtn.addEventListener('click', function () {
        if (els.usernameForm) els.usernameForm.hidden = true;
      });
    }

    if (els.usernameForm) {
      els.usernameForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!currentUser) return;
        var name = (els.usernameInput.value || '').trim();
        if (name.length < 2) {
          showToast('Username must be at least 2 characters.', 'error');
          return;
        }
        els.saveUsernameBtn.disabled = true;
        currentUser.updateProfile({ displayName: name }).then(function () {
          if (els.displayUsername) els.displayUsername.textContent = name;
          renderUser(currentUser);
          if (rtdb) rtdb.ref('online/' + currentUser.uid).update({ displayName: name }).catch(function () {});
          els.usernameForm.hidden = true;
          showToast('Username updated.');
        }).catch(function (error) {
          console.error('Username update failed', error);
          showToast('Could not update username. Try again.', 'error');
        }).then(function () {
          els.saveUsernameBtn.disabled = false;
        });
      });
    }

    if (els.changeProfilePicBtn && els.profilePicInput) {
      els.changeProfilePicBtn.addEventListener('click', function () {
        els.profilePicInput.click();
      });
      els.profilePicInput.addEventListener('change', handlePhotoSelected);
    }
  }

  function handlePhotoSelected(event) {
    var file = event.target.files && event.target.files[0];
    if (!file || !currentUser || !storage) return;
    event.target.value = '';

    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].indexOf(file.type) === -1) {
      showToast('Choose a JPG, PNG, GIF or WEBP image.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image is larger than 2 MB.', 'error');
      return;
    }

    var reader = new FileReader();
    reader.onload = function (loadEvent) {
      var image = new Image();
      image.onload = function () {
        var max = 320;
        var scale = Math.min(1, max / Math.max(image.width, image.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          uploadPhoto(blob || file);
        }, 'image/jpeg', 0.86);
      };
      image.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file);
  }

  function uploadPhoto(blob) {
    var button = els.changeProfilePicBtn;
    if (button) button.disabled = true;
    var ref = storage.ref('profile_pics/' + currentUser.uid + '.jpg');
    ref.put(blob).then(function (snapshot) {
      return snapshot.ref.getDownloadURL();
    }).then(function (url) {
      return currentUser.updateProfile({ photoURL: url });
    }).then(function () {
      renderUser(currentUser);
      fillProfileModal();
      showToast('Profile photo updated.');
    }).catch(function (error) {
      console.error('Photo upload failed', error);
      showToast('Could not upload the photo. Check Storage rules.', 'error');
    }).then(function () {
      if (button) button.disabled = false;
    });
  }

  /* ---------- Global preview ---------- */

  function watchGlobalPreview() {
    if (!rtdb || !els.globalLastMessage) return;
    rtdb.ref('global_messages').orderByChild('timestamp').limitToLast(1).on('value', function (snapshot) {
      if (!snapshot.exists()) return;
      snapshot.forEach(function (child) {
        var message = child.val() || {};
        if (els.globalLastTime) els.globalLastTime.textContent = formatRelativeTime(message.timestamp);
        if (els.globalLastSender) els.globalLastSender.textContent = (message.displayName || message.sender || 'Someone') + ':';
        if (els.globalLastMessage) els.globalLastMessage.textContent = message.deleted ? 'Message deleted' : (message.message || message.text || '');
      });
    });
  }

  /* ---------- Rooms ---------- */

  function stopPreviewWatchers() {
    roomPreviewRefs.forEach(function (item) {
      try {
        item.ref.off('value', item.handler);
      } catch (e) {}
    });
    roomPreviewRefs = [];
  }

  function watchRoomPreview(roomId, card) {
    if (!rtdb) return;
    var ref = rtdb.ref('room_messages/' + roomId).orderByChild('timestamp').limitToLast(1);
    var handler = ref.on('value', function (snapshot) {
      if (!snapshot.exists()) return;
      snapshot.forEach(function (child) {
        var message = child.val() || {};
        var time = card.querySelector('.gc-room-time');
        var preview = card.querySelector('.gc-room-preview');
        if (time) time.textContent = formatRelativeTime(message.timestamp);
        if (preview) {
          var name = escapeHTML(message.displayName || message.sender || 'Someone');
          var body = escapeHTML(message.deleted ? 'Message deleted' : (message.message || message.text || ''));
          preview.innerHTML = '<strong>' + name + ':</strong><span>' + body + '</span>';
        }
      });
    });
    roomPreviewRefs.push({ ref: ref, handler: handler });
  }

  function roomCard(roomId, room) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'gc-room-card';
    card.innerHTML =
      '<span class="gc-room-icon"><i class="fas ' + safeIcon(room.icon) + '" aria-hidden="true"></i></span>' +
      '<span class="gc-room-body">' +
      '<span class="gc-room-top"><span class="gc-room-name">' + escapeHTML(room.name || 'Room') + '</span>' +
      '<span class="gc-room-time"></span></span>' +
      '<span class="gc-room-preview"><strong>No messages yet</strong><span></span></span>' +
      '</span>' +
      '<span class="gc-room-chevron"><i class="fas fa-chevron-right" aria-hidden="true"></i></span>';
    card.addEventListener('click', function () {
      window.location.href = 'chat.html?room=' + encodeURIComponent(roomId);
    });
    watchRoomPreview(roomId, card);
    return card;
  }

  function renderRooms(rooms) {
    if (!els.chatRooms) return;
    stopPreviewWatchers();
    els.chatRooms.textContent = '';
    if (!rooms.length) {
      if (els.roomsEmpty) els.roomsEmpty.hidden = false;
      if (els.roomsCount) els.roomsCount.hidden = true;
      return;
    }
    if (els.roomsEmpty) els.roomsEmpty.hidden = true;
    if (els.roomsCount) {
      els.roomsCount.textContent = String(rooms.length);
      els.roomsCount.hidden = false;
    }
    rooms.forEach(function (room) {
      els.chatRooms.appendChild(roomCard(room.id, room));
    });
  }

  function loadRooms() {
    if (!db || !currentUser) return;
    roomUnsubscribers.forEach(function (unsubscribe) {
      try {
        unsubscribe();
      } catch (e) {}
    });
    roomUnsubscribers = [];
    var unsubscribe = db.collection('users').doc(currentUser.uid).collection('rooms')
      .onSnapshot(function (snapshot) {
        var rooms = [];
        snapshot.forEach(function (doc) {
          var data = doc.data() || {};
          rooms.push({ id: doc.id, name: data.name, icon: data.icon, joined: data.joined });
        });
        rooms.sort(function (a, b) {
          return toMillis(b.joined) - toMillis(a.joined);
        });
        renderRooms(rooms);
      }, function (error) {
        console.error('Room list failed', error);
        showToast('Could not load your rooms. Check Firestore rules.', 'error');
      });
    roomUnsubscribers.push(unsubscribe);
  }

  function createRoom() {
    if (!db || !currentUser) {
      showToast('Sign in to create a room.', 'error');
      return;
    }
    var name = (els.newRoomName && els.newRoomName.value || '').trim();
    if (name.length < 3) {
      showToast('Room name needs at least 3 characters.', 'error');
      return;
    }
    var selected = document.querySelector('.room-icon-option.selected');
    var icon = selected ? selected.getAttribute('data-icon') : 'fa-users';
    var dbRef = db;

    if (els.createRoomBtn) els.createRoomBtn.disabled = true;
    dbRef.collection('users').doc(currentUser.uid).collection('rooms').get().then(function (snapshot) {
      if (snapshot.size >= MAX_OWNED_ROOMS) {
        throw new Error('LIMIT');
      }
      return dbRef.collection('rooms').add({
        name: name,
        icon: icon,
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        members: [currentUser.uid],
        admins: [currentUser.uid]
      });
    }).then(function (docRef) {
      return dbRef.collection('users').doc(currentUser.uid).collection('rooms').doc(docRef.id).set({
        name: name,
        icon: icon,
        joined: firebase.firestore.FieldValue.serverTimestamp(),
        isAdmin: true
      }).then(function () {
        return docRef.id;
      });
    }).then(function (roomId) {
      if (!rtdb) return roomId;
      return rtdb.ref('room_members/' + roomId + '/' + currentUser.uid).set(true)
        .then(function () { return roomId; })
        .catch(function () { return roomId; });
    }).then(function (roomId) {
      if (els.newRoomName) els.newRoomName.value = '';
      window.location.href = 'chat.html?room=' + encodeURIComponent(roomId);
    }).catch(function (error) {
      console.error('Create room failed', error);
      if (error && error.message === 'LIMIT') {
        showToast('You can own up to ' + MAX_OWNED_ROOMS + ' rooms.', 'error');
      } else {
        showToast('Could not create the room. Check Firestore rules.', 'error');
      }
    }).then(function () {
      if (els.createRoomBtn) els.createRoomBtn.disabled = false;
    });
  }

  function joinRoom() {
    if (!db || !currentUser) {
      showToast('Sign in to join a room.', 'error');
      return;
    }
    var roomId = (els.roomIdInput && els.roomIdInput.value || '').trim();
    if (!roomId) {
      showToast('Paste a room ID first.', 'error');
      return;
    }
    var dbRef = db;
    var roomRef = dbRef.collection('rooms').doc(roomId);
    if (els.joinRoomBtn) els.joinRoomBtn.disabled = true;
    roomRef.get().then(function (doc) {
      if (!doc.exists) throw new Error('MISSING');
      var data = doc.data() || {};
      return roomRef.update({
        members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      }).then(function () {
        return dbRef.collection('users').doc(currentUser.uid).collection('rooms').doc(roomId).set({
          name: data.name || 'Room',
          icon: data.icon || 'fa-users',
          joined: firebase.firestore.FieldValue.serverTimestamp(),
          isAdmin: Array.isArray(data.admins) && data.admins.indexOf(currentUser.uid) !== -1
        });
      }).then(function () {
        return roomId;
      });
    }).then(function (id) {
      if (!rtdb) return id;
      return rtdb.ref('room_members/' + id + '/' + currentUser.uid).set(true)
        .then(function () { return id; })
        .catch(function () { return id; });
    }).then(function (id) {
      if (els.roomIdInput) els.roomIdInput.value = '';
      window.location.href = 'chat.html?room=' + encodeURIComponent(id);
    }).catch(function (error) {
      console.error('Join room failed', error);
      showToast(error && error.message === 'MISSING' ? 'No room found with that ID.' : 'Could not join the room.', 'error');
    }).then(function () {
      if (els.joinRoomBtn) els.joinRoomBtn.disabled = false;
    });
  }

  /* ---------- Boot ---------- */

  function cacheElements() {
    els = {
      toasts: $('notification-container'),
      configNotice: $('config-notice'),
      menuButton: $('menu-button'),
      sideMenu: $('side-menu'),
      menuOverlay: $('menu-overlay'),
      menuClose: $('menu-close'),
      profilePic: $('profile-pic'),
      username: $('username'),
      userEmail: $('user-email'),
      logoutBtn: $('logout-btn'),
      profileSettings: $('profile-settings'),
      themeToggle: $('theme-toggle'),
      chatRooms: $('chat-rooms'),
      roomsEmpty: $('rooms-empty'),
      roomsCount: $('rooms-count'),
      emptyCreateBtn: $('empty-create-btn'),
      newChatHeaderBtn: $('new-chat-header-btn'),
      createRoomFab: $('create-room-fab'),
      globalLastTime: $('global-last-time'),
      globalLastSender: $('global-last-sender'),
      globalLastMessage: $('global-last-message'),
      aboutFunChat: $('about-funchat'),
      profileSettingsModal: $('profileSettingsModal'),
      closeProfileBtn: $('closeProfileBtn'),
      displayUsername: $('displayUsername'),
      displayEmail: $('displayEmail'),
      editUsernameBtn: $('editUsernameBtn'),
      logoutProfileBtn: $('logoutProfileBtn'),
      profilePicContainer: $('profilePicContainer'),
      changeProfilePicBtn: $('changeProfilePicBtn'),
      profilePicInput: $('profilePicInput'),
      usernameForm: $('username-form'),
      usernameInput: $('usernameInput'),
      cancelUsernameBtn: $('cancelUsernameBtn'),
      saveUsernameBtn: $('saveUsernameBtn'),
      aboutAIChatModal: $('aboutAIChatModal'),
      closeAboutBtn: $('closeAboutBtn'),
      manageRoomsModal: $('manageRoomsModal'),
      closeManageRoomsBtn: $('closeManageRoomsBtn'),
      newRoomName: $('newRoomName'),
      createRoomBtn: $('createRoomBtn'),
      roomIdInput: $('roomIdInput'),
      joinRoomBtn: $('joinRoomBtn'),
      iconOptions: Array.prototype.slice.call(document.querySelectorAll('.room-icon-option'))
    };
  }

  function boot() {
    cacheElements();
    bindTheme();
    bindShell();
    bindProfile();
    if (els.createRoomBtn) els.createRoomBtn.addEventListener('click', createRoom);
    if (els.joinRoomBtn) els.joinRoomBtn.addEventListener('click', joinRoom);

    if (configMissing) {
      setNotice('Chat is not configured. Add your Firebase web config to js/firebase-config.js to enable sign-in and messaging.');
      return;
    }

    auth.onAuthStateChanged(function (user) {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }
      currentUser = user;
      renderUser(user);
      loadRooms();
      watchGlobalPreview();
    }, function (error) {
      console.error('Auth failed', error);
      if (error && String(error.code).indexOf('configuration') !== -1) {
        setNotice('Firebase Authentication is not enabled yet. Open the Firebase Console, choose Authentication, and click Get started.');
      } else {
        showToast('Sign-in service is unavailable right now.', 'error');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
