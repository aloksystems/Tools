(function () {
  'use strict';

  // ---------- DOM ----------
  const statusMessage = document.getElementById('statusMessage');
  const typeTabs = document.getElementById('typeTabs');
  const tabButtons = Array.from(document.querySelectorAll('.type-tab'));
  const contentForms = document.getElementById('contentForms');
  const sizeChips = Array.from(document.querySelectorAll('.size-chip'));
  const fgColor = document.getElementById('fgColor');
  const bgColor = document.getElementById('bgColor');
  const fgColorValue = document.getElementById('fgColorValue');
  const bgColorValue = document.getElementById('bgColorValue');
  const contrastWarning = document.getElementById('contrastWarning');
  const contrastWarningText = document.getElementById('contrastWarningText');

  const qrCanvas = document.getElementById('qrCanvas');
  const qrPlaceholder = document.getElementById('qrPlaceholder');
  const qrPlaceholderText = document.getElementById('qrPlaceholderText');
  const qrError = document.getElementById('qrError');
  const metaType = document.getElementById('metaType');
  const metaSize = document.getElementById('metaSize');
  const metaModules = document.getElementById('metaModules');
  const metaContrast = document.getElementById('metaContrast');
  const payloadPreview = document.getElementById('payloadPreview');
  const copyPayloadBtn = document.getElementById('copyPayloadBtn');
  const downloadPngBtn = document.getElementById('downloadPngBtn');
  const downloadSvgBtn = document.getElementById('downloadSvgBtn');

  const qrUrl = document.getElementById('qr-url');
  const qrText = document.getElementById('qr-text');
  const wifiSsid = document.getElementById('wifi-ssid');
  const wifiPassword = document.getElementById('wifi-password');
  const wifiEncryption = document.getElementById('wifi-encryption');
  const emailTo = document.getElementById('email-to');
  const emailSubject = document.getElementById('email-subject');
  const emailBody = document.getElementById('email-body');
  const smsPhone = document.getElementById('sms-phone');
  const smsMessage = document.getElementById('sms-message');
  const vcardName = document.getElementById('vcard-name');
  const vcardPhone = document.getElementById('vcard-phone');
  const vcardEmail = document.getElementById('vcard-email');
  const vcardOrg = document.getElementById('vcard-org');

  // ---------- Constants ----------
  const TYPE_LABELS = {
    url: 'URL',
    text: 'Text',
    wifi: 'Wi-Fi',
    email: 'Email',
    sms: 'SMS',
    vcard: 'vCard'
  };
  const QUIET_MODULES = 4;
  const DEBOUNCE_MS = 250;

  const panels = {};
  tabButtons.forEach(function (button) {
    panels[button.dataset.type] = document.getElementById('panel-' + button.dataset.type);
  });

  // ---------- State ----------
  const state = {
    type: 'url',
    size: 256,
    payload: '',
    model: null,
    moduleCount: 0,
    qrReady: false,
    renderTimer: 0
  };

  let statusTimer = 0;

  // ---------- Utilities ----------
  function setStatus(message, type) {
    window.clearTimeout(statusTimer);
    statusMessage.textContent = message;
    statusMessage.className = 'status-banner' + (type === 'success' ? ' success' : type === 'error' ? ' error' : '');
    statusMessage.hidden = false;
    statusTimer = window.setTimeout(function () {
      statusMessage.hidden = true;
    }, 6000);
  }

  function truncate(value, length) {
    if (value.length <= length) return value;
    return value.slice(0, length - 1) + '…';
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  }

  function currentColors() {
    return {
      fg: normalizeColor(fgColor.value, '#0f172a'),
      bg: normalizeColor(bgColor.value, '#ffffff')
    };
  }

  function escapeWifi(value) {
    return String(value).replace(/([\\;,":])/g, '\\$1');
  }

  function escapeVCard(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  // ---------- Payload builders ----------
  function urlPayload() {
    const raw = qrUrl.value.trim();
    if (!raw) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
    if (raw.indexOf('//') === 0) return 'https:' + raw;
    if (/\s/.test(raw)) return raw;
    return 'https://' + raw;
  }

  function wifiPayload() {
    const ssid = wifiSsid.value.trim();
    if (!ssid) return '';
    const encryption = wifiEncryption.value;
    const password = wifiPassword.value;
    if (!encryption) {
      return 'WIFI:T:nopass;S:' + escapeWifi(ssid) + ';;';
    }
    return 'WIFI:T:' + encryption + ';S:' + escapeWifi(ssid) + ';P:' + escapeWifi(password) + ';;';
  }

  function emailPayload() {
    const to = emailTo.value.trim();
    if (!to) return '';
    const params = [];
    const subject = emailSubject.value.trim();
    const body = emailBody.value.trim();
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    if (body) params.push('body=' + encodeURIComponent(body));
    return 'mailto:' + to + (params.length ? '?' + params.join('&') : '');
  }

  function smsPayload() {
    const phone = smsPhone.value.trim();
    if (!phone) return '';
    return 'SMSTO:' + phone + ':' + smsMessage.value.trim();
  }

  function vcardPayload() {
    const name = vcardName.value.trim();
    const phone = vcardPhone.value.trim();
    const email = vcardEmail.value.trim();
    const org = vcardOrg.value.trim();
    if (!name && !phone && !email && !org) return '';

    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    if (name) {
      const escapedName = escapeVCard(name);
      lines.push('FN:' + escapedName);
      lines.push('N:' + escapedName + ';;;;');
    }
    if (phone) lines.push('TEL;TYPE=CELL:' + escapeVCard(phone));
    if (email) lines.push('EMAIL:' + escapeVCard(email));
    if (org) lines.push('ORG:' + escapeVCard(org));
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  function getPayload() {
    switch (state.type) {
      case 'text': return qrText.value.trim();
      case 'wifi': return wifiPayload();
      case 'email': return emailPayload();
      case 'sms': return smsPayload();
      case 'vcard': return vcardPayload();
      case 'url':
      default: return urlPayload();
    }
  }

  // ---------- Contrast ----------
  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    const channels = [rgb.r, rgb.g, rgb.b].map(function (channel) {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function contrastRatio(colorA, colorB) {
    const luminanceA = relativeLuminance(colorA);
    const luminanceB = relativeLuminance(colorB);
    const lighter = Math.max(luminanceA, luminanceB);
    const darker = Math.min(luminanceA, luminanceB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function updateContrast() {
    const colors = currentColors();
    fgColorValue.textContent = colors.fg;
    bgColorValue.textContent = colors.bg;
    const ratio = contrastRatio(colors.fg, colors.bg);
    metaContrast.textContent = ratio.toFixed(1) + ':1';

    if (ratio < 4.5) {
      contrastWarningText.textContent = 'Low contrast (' + ratio.toFixed(1) + ':1). Aim for at least 4.5:1 so scanners can read the modules.';
      contrastWarning.hidden = false;
    } else if (relativeLuminance(colors.bg) < relativeLuminance(colors.fg)) {
      contrastWarningText.textContent = 'The colours are inverted (' + ratio.toFixed(1) + ':1). Some scanner apps only read dark modules on a light background.';
      contrastWarning.hidden = false;
    } else {
      contrastWarning.hidden = true;
      contrastWarningText.textContent = '';
    }
  }

  // ---------- Tabs ----------
  function activateType(type, shouldFocus) {
    if (!TYPE_LABELS[type]) return;
    state.type = type;
    tabButtons.forEach(function (button) {
      const isActive = button.dataset.type === type;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
    });
    Object.keys(panels).forEach(function (key) {
      panels[key].hidden = key !== type;
    });
    if (shouldFocus) {
      const activeTab = tabButtons.find(function (button) {
        return button.dataset.type === type;
      });
      if (activeTab) activeTab.focus();
    }
    renderQR();
  }

  typeTabs.addEventListener('click', function (event) {
    const button = event.target.closest('.type-tab');
    if (button) activateType(button.dataset.type, false);
  });

  typeTabs.addEventListener('keydown', function (event) {
    const current = tabButtons.indexOf(document.activeElement);
    if (current === -1) return;
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % tabButtons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + tabButtons.length) % tabButtons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabButtons.length - 1;
    if (next === null) return;
    event.preventDefault();
    activateType(tabButtons[next].dataset.type, true);
  });

  // ---------- Size ----------
  function setSize(size) {
    state.size = size;
    sizeChips.forEach(function (chip) {
      const isActive = Number(chip.dataset.size) === size;
      chip.classList.toggle('active', isActive);
      chip.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
    renderQR();
  }

  sizeChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      setSize(Number(chip.dataset.size));
    });
  });

  // ---------- QR drawing ----------
  function drawQrCanvas(model, moduleCount) {
    const colors = currentColors();
    const size = state.size;
    const totalModules = moduleCount + QUIET_MODULES * 2;
    const context = qrCanvas.getContext('2d');
    if (!context) throw new Error('The browser could not create a drawing canvas.');

    qrCanvas.width = size;
    qrCanvas.height = size;
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, size, size);
    context.fillStyle = colors.fg;

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (!model.isDark(row, col)) continue;
        const x0 = Math.round((col + QUIET_MODULES) * size / totalModules);
        const x1 = Math.round((col + QUIET_MODULES + 1) * size / totalModules);
        const y0 = Math.round((row + QUIET_MODULES) * size / totalModules);
        const y1 = Math.round((row + QUIET_MODULES + 1) * size / totalModules);
        context.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      }
    }
  }

  function showQrUnavailable(message, errorMessage) {
    state.qrReady = false;
    state.model = null;
    qrCanvas.hidden = true;
    qrCanvas.width = 0;
    qrCanvas.height = 0;
    qrPlaceholder.hidden = false;
    qrPlaceholderText.textContent = message;
    qrError.hidden = !errorMessage;
    qrError.textContent = errorMessage || '';
    metaModules.textContent = '—';
    downloadPngBtn.disabled = true;
    downloadSvgBtn.disabled = true;
    copyPayloadBtn.disabled = !state.payload;
  }

  function renderQR() {
    window.clearTimeout(state.renderTimer);
    state.renderTimer = 0;

    const payload = getPayload();
    state.payload = payload;
    state.qrReady = false;
    state.model = null;

    metaType.textContent = TYPE_LABELS[state.type];
    metaSize.textContent = state.size + ' × ' + state.size + ' px';
    payloadPreview.textContent = payload ? truncate(payload.replace(/\s+/g, ' ').trim(), 160) : '—';
    payloadPreview.title = payload;
    copyPayloadBtn.disabled = !payload;
    updateContrast();

    if (!payload) {
      showQrUnavailable('Enter content to see your QR code.');
      return false;
    }

    if (typeof window.QRCode === 'undefined' || !window.QRCode.CorrectLevel) {
      showQrUnavailable('QR generation is unavailable.', 'The QR library could not load. Check your connection and reload the page.');
      return false;
    }

    try {
      const colors = currentColors();
      const holder = document.createElement('div');
      const instance = new window.QRCode(holder, {
        text: payload,
        width: state.size,
        height: state.size,
        colorDark: colors.fg,
        colorLight: colors.bg,
        correctLevel: window.QRCode.CorrectLevel.H
      });
      const model = instance._oQRCode;
      if (!model || typeof model.getModuleCount !== 'function' || typeof model.isDark !== 'function') {
        throw new Error('The QR library did not return a usable code.');
      }
      const moduleCount = model.getModuleCount();
      if (!moduleCount) throw new Error('The QR code is empty.');

      drawQrCanvas(model, moduleCount);
      state.model = model;
      state.moduleCount = moduleCount;
      state.qrReady = true;

      qrCanvas.hidden = false;
      qrPlaceholder.hidden = true;
      qrError.hidden = true;
      qrError.textContent = '';
      metaModules.textContent = moduleCount + ' × ' + moduleCount;
      qrCanvas.setAttribute('aria-label', TYPE_LABELS[state.type] + ' QR code preview, ' + state.size + ' by ' + state.size + ' pixels');
      downloadPngBtn.disabled = false;
      downloadSvgBtn.disabled = false;
      copyPayloadBtn.disabled = false;
      return true;
    } catch (error) {
      const detail = error && error.message ? error.message : String(error);
      const tooLong = /too long|overflow|length|capacity/i.test(detail) || payload.length > 800;
      const message = tooLong
        ? 'This content is too long for a QR code with high error correction. Shorten it and try again.'
        : 'The QR code could not be generated. Check the content and try again.';
      showQrUnavailable('The QR code could not be created.', message);
      return false;
    }
  }

  function scheduleRender() {
    window.clearTimeout(state.renderTimer);
    state.renderTimer = window.setTimeout(renderQR, DEBOUNCE_MS);
  }

  contentForms.addEventListener('input', scheduleRender);
  contentForms.addEventListener('change', scheduleRender);

  fgColor.addEventListener('input', function () {
    updateContrast();
    scheduleRender();
  });

  bgColor.addEventListener('input', function () {
    updateContrast();
    scheduleRender();
  });

  // ---------- SVG ----------
  function buildSvg() {
    const colors = currentColors();
    const moduleCount = state.moduleCount;
    const size = state.size;
    const totalModules = moduleCount + QUIET_MODULES * 2;
    let path = '';

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (!state.model.isDark(row, col)) continue;
        const x0 = Math.round((col + QUIET_MODULES) * size / totalModules);
        const x1 = Math.round((col + QUIET_MODULES + 1) * size / totalModules);
        const y0 = Math.round((row + QUIET_MODULES) * size / totalModules);
        const y1 = Math.round((row + QUIET_MODULES + 1) * size / totalModules);
        const width = Math.max(1, x1 - x0);
        const height = Math.max(1, y1 - y0);
        path += 'M' + x0 + ' ' + y0 + 'h' + width + 'v' + height + 'h-' + width + 'z';
      }
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
      '<title>' + TYPE_LABELS[state.type] + ' QR code</title>' +
      '<rect width="' + size + '" height="' + size + '" fill="' + colors.bg + '"/>' +
      '<path d="' + path + '" fill="' + colors.fg + '"/>' +
      '</svg>';
  }

  // ---------- Downloads and copy ----------
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function canvasToPngBlob() {
    return new Promise(function (resolve, reject) {
      try {
        qrCanvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('The browser could not encode the PNG.'));
        }, 'image/png');
      } catch (error) {
        reject(error);
      }
    });
  }

  function baseFilename() {
    return 'qr-' + state.type + '-' + state.size + 'px';
  }

  downloadPngBtn.addEventListener('click', async function () {
    if (!renderQR()) return;
    try {
      const blob = await canvasToPngBlob();
      const filename = baseFilename() + '.png';
      downloadBlob(blob, filename);
      setStatus('PNG downloaded as ' + filename + '.', 'success');
    } catch (error) {
      setStatus('Could not download the PNG. ' + error.message, 'error');
    }
  });

  downloadSvgBtn.addEventListener('click', function () {
    if (!renderQR()) return;
    try {
      const filename = baseFilename() + '.svg';
      const blob = new Blob([buildSvg()], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(blob, filename);
      setStatus('SVG downloaded as ' + filename + '.', 'success');
    } catch (error) {
      setStatus('Could not download the SVG. ' + error.message, 'error');
    }
  });

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    area.remove();
    return copied;
  }

  copyPayloadBtn.addEventListener('click', async function () {
    window.clearTimeout(state.renderTimer);
    state.renderTimer = 0;
    renderQR();
    if (!state.payload) {
      setStatus('There is no payload to copy yet.', 'error');
      return;
    }
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(state.payload);
        copied = true;
      } catch (error) {
        copied = false;
      }
    }
    if (!copied) copied = fallbackCopy(state.payload);
    if (copied) {
      setStatus('Payload copied to the clipboard.', 'success');
    } else {
      setStatus('Could not copy automatically. Select the payload and copy it manually.', 'error');
    }
  });

  // ---------- Init ----------
  fgColorValue.textContent = normalizeColor(fgColor.value, '#0f172a');
  bgColorValue.textContent = normalizeColor(bgColor.value, '#ffffff');
  updateContrast();
  activateType('url', false);
})();
