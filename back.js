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

  function injectTheme() {
    // Tool pages own their layout and theme tokens. Do not inject a global
    // stylesheet that can override a tool's workflow-specific CSS.
    return;
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

  function addSharedShell() {
    if (!document.body || isHomepage() || document.querySelector("[data-global-shell]")) {
      return;
    }
    document.body.classList.add("global-tool-page");

    var title = (document.title || "Tool").split(" - ")[0].trim();
    var path = (window.location.pathname || "/").replace(/\/+$/, "");
    var segments = path.split("/").filter(function (segment) {
      return segment.length > 0 && segment.toLowerCase() !== "index.html";
    });
    var category = segments.length > 1 ? segments[segments.length - 2] : "";
    var home = document.createElement("header");
    home.className = "global-shell";
    home.setAttribute("data-global-shell", "");
    home.innerHTML =
      '<div class="global-shell-inner">' +
      '<a class="global-brand" href="/" aria-label="Alok Systems Tools home">' +
      '<span class="global-brand-mark" aria-hidden="true">A</span>' +
      '<span><strong>Alok Systems</strong><small>Tools</small></span>' +
      "</a>" +
      '<nav class="global-nav" aria-label="Primary navigation">' +
      '<a href="/">Home</a><a href="/#tools">Tools</a><a href="/#about">About</a>' +
      "</nav>" +
      '<button class="global-theme-toggle" type="button" aria-label="Toggle color theme">' +
      '<span aria-hidden="true">◐</span></button>' +
      '<button class="global-menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false">☰</button>' +
      "</div>" +
      '<div class="global-breadcrumb" aria-label="Breadcrumb">' +
      '<a href="/">Home</a><span aria-hidden="true">›</span><a href="/#tools">Tools</a>' +
      (category ? '<span aria-hidden="true">›</span><span>' + escapeText(category) + "</span>" : "") +
      '<span aria-hidden="true">›</span><strong>' + escapeText(title) + "</strong></div>";

    document.body.insertBefore(home, document.body.firstChild);
    var themeButton = home.querySelector(".global-theme-toggle");
    themeButton.addEventListener("click", function () {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
      try {
        localStorage.setItem("tools-theme", dark ? "light" : "dark");
      } catch (err) {
        // Theme still changes for this page when storage is unavailable.
      }
    });
    var menuButton = home.querySelector(".global-menu-toggle");
    menuButton.addEventListener("click", function () {
      var open = home.classList.toggle("is-menu-open");
      menuButton.setAttribute("aria-expanded", String(open));
    });
  }

  function escapeText(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function onReady() {
    injectTheme();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }
})();
