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
    // Keep the dashboard's theme preference available on every standalone tool.
    try {
      var saved = localStorage.getItem("tools-theme");
      if (saved === "light" || saved === "dark") {
        document.documentElement.setAttribute("data-theme", saved);
      } else if (!document.documentElement.hasAttribute("data-theme")) {
        document.documentElement.setAttribute(
          "data-theme",
          window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        );
      }
    } catch (e) {}

    if (!document.querySelector('link[data-shared-tool-theme]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = resolveSibling("shared-tools.css");
      link.setAttribute("data-shared-tool-theme", "");
      document.head.appendChild(link);
    }

    document.body.classList.add("global-tool-page");
    syncAppTheme();

    var pageHeader = document.querySelector("body > header");
    var isAgeCalculatorHeader = pageHeader && pageHeader.classList.contains("top-bar");
    var hasSiteNavigation = pageHeader && pageHeader.querySelector("nav");
    if (!isAgeCalculatorHeader) addSharedShell(pageHeader, !!hasSiteNavigation);

    var pageFooter = document.querySelector("body > footer");
    var isAgeCalculatorFooter = pageFooter && pageFooter.classList.contains("site-footer") &&
      pageFooter.querySelector(".site-footer-inner .footer-brand");
    if (!isAgeCalculatorFooter) standardizeFooter(pageFooter);
  }

  function resolveSibling(file) {
    var script = document.currentScript;
    if (!script) script = document.querySelector('script[src$="/back.js"], script[src="back.js"]');
    if (script && script.src) return new URL(file, script.src).href;
    return file;
  }

  function toggleTheme() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    var next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tools-theme", next); } catch (e) {}
    syncAppTheme();
  }

  function syncAppTheme() {
    var checkbox = document.querySelector("#dark-mode-toggle, [data-dark-mode-toggle]");
    var shouldBeDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (checkbox && !checkbox.getAttribute("data-shared-theme-bound")) {
      checkbox.setAttribute("data-shared-theme-bound", "");
      checkbox.addEventListener("change", function () {
        var next = checkbox.checked ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem("tools-theme", next); } catch (e) {}
      });
    }
    if (checkbox && checkbox.checked !== shouldBeDark) {
      checkbox.checked = shouldBeDark;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }

    var appButton = document.querySelector("#darkModeToggle");
    if (appButton && !appButton.getAttribute("data-shared-theme-bound")) {
      appButton.setAttribute("data-shared-theme-bound", "");
      appButton.addEventListener("click", function () {
        window.setTimeout(function () {
          var next = document.body.classList.contains("dark-mode") ? "dark" : "light";
          document.documentElement.setAttribute("data-theme", next);
          try { localStorage.setItem("tools-theme", next); } catch (e) {}
        }, 0);
      });
    }
    if (appButton && document.body.classList.contains("dark-mode") !== shouldBeDark) {
      appButton.click();
    }
  }

  function standardizeFooter(existingFooter) {
    if (existingFooter && existingFooter.querySelector("button, input, select, textarea, form, [role='button'], a[download]")) {
      existingFooter.classList.add("global-tool-local-actions");
    } else if (existingFooter) {
      existingFooter.remove();
    }
    addSharedFooter();
  }

  function addSharedFooter() {
    var footer = document.createElement("footer");
    footer.className = "global-tool-footer";
    footer.setAttribute("data-global-footer", "");
    footer.innerHTML =
      '<div class="global-tool-footer-inner">' +
      '<a class="global-tool-footer-brand" href="/" aria-label="Alok Systems Tools home">' +
      '<span class="global-brand-mark" aria-hidden="true">A</span>' +
      '<span><strong>Alok Systems Tools</strong><small>© ' + new Date().getFullYear() + ' · Tools for everyday work.</small></span></a>' +
      '<nav class="global-tool-footer-nav" aria-label="Footer navigation"><a href="/">Home</a><a href="/#tools">All tools</a><a href="/#about">About</a></nav>' +
      '</div>';
    document.body.appendChild(footer);
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

  function addSharedShell(existingHeader, replaceHeader) {
    if (!document.body || isHomepage() || document.querySelector("[data-global-shell]")) {
      return;
    }
    document.body.classList.add("global-tool-page");

    var retainedThemeButton = null;
    var retainedActions = [];
    var retainedSectionLinks = [];
    if (existingHeader) {
      retainedThemeButton = existingHeader.querySelector(
        ".theme-btn, #themeBtn, #themeToggle, #ffThemeBtn, #theme-toggle, #darkModeToggle, .site-theme-toggle, .theme-toggle, [data-theme-toggle]"
      );
      if (replaceHeader) {
        existingHeader.querySelectorAll("button, [role='button']").forEach(function (button) {
          if (button === retainedThemeButton || button.matches(".global-menu-toggle, [data-menu-toggle], .menu-button")) return;
          retainedActions.push(button);
        });
        existingHeader.querySelectorAll("nav a[href^='#']").forEach(function (link) {
          retainedSectionLinks.push(link);
        });
        existingHeader.remove();
      } else if (retainedThemeButton) {
        retainedThemeButton.remove();
      }
    }

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
      '<div class="global-tool-actions" data-global-actions></div>' +
      '<button class="global-theme-toggle" type="button" aria-label="Toggle color theme">' +
      '<span aria-hidden="true">◐</span></button>' +
      '<button class="global-menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false">☰</button>' +
      "</div>";

    var navSlot = home.querySelector(".global-nav");
    retainedSectionLinks.forEach(function (link) { navSlot.appendChild(link); });

    if (retainedThemeButton) {
      retainedThemeButton.classList.add("global-theme-toggle");
      home.querySelector(".global-theme-toggle").replaceWith(retainedThemeButton);
    }
    var actionSlot = home.querySelector("[data-global-actions]");
    retainedActions.forEach(function (action) { actionSlot.appendChild(action); });
    if (!retainedActions.length) actionSlot.remove();
    var firstChild = document.body.firstElementChild;
    if (firstChild && (firstChild.classList.contains("skip-link") || firstChild.classList.contains("ff-skip"))) {
      document.body.insertBefore(home, firstChild.nextSibling);
    } else {
      document.body.insertBefore(home, firstChild);
    }
    var themeButton = home.querySelector(".global-theme-toggle");
    if (!retainedThemeButton) themeButton.addEventListener("click", toggleTheme);
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
