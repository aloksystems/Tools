/* ==========================================================================
   WriteFlow — main application script
   Modules: Storage, Settings, TextParser, TimerManager, HighlightManager,
            SessionManager, UIManager, App
   Vanilla JS, no dependencies.
   ========================================================================== */

"use strict";

/* ---------- tiny helpers ---------- */
const $sel = (sel, el = document) => el.querySelector(sel);
const $all = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const clampNum = (v, min, max) => Math.min(max, Math.max(min, v));
const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(rest)}` : `${pad2(m)}:${pad2(rest)}`;
};
const escHTML = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hexToRgba = (hex, alpha) => {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ==========================================================================
   Storage — thin localStorage wrapper (keys namespaced "wf:")
   ========================================================================== */
const Storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("wf:" + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("wf:" + key, JSON.stringify(value)); } catch (e) { /* private mode / quota */ }
  },
  remove(key) {
    try { localStorage.removeItem("wf:" + key); } catch (e) { /* ignore */ }
  }
};

/* ==========================================================================
   Settings — app settings with defaults, persistence, change notification
   ========================================================================== */
const Settings = {
  defaults: {
    theme: "auto",
    mode: "word",            // "word" | "phrase" | "sentence"
    phraseSize: 3,
    speed: 2.0,              // seconds per base portion
    autoAdvance: true,
    smartPace: false,
    multiplier: 1,
    autoScroll: true,
    focus: false,
    hlColor: "#fee75c",
    hlOpacity: 55,
    hlRadius: 6,
    hlAnimate: true,
    fontSize: 22,
    fontFamily: "sans",
    lineHeight: 1.8,
    letterSpacing: 0,
    textWidth: "72ch",
    savedTexts: []
  },
  current: {},

  init() {
    const stored = {};
    for (const key of Object.keys(this.defaults)) {
      stored[key] = Storage.get(key, this.defaults[key]);
    }
    this.current = Object.assign({}, this.defaults, stored);
  },

  get(key) { return this.current[key]; },
  set(key, value, notify = true) {
    this.current[key] = value;
    Storage.set(key, value);
    if (notify && typeof this.onChange === "function") this.onChange(key, value);
  },
  loadSavedTexts() { return Array.isArray(this.current.savedTexts) ? this.current.savedTexts : []; },
  saveText(text) {
    const texts = this.loadSavedTexts();
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (texts[0] === trimmed) return true;
    texts.unshift(trimmed);
    if (texts.length > 6) texts.length = 6;
    this.set("savedTexts", texts);
    return true;
  },
  removeTextAt(index) {
    const texts = this.loadSavedTexts();
    texts.splice(index, 1);
    this.set("savedTexts", texts);
  },
  reset() {
    for (const key of Object.keys(this.defaults)) {
      this.current[key] = this.defaults[key];
      Storage.set(key, this.defaults[key]);
    }
    if (typeof this.onChange === "function") this.onChange("*", null);
  }
};

/* ==========================================================================
   TextParser — tokenize / count / split into portions
   ========================================================================== */
const TextParser = {
  // Split into word tokens; each keeps its trailing whitespace so the whole
  // text can be reconstructed exactly (paragraphs/newlines preserved).
  tokenize(text) {
    const out = [];
    const re = /(\S+)(\s*)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push({ word: m[1], spacing: m[2] });
    }
    return out;
  },

  countWords(text) { const t = text.trim(); return t ? t.split(/\s+/).length : 0; },
  countChars(text) { return text.length; },
  countSentences(text) { const s = this.splitSentences(text); return text.trim() ? Math.max(1, s.length) : 0; },

  // Sentence splitting with light abbreviation awareness.
  splitSentences(text) {
    const ABBR = new Set([
      "mr","mrs","ms","mx","dr","st","sr","jr","prof","rev","hon",
      "gov","sen","rep","gen","col","lt","sgt","capt","inc","ltd",
      "co","corp","dept","mt","ft","fig","etc","eg","ie","vs",
      "am","pm","phd","us","uk"
    ]);
    const sents = [];
    const n = text.length;
    let start = 0;
    let i = 0;
    while (i < n) {
      const ch = text[i];
      let end = i + 1;
      while (end < n && ".!?".includes(text[end])) end++;          // "...", "!!", "?!"
      let ws = end;
      while (ws < n && /\s/.test(text[ws])) ws++;                   // trailing whitespace
      const nextCh = ws < n ? text[ws] : "\0";

      let isEnd = false;
      if (ch === "." || ch === "!" || ch === "?") {
        // word-like token before the punctuation
        let k = i - 1;
        while (k >= 0 && /[A-Za-z0-9.\u2019']/.test(text[k])) k--;
        const beforeRaw = text.slice(k + 1, i);
        const before = beforeRaw.toLowerCase();
        const clean = before.replace(/[.\u2019']/g, "");
        const abbrev = ch === "." && (ABBR.has(clean) || /^[a-zA-Z]\.$/.test(beforeRaw));
        const isDecimal = ch === "." && /[0-9]/.test(text[i - 1] || "") && /[0-9]/.test(nextCh || "");
        if (!abbrev && !isDecimal) {
          if (ws >= n) isEnd = true;                                    // end of text
          else if (ws === end) isEnd = false;                           // no gap → keep together
          else if (ch === "!" || ch === "?") isEnd = true;              // strong punctuation splits
          else isEnd = /[A-Z0-9"'(]/.test(nextCh);                       // period: next begins a sentence
        }
      }
      if (isEnd) {
        sents.push(text.slice(start, ws));
        i = ws;
        start = ws;
        continue;
      }
      i++;
    }
    if (start < n) sents.push(text.slice(start));
    return sents.filter((s) => s.trim().length > 0);
  },

  // Build display chunks for a selected mode.
  buildChunks(text, mode, phraseSize) {
    if (!text.trim()) return [];
    if (mode === "sentence") {
      const s = this.splitSentences(text);
      return s.length ? s : [text];
    }
    const tokens = this.tokenize(text);
    const leadWs = (text.match(/^\s*/) || [""])[0];
    const words = tokens.map((t) => t.word + t.spacing);
    if (mode === "word") { if (words.length && leadWs) words[0] = leadWs + words[0]; return words; }
    // phrase mode: group N words; spacing handled by token join
    const size = Math.max(1, phraseSize | 0);
    const chunks = [];
    for (let i = 0; i < words.length; i += size) {
      chunks.push(words.slice(i, i + size).join(""));
    }
    if (chunks.length && leadWs) chunks[0] = leadWs + chunks[0];
    return chunks;
  }
};

/* ---------- sample text ---------- */
const SAMPLE_TEXT = [
  "Handwriting builds a direct, physical connection between your eyes and your hand, and many students find that copying material slowly makes it far easier to remember later.",
  "",
  "When you write a paragraph out by hand, you notice its punctuation, its rhythm, and the exact choice of words. A passage you have copied carefully stays with you in a way that skimming never quite matches.",
  "",
  "Use this tool to pace yourself: let each word or sentence settle before you move on, and give your hand the time it needs to keep up with your brain."
].join("\n");
/* ==========================================================================
   DOM references
   ========================================================================== */
const dom = {
  setupView: $sel("#setupView"),
  sessionView: $sel("#sessionView"),
  completeView: $sel("#completeView"),
  textInput: $sel("#textInput"),
  statsRow: $sel("#statsRow"),
  textOutput: $sel("#textOutput"),
  writeStage: $sel("#writeStage"),

  btnStart: $sel("#btnStart"),
  btnLoadSample: $sel("#btnLoadSample"),
  btnClearText: $sel("#btnClearText"),
  btnSaveText: $sel("#btnSaveText"),
  btnRecent: $sel("#btnRecent"),
  recentPop: $sel("#recentPop"),
  recentList: $sel("#recentList"),
  recentEmpty: $sel("#recentEmpty"),

  modeSeg: $sel("#modeSeg"),
  phraseField: $sel("#phraseField"),
  phraseNum: $sel("#phraseNum"),
  phraseRange: $sel("#phraseRange"),
  phraseMinus: $sel("#phraseMinus"),
  phrasePlus: $sel("#phrasePlus"),

  speedChips: $sel("#speedChips"),
  speedSlider: $sel("#speedSlider"),
  speedReadout: $sel("#speedReadout"),
  multiplierField: $sel("#multiplierField"),
  multiplierChips: $sel("#multiplierChips"),
  autoAdvance: $sel("#autoAdvance"),
  smartPace: $sel("#smartPace"),
  autoScroll: $sel("#autoScroll"),

  sumMode: $sel("#sumMode"),
  sumSpeed: $sel("#sumSpeed"),
  sumAuto: $sel("#sumAuto"),
  sumScroll: $sel("#sumScroll"),
  sumHighlight: $sel("#sumHighlight"),
  sumFontSize: $sel("#sumFontSize"),

  sessionModeChip: $sel("#sessionModeChip"),
  sessionPercent: $sel("#sessionPercent"),
  sessionPortionTop: $sel("#sessionPortionTop"),
  progressLabel: $sel("#progressLabel"),
  progressPct: $sel("#progressPct"),
  progressFill: $sel("#progressFill"),
  etaLabel: $sel("#etaLabel"),
  elapsedLabel: $sel("#elapsedLabel"),
  pausedBanner: $sel("#pausedBanner"),

  btnPrev: $sel("#btnPrev"),
  btnNext: $sel("#btnNext"),
  btnPlay: $sel("#btnPlay"),
  btnRestart: $sel("#btnRestart"),
  btnEnd: $sel("#btnEnd"),
  btnFocus: $sel("#btnFocus"),
  btnExitFocus: $sel("#btnExitFocus"),
  btnHelp: $sel("#btnHelp"),
  helpPop: $sel("#helpPop"),

  btnAgain: $sel("#btnAgain"),
  btnEditText: $sel("#btnEditText"),
  btnHome: $sel("#btnHome"),
  completePortions: $sel("#completePortions"),
  completeWords: $sel("#completeWords"),
  completeTime: $sel("#completeTime"),

  btnSettings: $sel("#btnSettings"),
  btnSettings2: $sel("#btnSettings2"),
  settingsDrawer: $sel("#settingsDrawer"),
  settingsBackdrop: $sel("#settingsBackdrop"),
  btnCloseSettings: $sel("#btnCloseSettings"),
  btnResetSettings: $sel("#btnResetSettings"),

  modalBackdrop: $sel("#modalBackdrop"),
  confirmModal: $sel("#confirmModal"),
  modalTitle: $sel("#modalTitle"),
  modalText: $sel("#modalText"),
  modalOk: $sel("#modalOk"),
  modalCancel: $sel("#modalCancel"),

  toastWrap: $sel("#toastWrap"),

  hlSwatches: $sel("#hlSwatches"),
  hlCustom: $sel("#hlCustom"),
  hlOpacity: $sel("#hlOpacity"),
  hlOpacityVal: $sel("#hlOpacityVal"),
  hlRadius: $sel("#hlRadius"),
  hlRadiusVal: $sel("#hlRadiusVal"),
  hlAnimate: $sel("#hlAnimate"),
  fontSize: $sel("#fontSize"),
  fontSizeVal: $sel("#fontSizeVal"),
  fontFamily: $sel("#fontFamily"),
  lineHeight: $sel("#lineHeight"),
  lineHeightVal: $sel("#lineHeightVal"),
  letterSpacing: $sel("#letterSpacing"),
  letterSpacingVal: $sel("#letterSpacingVal"),
  textWidthSeg: $sel("#textWidthSeg"),
  themeSeg: $sel("#themeSeg")
};

/* ==========================================================================
   TimerManager — guarantees exactly one active advancement timer.
   ========================================================================== */
const TimerManager = {
  _id: null,
  _duration: 0,
  _startedAt: 0,
  _remaining: 0,
  _cb: null,

  start(durationMs, cb) {
    this.stop();
    this._duration = durationMs;
    this._cb = cb;
    this._startedAt = Date.now();
    this._id = setTimeout(() => {
      this._id = null;
      this._remaining = 0;
      const cb = this._cb;
      this._cb = null;
      if (cb) cb();
    }, durationMs);
  },

  stop() {
    if (this._id !== null) { clearTimeout(this._id); this._id = null; }
    this._cb = null;
    this._remaining = 0;
  },

  pause() {
    if (this._id !== null) {
      this._remaining = Math.max(0, this._duration - (Date.now() - this._startedAt));
      clearTimeout(this._id);
      this._id = null;
    }
  },

  resume(cb) {
    if (this._remaining <= 0) return;
    this._duration = this._remaining;
    this._cb = cb;
    this._startedAt = Date.now();
    this._remaining = 0;
    this._id = setTimeout(() => {
      this._id = null;
      this._remaining = 0;
      const cb = this._cb;
      this._cb = null;
      if (cb) cb();
    }, this._duration);
  },

  isRunning() { return this._id !== null; },

  remaining() {
    if (this._id !== null) return Math.max(0, this._duration - (Date.now() - this._startedAt));
    return this._remaining;
  }
};

/* ==========================================================================
   HighlightManager — renders chunks, toggles the active highlight, scrolls.
   ========================================================================== */
const HighlightManager = {
  els: [],

  render(chunks) {
    dom.textOutput.innerHTML = chunks.map((c, i) => `<span class="chunk" data-i="${i}" aria-hidden="false">${escHTML(c)}</span>`).join("");
    this.els = $all(".chunk", dom.textOutput);
  },

  activate(index) {
    this.els.forEach((el, i) => el.classList.toggle("is-active", i === index));
  },

  scrollTo(el) {
    if (!Settings.get("autoScroll")) return;
    const stage = dom.writeStage;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    const topPad = 76, bottomPad = 96;
    if (r.top < box.top + topPad) {
      stage.scrollTo({ top: stage.scrollTop + (r.top - box.top - topPad), behavior });
    } else if (r.bottom > box.bottom - bottomPad) {
      stage.scrollTo({ top: stage.scrollTop + (r.bottom - box.bottom + bottomPad), behavior });
    }
  },

  scrollActive(index) {
    const el = this.els[index];
    if (el) this.scrollTo(el);
  }
};

/* ==========================================================================
   SessionManager — owns one active writing session.
   ========================================================================== */
const Session = {
  chunks: [],
  mode: "word",
  auto: true,
  status: "idle",          // "idle" | "running" | "paused" | "finished"
  index: 0,
  currentText: "",
  elapsedBase: 0,
  elapsedStart: 0,
  tickerId: null,

  /* --- timing --- */
  durationFor(idx) {
    const chunk = this.chunks[idx] || "";
    const base = Settings.get("speed") * 1000;
    if (!Settings.get("smartPace")) return Math.round(base);
    const factor = clampNum(chunk.length / 20, 0.5, 3);
    return Math.round(base * factor * Settings.get("multiplier"));
  },

  /* --- lifecycle --- */
  start(text) {
    this.currentText = text;
    this.mode = Settings.get("mode");
    this.auto = Settings.get("autoAdvance");
    this.chunks = TextParser.buildChunks(text, this.mode, Settings.get("phraseSize"));
    if (!this.chunks.length) { UIManager.toast("Please enter some text before starting.", "error"); return false; }

    HighlightManager.render(this.chunks);
    this.index = 0;
    this.status = "running";
    this.elapsedBase = 0;
    this.elapsedStart = Date.now();

    UIManager.setFocus(Settings.get("focus"), false);
    UIManager.setView("session");
    UIManager.updateSessionChrome(this);
    HighlightManager.activate(0);
    this.updateProgress();
    this.startTicker();
    if (this.auto) this.scheduleTimer();
    requestAnimationFrame(() => HighlightManager.scrollActive(0));
    return true;
  },

  scheduleTimer() {
    if (!this.auto || this.status !== "running") return;
    if (this.index >= this.chunks.length - 1) return;   // last chunk waits for manual finish
    const dur = this.durationFor(this.index);
    TimerManager.start(dur, () => this.tick());
  },

  tick() {
    if (this.status !== "running") return;
    if (this.index >= this.chunks.length - 1) { this.finish(); return; }
    this.index++;
    HighlightManager.activate(this.index);
    this.updateProgress();
    HighlightManager.scrollActive(this.index);
    if (this.auto && this.index < this.chunks.length - 1) this.scheduleTimer();
  },

  /* --- navigation --- */
  next() {
    if (this.status !== "running" && this.status !== "paused") return;
    if (this.index >= this.chunks.length - 1) { this.finish(); return; }
    TimerManager.stop();
    this.index++;
    this.activateCurrent();
  },

  prev() {
    if ((this.status !== "running" && this.status !== "paused") || this.index <= 0) return;
    TimerManager.stop();
    this.index--;
    this.activateCurrent();
  },

  activateCurrent() {
    HighlightManager.activate(this.index);
    this.updateProgress();
    HighlightManager.scrollActive(this.index);
    if (this.auto && this.status === "running") this.scheduleTimer();
  },

  /* --- play/pause --- */
  togglePlay() {
    if (this.status === "running") this.pause();
    else if (this.status === "paused") this.resume();
  },

  pause() {
    if (this.status !== "running") return;
    TimerManager.pause();
    this.elapsedBase += Date.now() - this.elapsedStart;
    this.status = "paused";
    UIManager.updateSessionChrome(this);
    this.updateProgress();
  },

  resume() {
    if (this.status !== "paused") return;
    this.status = "running";
    this.elapsedStart = Date.now();
    UIManager.updateSessionChrome(this);
    if (this.auto && this.index < this.chunks.length - 1) TimerManager.resume(() => this.tick());
    this.updateProgress();
  },

  /* --- restart / end / finish --- */
  restart() {
    TimerManager.stop();
    this.index = 0;
    this.status = "running";
    this.elapsedBase = 0;
    this.elapsedStart = Date.now();
    UIManager.setView("session");
    UIManager.updateSessionChrome(this);
    HighlightManager.activate(0);
    this.updateProgress();
    this.startTicker();
    if (this.auto) this.scheduleTimer();
    requestAnimationFrame(() => HighlightManager.scrollActive(0));
    UIManager.toast("Restarted from the first portion", "info");
  },

  teardown(viewName) {
    TimerManager.stop();
    this.stopTicker();
    this.status = "idle";
    UIManager.setFocus(false, false);
    UIManager.setView(viewName);
  },

  end() {
    UIManager.confirm({
      title: "End session?",
      text: "Your progress will be discarded, but the text stays in the editor.",
      danger: true
    }).then((ok) => { if (ok) this.teardown("setup"); });
  },

finish() {
    TimerManager.stop();
    this.status = "finished";
    this.stopTicker();
    UIManager.setFocus(false, false);
    const elapsed = Math.round(this.computeElapsed() / 1000);
    dom.completePortions.textContent = `${this.chunks.length} / ${this.chunks.length}`;
    dom.completeWords.textContent = TextParser.countWords(this.currentText).toLocaleString();
    dom.completeTime.textContent = fmtTime(elapsed);
    UIManager.setView("complete");
  },

  /* --- elapsed + progress + ticker --- */
  computeElapsed() {
    return this.elapsedBase + (this.status === "running" ? Date.now() - this.elapsedStart : 0);
  },

  startTicker() {
    this.stopTicker();
    this.tickerId = setInterval(() => {
      if (this.status === "running" || this.status === "paused") this.updateProgress();
    }, 1000);
  },

  stopTicker() {
    if (this.tickerId !== null) { clearInterval(this.tickerId); this.tickerId = null; }
  },

  updateProgress() {
    const total = this.chunks.length;
    const idx = this.index;
    const base = this.mode === "sentence" ? "Sentence" : this.mode === "phrase" ? "Chunk" : "Word";
    dom.progressLabel.textContent = `${base} ${idx + 1} / ${total}`;
    const pct = total ? Math.round(((idx + 1) / total) * 100) : 0;
    dom.progressPct.textContent = pct + "%";
    dom.sessionPercent.textContent = pct + "%";
    dom.sessionPortionTop.textContent = `${idx + 1} / ${total}`;
    dom.progressFill.style.width = pct + "%";
    dom.elapsedLabel.textContent = "elapsed " + fmtTime(Math.floor(this.computeElapsed() / 1000));
    if (this.auto) {
      dom.etaLabel.textContent = "remaining ~" + fmtTime(Math.floor(this.etaMs() / 1000));
      dom.etaLabel.title = "Estimated time remaining";
    } else {
      dom.etaLabel.textContent = `${total - idx - 1} more`;
      dom.etaLabel.title = "Manual mode — pace yourself";
    }
  },

  etaMs() {
    let acc = TimerManager.remaining();
    for (let i = this.index; i < this.chunks.length; i++) acc += this.durationFor(i);
    return acc;
  }
};

/* ==========================================================================
   UIManager — appearance, drawers, toasts, confirm modal, view switching
   ========================================================================== */
const UIManager = {
  /* ---------- views ---------- */
  setView(name) {
    dom.setupView.hidden = name !== "setup";
    dom.sessionView.hidden = name !== "session";
    dom.completeView.hidden = name !== "complete";
    window.scrollTo(0, 0);
    if (name === "setup") setTimeout(() => dom.textInput.focus({ preventScroll: true }), 120);
  },

  currentView() {
    if (!dom.sessionView.hidden) return "session";
    if (!dom.completeView.hidden) return "complete";
    return "setup";
  },

  /* ---------- session chrome (play button, paused banner, manual hint) ---------- */
  updateSessionChrome(session) {
    const playing = session.status === "running";
    dom.btnPlay.dataset.playing = playing ? "true" : "false";
    dom.btnPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
    dom.btnPlay.title = playing ? "Pause (Space)" : "Play (Space)";
    dom.pausedBanner.hidden = session.status !== "paused";

    const manual = !session.auto;
    dom.sessionView.dataset.manual = manual ? "true" : "false";
    const modeName = session.mode === "sentence" ? "Sentence" : session.mode === "phrase" ? "Phrase" : "Word";
    dom.sessionModeChip.textContent = `${modeName} · ${manual ? "Manual" : "Auto"}`;

    dom.btnNext.classList.toggle("is-done", manual);
    if (manual) {
      dom.btnNext.setAttribute("aria-label", "Done / next portion");
      dom.btnNext.title = "Done / Next (→)";
    } else {
      dom.btnNext.setAttribute("aria-label", "Next portion");
      dom.btnNext.title = "Next (→)";
    }
    dom.btnPrev.toggleAttribute("disabled", session.index <= 0);
    dom.btnNext.toggleAttribute("disabled", false);
  },

  /* ---------- focus mode ---------- */
  setFocus(on, persist = true) {
    document.body.classList.toggle("focus-mode", on);
    if (persist) Settings.set("focus", on, false);
  },
  toggleFocus() {
    this.setFocus(!document.body.classList.contains("focus-mode"));
  },

  /* ---------- settings drawer ---------- */
  openDrawer() {
    dom.settingsBackdrop.hidden = false;
    dom.settingsDrawer.hidden = false;
    this.refreshSettingsControls();
    const first = $sel("input, select, button", dom.settingsDrawer);
    if (first) first.focus();
    document.addEventListener("keydown", this._drawerKeydown);
  },
  closeDrawer() {
    if (dom.settingsDrawer.hidden) return;
    dom.settingsDrawer.hidden = true;
    dom.settingsBackdrop.hidden = true;
    document.removeEventListener("keydown", this._drawerKeydown);
  },
  _drawerKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); UIManager.closeDrawer(); }
  },
  toggleDrawer() {
    dom.settingsDrawer.hidden ? this.openDrawer() : this.closeDrawer();
  },

  /* ---------- help popover ---------- */
  toggleHelp() {
    dom.helpPop.hidden = !dom.helpPop.hidden;
  },

  /* ---------- toast ---------- */
  toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " is-error" : type === "info" ? " is-info" : "");
    el.textContent = message;
    dom.toastWrap.appendChild(el);
    setTimeout(() => { el.classList.add("is-hide"); setTimeout(() => el.remove(), 320); }, 2600);
  },

  /* ---------- confirm modal ---------- */
  confirm({ title, text, danger }) {
    return new Promise((resolve) => {
      dom.modalTitle.textContent = title;
      dom.modalText.textContent = text;
      dom.modalBackdrop.hidden = false;
      dom.confirmModal.hidden = false;
      dom.modalOk.classList.toggle("btn-danger", !!danger);
      this._confirmCb = resolve;
      dom.modalOk.focus();
    });
  },
  _confirmCb: null,
  resolveConfirm(result) {
    dom.modalBackdrop.hidden = true;
    dom.confirmModal.hidden = true;
    if (this._confirmCb) { this._confirmCb(result); this._confirmCb = null; }
  },

  /* ---------- appearance ---------- */
  applyVisual() {
    const s = Settings.current;
    const root = document.documentElement;

    // highlight
    root.style.setProperty("--hl-color", hexToRgba(s.hlColor, s.hlOpacity / 100));
    root.style.setProperty("--hl-radius", s.hlRadius + "px");
    document.body.classList.toggle("no-highlight-anim", !s.hlAnimate);

    // text
    root.style.setProperty("--write-size", s.fontSize + "px");
    root.style.setProperty("--write-lh", String(s.lineHeight));
    root.style.setProperty("--write-ls", s.letterSpacing + "px");
    root.style.setProperty("--write-width", s.textWidth);
    const fam = { sans: "var(--font-ui)", serif: "var(--font-write)", mono: "var(--font-mono)" }[s.fontFamily] || "var(--font-write)";
    root.style.setProperty("--write-family", fam);

    // theme
    this.applyTheme();
  },

  applyTheme() {
    const s = Settings.current;
    const isDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = s.theme === "auto" ? (isDark ? "dark" : "light") : s.theme;
    document.documentElement.setAttribute("data-theme", theme);
  },

  /* ---------- sync settings controls from Settings state ---------- */
  refreshSettingsControls() {
    const s = Settings.current;
    // mode
    $all(".seg-btn", dom.modeSeg).forEach((b) => b.classList.toggle("is-active", b.dataset.mode === s.mode));
    dom.phraseField.hidden = s.mode !== "phrase";
    dom.phraseRange.value = String(s.phraseSize);
    dom.phraseNum.textContent = String(s.phraseSize);
    // speed
    $all(".chip", dom.speedChips).forEach((b) => b.classList.toggle("is-active", Math.abs(parseFloat(b.dataset.speed) - s.speed) < 0.001));
    dom.speedSlider.value = String(s.speed);
    dom.speedReadout.textContent = s.speed.toFixed(1) + "s";
    // toggles
    dom.autoAdvance.checked = s.autoAdvance;
    dom.smartPace.checked = s.smartPace;
    dom.autoScroll.checked = s.autoScroll;
    dom.multiplierField.hidden = !s.smartPace;
    $all(".chip", dom.multiplierChips).forEach((b) => b.classList.toggle("is-active", Math.abs(parseFloat(b.dataset.mult) - s.multiplier) < 0.001));
    // highlight
    const custom = s.hlColor.toLowerCase() !== "#fee75c";
    $all(".swatch", dom.hlSwatches).forEach((b) => {
      const isSel = b.dataset.color.toLowerCase() === s.hlColor.toLowerCase();
      b.classList.toggle("is-active", isSel);
    });
    dom.hlCustom.value = s.hlColor;
    dom.hlOpacity.value = String(s.hlOpacity);
    dom.hlOpacityVal.textContent = s.hlOpacity + "%";
    dom.hlRadius.value = String(s.hlRadius);
    dom.hlRadiusVal.textContent = s.hlRadius + "px";
    dom.hlAnimate.checked = s.hlAnimate;
    // text
    dom.fontSize.value = String(s.fontSize);
    dom.fontSizeVal.textContent = s.fontSize + "px";
    dom.fontFamily.value = s.fontFamily;
    dom.lineHeight.value = String(s.lineHeight);
    dom.lineHeightVal.textContent = s.lineHeight.toFixed(1);
    dom.letterSpacing.value = String(s.letterSpacing);
    dom.letterSpacingVal.textContent = s.letterSpacing + "px";
    $all(".seg-btn", dom.textWidthSeg).forEach((b) => b.classList.toggle("is-active", b.dataset.width === s.textWidth));
    // theme
    $all(".seg-btn", dom.themeSeg).forEach((b) => b.classList.toggle("is-active", b.dataset.theme === s.theme));
  },

  /* ---------- summary preview on the setup card ---------- */
  refreshSummary() {
    const s = Settings.current;
    dom.sumMode.textContent = s.mode === "word" ? "Word" : s.mode === "phrase" ? `Phrase (${s.phraseSize})` : "Sentence";
    dom.sumSpeed.textContent = speedLabel(s.speed);
    dom.sumAuto.textContent = s.autoAdvance ? "ON" : "OFF";
    dom.sumScroll.textContent = s.autoScroll ? "ON" : "OFF";
    dom.sumHighlight.textContent = highlightName(s.hlColor);
    dom.sumFontSize.textContent = s.fontSize + "px";
  },

  /* ---------- stats line ---------- */
  refreshStats() {
    const t = dom.textInput.value;
    $all("[data-count]", dom.statsRow).forEach((el) => {
      const k = el.dataset.count;
      if (k === "words") el.textContent = TextParser.countWords(t).toLocaleString() + " words";
      else if (k === "chars") el.textContent = TextParser.countChars(t).toLocaleString() + " characters";
      else if (k === "sentences") el.textContent = TextParser.countSentences(t).toLocaleString() + " sentences";
    });
  },

  /* ---------- recent texts popover ---------- */
  renderRecent() {
    const texts = Settings.loadSavedTexts();
    dom.recentList.innerHTML = "";
    dom.recentEmpty.hidden = texts.length > 0;
    texts.forEach((t, i) => {
      const item = document.createElement("div");
      item.className = "recent-item";
      const label = document.createElement("span");
      label.className = "recent-text";
      label.textContent = t;
      label.title = t;
      const del = document.createElement("button");
      del.className = "recent-del";
      del.textContent = "✕";
      del.setAttribute("aria-label", "Delete saved text");
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        Settings.removeTextAt(i);
        this.renderRecent();
      });
      item.appendChild(label);
      item.appendChild(del);
      item.addEventListener("click", () => {
        dom.textInput.value = t;
        this.refreshStats();
        this.closeRecent();
        dom.textInput.focus();
      });
      dom.recentList.appendChild(item);
    });
  },
  toggleRecent() {
    if (dom.recentPop.hidden) { this.renderRecent(); dom.recentPop.hidden = false; }
    else this.closeRecent();
  },
  closeRecent() { dom.recentPop.hidden = true; }
};

/* ---------- helpers used by UI ---------- */
function speedLabel(sec) {
  const p = [
    [4.0, "Very Slow"], [2.8, "Slow"], [2.0, "Normal"],
    [1.2, "Fast"], [0.8, "Very Fast"]
  ];
  for (const [v, name] of p) if (Math.abs(v - sec) < 0.001) return name;
  return sec.toFixed(1) + "s";
}
function highlightName(hex) {
  const map = { "#fee75c": "Yellow", "#7df9b3": "Green", "#92c8fa": "Blue", "#d1a9f9": "Purple", "#ffc08a": "Orange", "#ff9a9a": "Red" };
  return map[hex.toLowerCase()] || "Custom";
}

/* ==========================================================================
   App — wiring events and keyboard shortcuts
   ========================================================================== */
const App = {
  init() {
    Settings.init();
    Settings.onChange = (key) => {
      if (key === "*") {
        UIManager.applyVisual();
        UIManager.refreshSettingsControls();
        UIManager.refreshSummary();
        return;
      }
      const visual = ["hlColor", "hlOpacity", "hlRadius", "hlAnimate", "fontSize",
                      "fontFamily", "lineHeight", "letterSpacing", "textWidth", "theme"];
      if (visual.includes(key)) UIManager.applyVisual();
      UIManager.refreshSettingsControls();
      UIManager.refreshSummary();
      if (Session.status === "running" || Session.status === "paused") Session.updateProgress();
      if (key === "theme") UIManager.applyTheme();
    };
    UIManager.setView("setup");
    UIManager.applyVisual();
    UIManager.refreshSettingsControls();
    UIManager.refreshSummary();
    UIManager.refreshStats();

    // theme auto-switching
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => UIManager.applyTheme());

    this.bindEvents();
    window.addEventListener("keydown", (e) => this.onKeydown(e));
  },

  bindEvents() {
    /* --- text input tools --- */
    dom.textInput.addEventListener("input", () => UIManager.refreshStats());
    dom.btnLoadSample.addEventListener("click", () => {
      dom.textInput.value = SAMPLE_TEXT;
      UIManager.refreshStats();
      UIManager.toast("Sample text loaded", "info");
    });
    dom.btnClearText.addEventListener("click", () => {
      const t = dom.textInput.value.trim();
      if (!t) return;
      if (t.length > 200) {
        UIManager.confirm({
          title: "Clear text?",
          text: "This will remove all the text from the editor (saved copies are kept).",
          danger: true
        }).then((ok) => { if (ok) this.clearInput(); });
      } else this.clearInput();
    });
    dom.btnSaveText.addEventListener("click", () => {
      const ok = Settings.saveText(dom.textInput.value);
      UIManager.toast(ok ? "Text saved locally" : "Nothing to save", ok ? "info" : "error");
    });
    dom.btnRecent.addEventListener("click", (e) => {
      e.stopPropagation();
      UIManager.toggleRecent();
    });
    document.addEventListener("click", (e) => {
      if (!dom.recentPop.hidden && !dom.recentPop.contains(e.target) && e.target !== dom.btnRecent) UIManager.closeRecent();
      if (!dom.helpPop.hidden && !dom.helpPop.contains(e.target) && e.target !== dom.btnHelp) dom.helpPop.hidden = true;
    });

    /* --- start --- */
    dom.btnStart.addEventListener("click", () => App.startSession());

    /* --- mode --- */
    dom.modeSeg.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      Settings.set("mode", btn.dataset.mode);
    });

    /* --- phrase size --- */
    dom.phraseMinus.addEventListener("click", () => this.adjustPhrase(-1));
    dom.phrasePlus.addEventListener("click", () => this.adjustPhrase(1));
    dom.phraseRange.addEventListener("input", () => this.adjustPhrase(0));
    dom.phraseRange.addEventListener("change", () => Settings.set("phraseSize", parseInt(dom.phraseRange.value, 10)));

    /* --- speed --- */
    dom.speedChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      Settings.set("speed", parseFloat(chip.dataset.speed));
    });
    dom.speedSlider.addEventListener("input", () => Settings.set("speed", parseFloat(dom.speedSlider.value)));
    dom.speedSlider.addEventListener("change", () => true);

    /* --- toggles --- */
    dom.autoAdvance.addEventListener("change", () => Settings.set("autoAdvance", dom.autoAdvance.checked));
    dom.smartPace.addEventListener("change", () => Settings.set("smartPace", dom.smartPace.checked));
    dom.autoScroll.addEventListener("change", () => Settings.set("autoScroll", dom.autoScroll.checked));
    dom.multiplierChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      Settings.set("multiplier", parseFloat(chip.dataset.mult));
    });

    /* --- session controls --- */
    dom.btnPrev.addEventListener("click", () => Session.prev());
    dom.btnNext.addEventListener("click", () => Session.next());
    dom.btnPlay.addEventListener("click", () => Session.togglePlay());
    dom.btnRestart.addEventListener("click", () => Session.restart());
    dom.btnEnd.addEventListener("click", () => Session.end());

    dom.btnFocus.addEventListener("click", () => UIManager.toggleFocus());
    dom.btnExitFocus.addEventListener("click", () => UIManager.toggleFocus());
    dom.btnHelp.addEventListener("click", (e) => { e.stopPropagation(); UIManager.toggleHelp(); });

    /* --- completion --- */
    dom.btnAgain.addEventListener("click", () => Session.start(Session.currentText));
    dom.btnEditText.addEventListener("click", () => Session.teardown("setup"));
    dom.btnHome.addEventListener("click", () => Session.teardown("setup"));

    /* --- settings --- */
    dom.btnSettings.addEventListener("click", () => UIManager.openDrawer());
    dom.btnSettings2.addEventListener("click", () => UIManager.openDrawer());
    dom.btnCloseSettings.addEventListener("click", () => UIManager.closeDrawer());
    dom.settingsBackdrop.addEventListener("click", () => UIManager.closeDrawer());

    dom.hlSwatches.addEventListener("click", (e) => {
      const sw = e.target.closest(".swatch");
      if (!sw) return;
      const color = sw.dataset.color;
      Settings.set("hlColor", color);
      UIManager.refreshSettingsControls();
    });
    dom.hlCustom.addEventListener("input", () => {
      Settings.set("hlColor", dom.hlCustom.value);
      UIManager.refreshSettingsControls();
    });
    dom.hlOpacity.addEventListener("input", () => {
      Settings.set("hlOpacity", parseInt(dom.hlOpacity.value, 10));
    });
    dom.hlRadius.addEventListener("input", () => {
      Settings.set("hlRadius", parseInt(dom.hlRadius.value, 10));
    });
    dom.hlAnimate.addEventListener("change", () => Settings.set("hlAnimate", dom.hlAnimate.checked));

    dom.fontSize.addEventListener("input", () => Settings.set("fontSize", parseInt(dom.fontSize.value, 10)));
    dom.fontFamily.addEventListener("change", () => Settings.set("fontFamily", dom.fontFamily.value));
    dom.lineHeight.addEventListener("input", () => Settings.set("lineHeight", parseFloat(dom.lineHeight.value)));
    dom.letterSpacing.addEventListener("input", () => Settings.set("letterSpacing", parseFloat(dom.letterSpacing.value)));
    dom.textWidthSeg.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      Settings.set("textWidth", btn.dataset.width);
    });
    dom.themeSeg.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      Settings.set("theme", btn.dataset.theme);
    });
    dom.btnResetSettings.addEventListener("click", () => {
      UIManager.confirm({
        title: "Reset all settings?",
        text: "Appearance and pacing preferences will return to their defaults.",
        danger: false
      }).then((ok) => { if (ok) { Settings.reset(); UIManager.toast("Settings reset to defaults", "info"); } });
    });

    /* --- modal --- */
    dom.modalOk.addEventListener("click", () => UIManager.resolveConfirm(true));
    dom.modalCancel.addEventListener("click", () => UIManager.resolveConfirm(false));
    dom.modalBackdrop.addEventListener("click", () => UIManager.resolveConfirm(false));
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !dom.confirmModal.hidden) UIManager.resolveConfirm(false);
    });
  },

  adjustPhrase(delta) {
    let v = parseInt(dom.phraseRange.value, 10) + delta;
    v = clampNum(v, 1, 10);
    dom.phraseRange.value = String(v);
    dom.phraseNum.textContent = String(v);
    Settings.set("phraseSize", v);
  },

  clearInput() {
    dom.textInput.value = "";
    UIManager.refreshStats();
    dom.textInput.focus();
    UIManager.toast("Text cleared", "info");
  },

  adjustSpeed(delta) {
    const v = clampNum(Settings.get("speed") + delta, 0.5, 10);
    Settings.set("speed", Math.round(v * 10) / 10);
    UIManager.toast(`Speed: ${speedLabel(v)}`, "info");
  },

  startSession() {
    const text = dom.textInput.value;
    if (!text.trim()) {
      UIManager.toast("Please enter some text before starting.", "error");
      dom.textInput.focus();
      return;
    }
    if (Session.start(text)) UIManager.closeDrawer();
  },

  onKeydown(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const isTyping = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;

    // Ctrl/Cmd+Enter inside the textarea starts a session
    if (tag === "textarea" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      App.startSession();
      return;
    }
    if (isTyping) return;

    // Esc: close overlays first, then pause
    if (e.key === "Escape") {
      if (!dom.settingsDrawer.hidden) { UIManager.closeDrawer(); return; }
      if (!dom.recentPop.hidden) { UIManager.closeRecent(); return; }
      if (!dom.helpPop.hidden) { dom.helpPop.hidden = true; return; }
      if (!dom.confirmModal.hidden) { UIManager.resolveConfirm(false); return; }
      if (!dom.sessionView.hidden && Session.status === "running") { Session.pause(); }
      return;
    }

    // Overlays open: don't fire session shortcuts
    if (!dom.settingsDrawer.hidden || !dom.recentPop.hidden || !dom.helpPop.hidden) return;

    // Session-view shortcuts
    if (!dom.sessionView.hidden && UIManager.currentView() === "session") {
      switch (e.key) {
        case " ": e.preventDefault(); Session.togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); Session.prev(); break;
        case "ArrowRight": e.preventDefault(); Session.next(); break;
        case "r": case "R": e.preventDefault(); Session.restart(); break;
        case "ArrowUp": e.preventDefault(); this.adjustSpeed(0.3); break;
        case "ArrowDown": e.preventDefault(); this.adjustSpeed(-0.3); break;
        case "f": case "F": e.preventDefault(); UIManager.toggleFocus(); break;
      }
    }
  }
};

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => App.init());
