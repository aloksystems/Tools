(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const sP = $("startPer");
  const eP = $("endPer");
  const err = $("errorMsg");
  const calcBtn = $("calcBtn");
  const copyBtn = $("copyBtn");
  const resetBtn = $("resetBtn");

  const toast = $("toast");
  const resHm = $("resHm");
  const resMin = $("resMin");
  const barFill = $("barFill");
  const statsWrap = $("statsWrap");
  const barWrap = $("barWrap");
  const actionsWrap = $("actionsWrap");

  /* ── Slide Picker ── */
  function SlidePicker(containerId, min, max, defaultValue) {
    this.container = document.getElementById(containerId);
    this.min = min;
    this.max = max;
    this.total = max - min + 1;
    this.value = defaultValue;
    this.onChange = null;
    this.itemHeight = 56;
    this._build();
  }

  SlidePicker.prototype._build = function () {
    var html = '<div class="viewport"><div class="track">';
    for (var i = this.min; i <= this.max; i++) {
      var v = String(i).padStart(2, "0");
      html += '<div class="item">' + v + "</div>";
    }
    html += "</div></div>";
    this.container.innerHTML = html;

    this.viewport = this.container.querySelector(".viewport");
    this.track = this.container.querySelector(".track");

    var first = this.track.querySelector(".item");
    if (first) this.itemHeight = first.offsetHeight;

    this._setVal(this.value, true);
    this._initDrag();
  };

  SlidePicker.prototype._setVal = function (val, instant) {
    this.value = val;
    var idx = val - this.min;
    var t = -idx * this.itemHeight;
    this._offset = t;

    if (instant) {
      this.track.style.transition = "none";
      this.track.style.transform = "translateY(" + t + "px)";
      var self = this;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          self.track.style.transition = "";
        });
      });
    } else {
      this.track.style.transform = "translateY(" + t + "px)";
    }

    if (this.onChange) this.onChange(val);
  };

  SlidePicker.prototype._initDrag = function () {
    var self = this;
    var startY = 0;
    var startT = 0;
    var dragging = false;
    var lastVal = this.value;

    function onStart(e) {
      startY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
      startT = self._offset || 0;
      dragging = true;
      lastVal = self.value;
      self.track.classList.add("dragging");
      self.track.style.transition = "none";
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      var y = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
      var delta = y - startY;
      var maxT = 0;
      var minT = -(self.total - 1) * self.itemHeight;
      var newT = Math.max(minT, Math.min(maxT, startT + delta));
      self.track.style.transform = "translateY(" + newT + "px)";
      self._offset = newT;

      var idx = Math.round(-newT / self.itemHeight);
      idx = Math.max(0, Math.min(self.total - 1, idx));
      var snapVal = self.min + idx;

      if (snapVal !== lastVal) {
        lastVal = snapVal;
        if (self.onChange) self.onChange(snapVal, true);
      }
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      self.track.classList.remove("dragging");
      self.track.style.transition = "";
      var currentT = self._offset || 0;
      var idx = Math.round(-currentT / self.itemHeight);
      idx = Math.max(0, Math.min(self.total - 1, idx));
      self._setVal(self.min + idx);
    }

    this.viewport.addEventListener("mousedown", onStart);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    this.viewport.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  };

  /* ── Init Pickers ── */
  var startHour = new SlidePicker("startHourPicker", 1, 12, 9);
  var startMin = new SlidePicker("startMinPicker", 0, 59, 0);
  var endHour = new SlidePicker("endHourPicker", 1, 12, 5);
  var endMin = new SlidePicker("endMinPicker", 0, 59, 0);

  function refreshPickers() {
    [startHour, startMin, endHour, endMin].forEach(function (p) {
      var first = p.track.querySelector(".item");
      if (first) p.itemHeight = first.offsetHeight;
      p._setVal(p.value, true);
    });
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refreshPickers, 150);
  });

  function getVals() {
    return {
      sh: startHour.value,
      sm: startMin.value,
      sp: sP.value,
      eh: endHour.value,
      em: endMin.value,
      ep: eP.value
    };
  }

  /* ── Toast ── */
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 2000);
  }

  /* ── Calculate ── */
  function calculate() {
    err.textContent = "";
    var v = getVals();

    function to24(h, m, p) {
      var dec = h + m / 60;
      if (p === "AM") return h === 12 ? m / 60 : dec;
      return h === 12 ? 12 + m / 60 : h + 12 + m / 60;
    }

    var sDec = to24(v.sh, v.sm, v.sp);
    var eDec = to24(v.eh, v.em, v.ep);
    if (eDec <= sDec) eDec += 24;

    var netMin = Math.max(0, (eDec - sDec) * 60);
    var netH = Math.floor(netMin / 60);
    var netM = Math.round(netMin % 60);

    resHm.textContent = netMin > 0 ? netH + "h " + netM + "m" : "0h 0m";
    resMin.textContent = Math.round(netMin);

    barFill.style.width = Math.min(100, (netMin / (12 * 60)) * 100) + "%";

    statsWrap.style.display = "grid";
    barWrap.style.display = "block";
    actionsWrap.style.display = "flex";
  }

  function hideResults() {
    statsWrap.style.display = "none";
    barWrap.style.display = "none";
    actionsWrap.style.display = "none";
  }

  /* ── Auto calc ── */
  function autoCalc(val, dragging) {
    if (!dragging) calculate();
  }

  [startHour, startMin, endHour, endMin].forEach(function (p) { p.onChange = autoCalc; });
  sP.addEventListener("change", autoCalc);
  eP.addEventListener("change", autoCalc);

  calcBtn.addEventListener("click", function (e) { e.preventDefault(); calculate(); });

  /* ── Reset ── */
  resetBtn.addEventListener("click", function () {
    startHour._setVal(9);
    startMin._setVal(0);
    sP.value = "AM";
    endHour._setVal(5);
    endMin._setVal(0);
    eP.value = "AM";
    err.textContent = "";
    hideResults();
    showToast("Reset");
  });

  /* ── Copy ── */
  copyBtn.addEventListener("click", function () {
    var text = "Worked: " + resHm.textContent + "\nMinutes: " + resMin.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { showToast("Copied"); },
        function () { fallback(text); }
      );
    } else {
      fallback(text);
    }
  });

  function fallback(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); showToast("Copied"); } catch (_) { showToast("Copy failed"); }
    document.body.removeChild(ta);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.closest(".card")) calculate();
  });
})();
