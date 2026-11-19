/* YT Downloader — configurable API base URL.
 *
 * Web build: same-origin (relative /api/* paths), so API_BASE stays "".
 * Mobile (Capacitor/APK): the app UI is bundled locally, so all API calls
 * must go to the user's backend server. The address is remembered in
 * localStorage (set from the Settings screen) and applied here.
 */
(function () {
  var base = '';
  try {
    var saved = localStorage.getItem('ytdl_server_url');
    if (saved && /^https?:\/\//i.test(saved)) {
      base = saved.replace(/\/+$/, '');
    }
  } catch (e) { /* localStorage unavailable — fall back to same-origin */ }

  window.APP_API_BASE = base;

  window.apiUrl = function (path) {
    return base + path;
  };
})();
