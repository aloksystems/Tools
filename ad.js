(function () {
  "use strict";

  var sponsorLinks = [
    {
      label: "Visit sponsor 1",
      url: "https://glamournakedemployee.com/c0v7ss8s?key=404418e272d4b2e08f4b7b09c32dfdba"
    },
    {
      label: "Visit sponsor 2",
      url: "https://glamournakedemployee.com/qsnz2inui7?key=5402fe1a00c5d9bfba766957ec772c8e"
    },
    {
      label: "Visit sponsor 3",
      url: "https://glamournakedemployee.com/m1dy2z0gif?key=5156bc8b5a2f5d7c6ddc68c21a6679e1"
    }
  ];
  var adHost = "https://glamournakedemployee.com/";
  var displayUnits = [
    { key: "3cf5131f1d8bdd318c95d9535c48776b", width: 160, height: 300 },
    { key: "9d8d1c02ebd41da7b80cdf46bc4fe300", width: 160, height: 600 },
    { key: "f99ce29dfdadd0bbf51d395237f5bc5e", width: 300, height: 250 },
    { key: "668e53ec8eb787bec77e79d7d17a4956", width: 320, height: 50 },
    { key: "0788dc589209cad31f36c2817ff56867", width: 468, height: 60 },
    { key: "a83e51dd8ad059968e0d171ee3347e82", width: 728, height: 90 }
  ];
  var nativeUnitKey = "5f8f71d0a111a0e90ee2a4c6ecc6c1ca";
  var intrusiveAdScripts = [
    "https://glamournakedemployee.com/38/3d/4d/383d4dda1c39ed4b3f90f42060afab89.js",
    "https://glamournakedemployee.com/b8/62/ab/b862ab33d4f693a9df286bae61c4eccb.js"
  ];

  // Rotation counter — random start so all 3 links get traffic across page loads.
  var sponsorIndex = Math.floor(Math.random() * sponsorLinks.length);

  function nextSponsorUrl() {
    if (!sponsorLinks.length) {
      return null;
    }
    var sponsor = sponsorLinks[sponsorIndex % sponsorLinks.length];
    sponsorIndex += 1;
    return sponsor.url;
  }

  function openSponsorInNewTab() {
    var url = nextSponsorUrl();
    if (!url) {
      return;
    }
    try {
      // NOTE: window.open with only 2 args opens a NEW TAB (not popup window).
      // 3rd arg (features) forces popup-window mode which browsers block
      // aggressively when combined with <a target="_blank">. So NO 3rd arg.
      // Must run synchronously in click handler + NO preventDefault elsewhere,
      // so tool + sponsor both get a chance.
      window.open(url, "_blank");
    } catch (e) {}
  }

  function shouldSkipClick(target) {
    if (!target || !target.closest) {
      return false;
    }
    // Don't re-trigger when user interacts with our own ad UI,
    // otherwise closing banner / clicking sponsor would spawn extra tabs.
    if (
      target.closest(
        "[data-sponsor-link], .sponsor-banner, [data-display-ad-stack], .display-ad-stack, [data-intrusive-ad-scripts]"
      )
    ) {
      return true;
    }
    if (target.closest('a[href*="glamournakedemployee.com"]')) {
      return true;
    }
    return false;
  }

  function initSponsorClickThrough() {
    if (window.__sponsorClickThroughInstalled) {
      return;
    }
    window.__sponsorClickThroughInstalled = true;

    // Seedha rule: har left-click pe ad new tab me + user ka kaam bhi.
    // Koi preventDefault / stopPropagation / modal nahi — dono khulenge.
    document.addEventListener(
      "click",
      function (e) {
        if (e.button !== undefined && e.button !== 0) {
          return;
        }
        if (shouldSkipClick(e.target)) {
          return;
        }
        openSponsorInNewTab();
      },
      false
    );
  }

  function addSponsorLink() {
    if (!document.body || document.querySelector("[data-sponsor-link]")) {
      return;
    }

    var banner = document.createElement("aside");
    banner.className = "sponsor-banner";
    banner.setAttribute("data-sponsor-link", "");
    banner.setAttribute("aria-label", "Sponsored link");
    banner.innerHTML =
      '<span class="sponsor-banner__label">Sponsored</span>' +
      '<span class="sponsor-banner__text">Support this free tool by checking out our sponsors.</span>' +
      '<span class="sponsor-banner__links"></span>' +
      '<button class="sponsor-banner__close" type="button" aria-label="Dismiss sponsored links">×</button>';

    var links = banner.querySelector(".sponsor-banner__links");
    sponsorLinks.forEach(function (sponsor) {
      var link = document.createElement("a");
      link.className = "sponsor-banner__link";
      link.href = sponsor.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = sponsor.label;
      links.appendChild(link);
    });

    banner
      .querySelector(".sponsor-banner__close")
      .addEventListener("click", function () {
        banner.remove();
      });

    document.body.appendChild(banner);
  }

  function addDisplayAds() {
    if (!document.body || document.querySelector("[data-display-ad-stack]")) {
      return;
    }

    var stack = document.createElement("section");
    stack.className = "display-ad-stack";
    stack.setAttribute("data-display-ad-stack", "");
    stack.setAttribute("aria-label", "Sponsored advertisements");

    var displaySlots = displayUnits.map(function (unit) {
      var wrapper = document.createElement("div");
      wrapper.className = "display-ad-slot";
      wrapper.setAttribute("aria-label", "Sponsored advertisement");

      watchAdSlot(wrapper);
      stack.appendChild(wrapper);
      return { unit: unit, wrapper: wrapper };
    });

    var nativeWrapper = document.createElement("div");
    nativeWrapper.className = "native-ad-wrapper";
    nativeWrapper.setAttribute("aria-label", "Sponsored recommendations");

    var nativeSlot = document.createElement("div");
    nativeSlot.className = "native-ad-slot";
    nativeSlot.id = "container-" + nativeUnitKey;
    nativeWrapper.appendChild(nativeSlot);

    watchAdSlot(nativeWrapper);
    stack.appendChild(nativeWrapper);

    document.body.appendChild(stack);
    loadDisplayUnit(displaySlots, 0, nativeWrapper);
  }

  function loadDisplayUnit(slots, index, nativeWrapper) {
    if (index >= slots.length) {
      loadNativeUnit(nativeWrapper);
      return;
    }

    var item = slots[index];
    var unit = item.unit;
    window.atOptions = {
      key: unit.key,
      format: "iframe",
      height: unit.height,
      width: unit.width,
      params: {}
    };

    var script = document.createElement("script");
    script.src = adHost + unit.key + "/invoke.js";
    script.onload = function () {
      loadDisplayUnit(slots, index + 1, nativeWrapper);
    };
    script.onerror = function () {
      item.wrapper.remove();
      loadDisplayUnit(slots, index + 1, nativeWrapper);
    };
    item.wrapper.appendChild(script);
  }

  function loadNativeUnit(nativeWrapper) {
    var nativeScript = document.createElement("script");
    nativeScript.async = true;
    nativeScript.setAttribute("data-cfasync", "false");
    nativeScript.src = adHost + nativeUnitKey + "/invoke.js";
    nativeWrapper.appendChild(nativeScript);
  }

  function addIntrusiveAdScripts() {
    // Disabled on purpose: these popunder/social-bar scripts hijack anchor
    // clicks and prevent the tool itself from opening (only sponsor opens).
    // Requirement is: tool opens in new tab AND sponsor opens alongside.
    // Our controlled click-through above already does that without blocking,
    // so we no longer load third-party click hijackers.
    return;
    if (!document.body || document.querySelector("[data-intrusive-ad-scripts]")) {
      return;
    }

    var scriptGroup = document.createElement("div");
    scriptGroup.setAttribute("data-intrusive-ad-scripts", "");
    scriptGroup.setAttribute("aria-hidden", "true");
    scriptGroup.style.position = "absolute";
    scriptGroup.style.width = "1px";
    scriptGroup.style.height = "1px";
    scriptGroup.style.overflow = "hidden";
    scriptGroup.style.clip = "rect(0 0 0 0)";

    intrusiveAdScripts.forEach(function (source) {
      var script = document.createElement("script");
      script.src = source;
      script.async = true;
      scriptGroup.appendChild(script);
    });

    document.body.appendChild(scriptGroup);
  }

  function watchAdSlot(slot) {
    var hasAdContent = function () {
      if (slot.querySelector("iframe, img, video, object, embed")) {
        return true;
      }

      return Array.prototype.some.call(slot.children, function (child) {
        return child.tagName !== "SCRIPT" && child.textContent.trim().length > 0;
      });
    };
    var revealIfFilled = function () {
      if (hasAdContent()) {
        slot.classList.add("is-filled");
      }
    };

    var observer = new MutationObserver(revealIfFilled);
    observer.observe(slot, { childList: true, subtree: true });
    revealIfFilled();
    window.setTimeout(function () {
      revealIfFilled();
      observer.disconnect();
      if (!slot.classList.contains("is-filled")) {
        slot.remove();
      }
    }, 8000);
  }

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
    a.innerHTML = '<span aria-hidden="true">←</span> All Tools';
    a.addEventListener("click", function (e) {
      try {
        e.preventDefault();
      } catch (err) {}
      // Back click bhi normal click hai: ad new tab me (document handler se),
      // back same-tab me — dono honge, koi rok nahi.
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

  function initializeAds() {
    addSponsorLink();
    addBackButton();
    addIntrusiveAdScripts();
    // Heavy display iframes first paint ke BAAD — fast launch ke liye.
    var runDisplay = function () {
      try {
        addDisplayAds();
      } catch (e) {}
    };
    try {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(runDisplay, { timeout: 2000 });
      } else {
        window.setTimeout(runDisplay, 1200);
      }
    } catch (e) {
      window.setTimeout(runDisplay, 1200);
    }
  }

  // Install immediately so the very first click is counted,
  // even before DOMContentLoaded fires (script is loaded with defer).
  try {
    initSponsorClickThrough();
  } catch (e) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAds, { once: true });
  } else {
    initializeAds();
  }
})();
