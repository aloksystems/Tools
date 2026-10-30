(function () {
    "use strict";

    var target = "login.html";
    var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var delay = prefersReducedMotion ? 200 : 1200;

    window.setTimeout(function () {
        window.location.replace(target);
    }, delay);
})();
