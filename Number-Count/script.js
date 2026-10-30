(function () {
  'use strict';

  var MAX_ABS = 1000000000000;
  var DEFAULT_SUFFIX = '+';
  var els = {
    startNumber: document.getElementById('startNumber'),
    endNumber: document.getElementById('endNumber'),
    stepNumber: document.getElementById('stepNumber'),
    endText: document.getElementById('endText'),
    showEndText: document.getElementById('showEndText'),
    textColorPicker: document.getElementById('textColorPicker'),
    textColorHex: document.getElementById('textColorHex'),
    bgColorPicker: document.getElementById('bgColorPicker'),
    bgColorHex: document.getElementById('bgColorHex'),
    fontSize: document.getElementById('fontSize'),
    fontSizeValue: document.getElementById('fontSizeValue'),
    speed: document.getElementById('speed'),
    speedValue: document.getElementById('speedValue'),
    fontStyle: document.getElementById('fontStyle'),
    soundToggle: document.getElementById('soundToggle'),
    counterText: document.getElementById('counterText'),
    previewBox: document.getElementById('previewBox'),
    countSummary: document.getElementById('countSummary'),
    startBtn: document.getElementById('startBtn'),
    resetBtn: document.getElementById('resetBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    status: document.getElementById('status'),
    countError: document.getElementById('countError'),
    countErrorText: document.getElementById('countErrorText')
  };

  var numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var measureCanvas = document.createElement('canvas');
  var measureCtx = measureCanvas.getContext('2d');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var audioContext = null;
  var state = { mode: 'idle', frame: 0 };
  var lastTickTime = 0;

  function init() {
    bindEvents();
    updateFontLabel();
    updateSpeedLabel();
    updateRangeSummary();
    applyStageStyle();
    updateButtons();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { applyStageStyle(); }).catch(function () {});
    }
  }

  function bindEvents() {
    [els.startNumber, els.endNumber, els.stepNumber].forEach(function (input) {
      input.addEventListener('input', function () {
        hideError();
        updateRangeSummary();
        applyStageStyle();
      });
    });

    els.endText.addEventListener('input', function () {
      updateRangeSummary();
      applyStageStyle();
    });
    els.showEndText.addEventListener('change', function () {
      updateRangeSummary();
      applyStageStyle();
    });

    document.querySelectorAll('.preset-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        els.endNumber.value = button.getAttribute('data-value');
        hideError();
        updateRangeSummary();
        applyStageStyle();
        els.endNumber.focus();
      });
    });

    els.textColorPicker.addEventListener('input', function () {
      els.textColorHex.value = els.textColorPicker.value;
      els.textColorHex.setAttribute('aria-invalid', 'false');
      applyStageStyle();
    });
    els.textColorHex.addEventListener('input', handleHexInput.bind(null, els.textColorHex, els.textColorPicker));
    els.textColorHex.addEventListener('blur', restoreHex.bind(null, els.textColorHex, els.textColorPicker));
    els.bgColorPicker.addEventListener('input', function () {
      els.bgColorHex.value = els.bgColorPicker.value;
      els.bgColorHex.setAttribute('aria-invalid', 'false');
      applyStageStyle();
    });
    els.bgColorHex.addEventListener('input', handleHexInput.bind(null, els.bgColorHex, els.bgColorPicker));
    els.bgColorHex.addEventListener('blur', restoreHex.bind(null, els.bgColorHex, els.bgColorPicker));

    els.fontSize.addEventListener('input', function () {
      updateFontLabel();
      applyStageStyle();
    });
    els.speed.addEventListener('input', updateSpeedLabel);
    els.fontStyle.addEventListener('change', applyStageStyle);
    els.startBtn.addEventListener('click', startAnimation);
    els.resetBtn.addEventListener('click', resetAnimation);
    els.downloadBtn.addEventListener('click', downloadRecording);

    window.addEventListener('resize', applyStageStyle);
  }

  function formatNumber(value) {
    return numberFormat.format(value === 0 ? 0 : value);
  }

  function displayText(value, includeSuffix, config) {
    var text = formatNumber(value);
    if (includeSuffix && config.showEnd && config.suffix) return text + config.suffix;
    return text;
  }

  function updateFontLabel() {
    els.fontSizeValue.textContent = els.fontSize.value;
    els.fontSize.setAttribute('aria-valuetext', els.fontSize.value + ' pixels');
  }

  function updateSpeedLabel() {
    var seconds = Number(els.speed.value) / 1000;
    var label = seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + ' s';
    els.speedValue.textContent = label;
    els.speed.setAttribute('aria-valuetext', label);
  }

  function readConfig() {
    var rawStart = els.startNumber.value.trim();
    var rawEnd = els.endNumber.value.trim();
    var rawStep = els.stepNumber.value.trim();
    if (rawStart === '' || rawEnd === '') {
      return showRangeError('Enter both a start and an end number.', els.startNumber);
    }

    var start = Number(rawStart);
    var end = Number(rawEnd);
    var step = rawStep === '' ? 1 : Number(rawStep);
    if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(step)) {
      return showRangeError('Use whole numbers for the start, end, and step.', els.stepNumber);
    }
    if (Math.abs(start) > MAX_ABS || Math.abs(end) > MAX_ABS) {
      return showRangeError('Keep the numbers within one trillion (1,000,000,000,000).', els.endNumber);
    }
    if (end <= start) {
      return showRangeError('The end number must be greater than the start number.', els.endNumber);
    }
    if (step < 1) {
      return showRangeError('The step must be 1 or more.', els.stepNumber);
    }
    if (step > MAX_ABS) {
      return showRangeError('The step is too large. Use a smaller whole number.', els.stepNumber);
    }

    return {
      start: start,
      end: end,
      step: step,
      showEnd: els.showEndText.checked,
      suffix: els.endText.value || DEFAULT_SUFFIX,
      speed: Number(els.speed.value) || 500,
      sound: els.soundToggle.checked
    };
  }

  function showRangeError(message, focusElement) {
    els.countErrorText.textContent = message;
    els.countError.hidden = false;
    [els.startNumber, els.endNumber, els.stepNumber].forEach(function (input) {
      input.setAttribute('aria-invalid', 'false');
    });
    if (focusElement) {
      focusElement.setAttribute('aria-invalid', 'true');
      focusElement.focus();
    }
    setStatus('Check the range to continue.', 'ready');
    return null;
  }

  function hideError() {
    els.countError.hidden = true;
    [els.startNumber, els.endNumber, els.stepNumber].forEach(function (input) {
      input.setAttribute('aria-invalid', 'false');
    });
  }

  function updateRangeSummary() {
    var start = Number(els.startNumber.value);
    var end = Number(els.endNumber.value);
    var step = Number(els.stepNumber.value);
    if (els.startNumber.value.trim() === '' || els.endNumber.value.trim() === '' ||
      !Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(step) || step < 1) {
      els.countSummary.textContent = 'Set a whole-number start, end, and step.';
      return;
    }
    if (end <= start) {
      els.countSummary.textContent = 'The end number needs to be larger than the start.';
      return;
    }
    var suffix = els.showEndText.checked ? (els.endText.value || DEFAULT_SUFFIX) : '';
    els.countSummary.textContent = 'Counts ' + formatNumber(start) + ' to ' + formatNumber(end) +
      ' by ' + formatNumber(step) + (suffix ? ' · ends with “' + suffix + '”' : '');
  }

  function handleHexInput(hexInput, picker) {
    var value = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      hexInput.setAttribute('aria-invalid', 'false');
      picker.value = value;
      applyStageStyle();
    } else {
      hexInput.setAttribute('aria-invalid', 'true');
    }
  }

  function restoreHex(hexInput, picker) {
    if (hexInput.getAttribute('aria-invalid') === 'true') {
      hexInput.value = picker.value;
      hexInput.setAttribute('aria-invalid', 'false');
    }
  }

  function measureTextWidth(text, fontSize, fontFamily) {
    if (!measureCtx) return text.length * fontSize * .62;
    measureCtx.font = '800 100px ' + fontFamily;
    var atHundred = measureCtx.measureText(text).width;
    return atHundred * (fontSize / 100);
  }

  function fittedFontSize(config) {
    var userSize = Number(els.fontSize.value) || 80;
    var stageWidth = els.previewBox.clientWidth || 560;
    var stageHeight = els.previewBox.clientHeight || 300;
    var family = els.fontStyle.value;
    var startText = formatNumber(config.start);
    var endText = displayText(config.end, true, config);
    var widest = measureTextWidth(endText, 100, family) >= measureTextWidth(startText, 100, family) ? endText : startText;
    var textWidth = measureTextWidth(widest, userSize, family);
    var maxWidth = Math.max(80, stageWidth - Math.max(28, stageWidth * .1));
    var maxHeight = Math.max(60, stageHeight - 28);
    var size = userSize;
    if (textWidth > maxWidth) size = userSize * (maxWidth / textWidth);
    if (size * 1.15 > maxHeight) size = maxHeight / 1.15;
    return Math.max(12, Math.floor(size));
  }

  function applyStageStyle() {
    els.counterText.style.color = els.textColorPicker.value;
    els.previewBox.style.backgroundColor = els.bgColorPicker.value;
    els.counterText.style.fontFamily = els.fontStyle.value;
    var config = safeConfig();
    if (config) els.counterText.style.fontSize = fittedFontSize(config) + 'px';
    else els.counterText.style.fontSize = Number(els.fontSize.value) + 'px';
  }

  function safeConfig() {
    var start = Number(els.startNumber.value);
    var end = Number(els.endNumber.value);
    var step = els.stepNumber.value.trim() === '' ? 1 : Number(els.stepNumber.value);
    if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(step) || step < 1 || end <= start) return null;
    return {
      start: start,
      end: end,
      step: step,
      showEnd: els.showEndText.checked,
      suffix: els.endText.value || DEFAULT_SUFFIX
    };
  }

  function setCounter(value, includeSuffix, config) {
    els.counterText.textContent = displayText(value, includeSuffix, config);
  }

  function startAnimation() {
    if (state.mode !== 'idle') return;
    var config = readConfig();
    if (!config) return;

    hideError();
    cancelFrame();
    els.counterText.classList.remove('is-done');
    setCounter(config.start, false, config);
    state.mode = 'counting';
    updateButtons();
    lastTickTime = 0;
    if (config.sound) ensureAudio();

    if (reducedMotion.matches) {
      finishCount(config, true);
      return;
    }

    setStatus('Counting…', 'running');
    var totalSteps = Math.max(1, Math.ceil((config.end - config.start) / config.step));
    var duration = Math.max(16, config.speed);
    var startTime = performance.now();

    function frame(now) {
      var progress = Math.min(1, (now - startTime) / duration);
      var stepIndex = Math.floor(progress * totalSteps);
      var value = Math.min(config.start + stepIndex * config.step, config.end);
      var isFinal = progress >= 1;
      if (isFinal) value = config.end;
      setCounter(value, isFinal, config);
      if (config.sound && !isFinal && now - lastTickTime > 70) {
        playTick(progress);
        lastTickTime = now;
      }
      if (!isFinal) {
        state.frame = window.requestAnimationFrame(frame);
      } else {
        state.frame = 0;
        finishCount(config, false);
      }
    }

    state.frame = window.requestAnimationFrame(frame);
  }

  function finishCount(config, wasReduced) {
    state.mode = 'idle';
    cancelFrame();
    setCounter(config.end, true, config);
    els.counterText.classList.add('is-done');
    var finalText = displayText(config.end, true, config);
    setStatus((wasReduced ? 'Final number: ' : 'Done at ') + finalText, 'done');
    if (config.sound) playFinishChime();
    updateButtons();
  }

  function resetAnimation() {
    if (state.mode === 'recording') return;
    cancelFrame();
    state.mode = 'idle';
    updateButtons();
    hideError();
    els.counterText.classList.remove('is-done');
    var start = Number(els.startNumber.value);
    if (!Number.isInteger(start) || Math.abs(start) > MAX_ABS) start = 0;
    setCounter(start, false, safeConfig() || { showEnd: false, suffix: '' });
    setStatus('Ready', 'ready');
    applyStageStyle();
  }

  function cancelFrame() {
    if (state.frame) {
      window.cancelAnimationFrame(state.frame);
      state.frame = 0;
    }
  }

  function updateButtons() {
    var busy = state.mode !== 'idle';
    els.startBtn.disabled = busy;
    els.resetBtn.disabled = state.mode === 'recording';
    els.downloadBtn.disabled = busy;
  }

  function setStatus(message, tone) {
    els.status.textContent = message;
    els.status.className = 'status ' + tone;
  }

  function ensureAudio() {
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!audioContext) {
      try {
        audioContext = new AudioCtor();
      } catch (e) {
        return null;
      }
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(function () {});
    }
    return audioContext;
  }

  function playTone(frequency, duration, delay, volume) {
    if (!audioContext) return;
    var now = audioContext.currentTime + (delay || 0);
    var oscillator = audioContext.createOscillator();
    var gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function playTick(progress) {
    if (!audioContext) return;
    playTone(440 + Math.round(progress * 220), 0.035, 0, 0.028);
  }

  function playFinishChime() {
    if (!audioContext) return;
    playTone(660, 0.14, 0, 0.05);
    playTone(880, 0.22, 0.09, 0.045);
  }

  function downloadRecording() {
    if (state.mode !== 'idle') return;
    var config = readConfig();
    if (!config) return;

    if (typeof window.MediaRecorder !== 'function' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      setStatus('Video export is not supported in this browser. Try a recent Chrome, Edge, Firefox, or Safari.', 'error');
      return;
    }

    var canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      setStatus('Could not prepare the video canvas.', 'error');
      return;
    }

    var stream;
    try {
      stream = canvas.captureStream(60);
    } catch (e) {
      setStatus('This browser could not start video capture.', 'error');
      return;
    }

    var mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    var mimeType = '';
    for (var i = 0; i < mimeCandidates.length; i++) {
      if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(mimeCandidates[i])) {
        mimeType = mimeCandidates[i];
        break;
      }
    }

    var recorderOptions = { videoBitsPerSecond: 6000000 };
    if (mimeType) recorderOptions.mimeType = mimeType;

    var recorder;
    try {
      recorder = new window.MediaRecorder(stream, recorderOptions);
    } catch (e) {
      stopStream(stream);
      setStatus('This browser could not start a video recorder.', 'error');
      return;
    }

    var chunks = [];
    var videoFontSize = videoFontSizeFor(config);
    var videoFontFamily = els.fontStyle.value;
    var videoBackground = els.bgColorPicker.value;
    var videoText = els.textColorPicker.value;
    var recordingFinished = false;

    state.mode = 'recording';
    updateButtons();
    setStatus('Recording video…', 'running');

    function failRecording(message) {
      if (recordingFinished) return;
      recordingFinished = true;
      stopStream(stream);
      state.mode = 'idle';
      updateButtons();
      setStatus(message, 'error');
    }

    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    recorder.onerror = function () {
      failRecording('Recording failed. Try a smaller animation or another browser.');
    };

    recorder.onstop = function () {
      if (recordingFinished) return;
      recordingFinished = true;
      stopStream(stream);
      var actualType = recorder.mimeType || mimeType || 'video/webm';
      var extension = actualType.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
      if (!chunks.length) {
        state.mode = 'idle';
        updateButtons();
        setStatus('No video data was produced. Try again in a recent browser.', 'error');
        return;
      }
      var blob = new Blob(chunks, { type: actualType });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'number-counter-animation.' + extension;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      state.mode = 'idle';
      updateButtons();
      setStatus('Video ready — check your downloads.', 'done');
    };

    try {
      recorder.start();
    } catch (e) {
      stopStream(stream);
      state.mode = 'idle';
      updateButtons();
      setStatus('This browser could not start recording.', 'error');
      return;
    }

    var totalSteps = Math.max(1, Math.ceil((config.end - config.start) / config.step));
    var duration = Math.max(16, config.speed);
    var holdTime = 900;
    var startTime = performance.now();
    var finalText = displayText(config.end, true, config);

    function draw(now) {
      if (recordingFinished) return;
      var elapsed = now - startTime;
      var progress = Math.min(1, elapsed / duration);
      var stepIndex = Math.floor(progress * totalSteps);
      var value = progress >= 1 ? config.end : Math.min(config.start + stepIndex * config.step, config.end);
      var text = progress >= 1 ? finalText : formatNumber(value);

      ctx.fillStyle = videoBackground;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = videoText;
      ctx.font = '800 ' + videoFontSize + 'px ' + videoFontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      if (elapsed < duration + holdTime) {
        window.requestAnimationFrame(draw);
      } else {
        try {
          recorder.stop();
        } catch (e) {
          failRecording('Could not finish the recording. Please try again.');
        }
      }
    }

    window.requestAnimationFrame(draw);
  }

  function videoFontSizeFor(config) {
    var previewWidth = els.previewBox.clientWidth || 560;
    var scale = 1280 / previewWidth;
    var userSize = fittedFontSize(config) * scale;
    var family = els.fontStyle.value;
    var startText = formatNumber(config.start);
    var endText = displayText(config.end, true, config);
    var widest = measureTextWidth(endText, 100, family) >= measureTextWidth(startText, 100, family) ? endText : startText;
    var widestAtSize = measureTextWidth(widest, userSize, family);
    var maxWidth = 1280 - 120;
    var maxHeight = 720 - 100;
    var size = userSize;
    if (widestAtSize > maxWidth) size = userSize * (maxWidth / widestAtSize);
    if (size * 1.15 > maxHeight) size = maxHeight / 1.15;
    return Math.max(18, Math.floor(size));
  }

  function stopStream(stream) {
    if (stream && stream.getTracks) {
      stream.getTracks().forEach(function (track) { track.stop(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
