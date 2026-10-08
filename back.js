/* Back button — clean navigation helper.
   No ads, no sponsor links, no click hijacking, no tracking.
   Injects an "All Tools" button on every tool subpage (hidden on homepage). */
(function () {
  "use strict";

  function isHomepage() {
    try {
      var path = window.location.pathname || "/";
      var parts = path.split("/").filter(function (s) {
        return s.length > 0;
      });
      if (parts.length === 0) {
        return true;
      }
      if (parts.length === 1 && parts[0].toLowerCase() === "index.html") {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function addBackButton() {
    if (!document.body || document.querySelector("[data-global-back]")) {
      return;
    }
    if (isHomepage()) {
      return;
    }
    var a = document.createElement("a");
    a.className = "global-back-btn";
    a.setAttribute("data-global-back", "");
    a.href = "/";
    a.setAttribute("aria-label", "Back to all tools");
    a.innerHTML = '<span aria-hidden="true">\u2190</span> All Tools';
    a.addEventListener("click", function (e) {
      try {
        e.preventDefault();
      } catch (err) {}
      try {
        if (window.history && window.history.length > 1) {
          window.history.back();
          return;
        }
      } catch (err2) {}
      try {
        window.location.href = "/";
      } catch (err3) {}
    });
    document.body.appendChild(a);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addBackButton, { once: true });
  } else {
    addBackButton();
  }
})();
