(function () {
  "use strict";

  var sponsorUrl =
    "https://glamournakedemployee.com/qsnz2inui7?key=5402fe1a00c5d9bfba766957ec772c8e";
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
      '<span class="sponsor-banner__text">Support this free tool by checking out our sponsor.</span>' +
      '<a class="sponsor-banner__link" href="' +
      sponsorUrl +
      '" target="_blank" rel="noopener noreferrer">Visit sponsor</a>' +
      '<button class="sponsor-banner__close" type="button" aria-label="Dismiss sponsored link">×</button>';

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
    if (!document.body || document.querySelector("[data-intrusive-ad-scripts]")) {
      return;
    }

    var scriptGroup = document.createElement("div");
    scriptGroup.setAttribute("data-intrusive-ad-scripts", "");
    scriptGroup.setAttribute("aria-hidden", "true");
    scriptGroup.style.display = "none";

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

  function initializeAds() {
    addSponsorLink();
    addDisplayAds();
    addIntrusiveAdScripts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAds, { once: true });
  } else {
    initializeAds();
  }
})();
