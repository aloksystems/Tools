document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('file-input');
  const chooseBtn = document.getElementById('chooseBtn');
  const filesList = document.getElementById('files-list');
  const emptyState = document.getElementById('empty-state');
  const fileCountBadge = document.getElementById('file-count-badge');
  const formatOptions = document.getElementById('format-options');
  const formatSupportNote = document.getElementById('format-support-note');
  const qualityGroup = document.getElementById('quality-group');
  const qualitySlider = document.getElementById('quality-slider');
  const qualityValue = document.getElementById('quality-value');
  const qualityHelp = document.getElementById('quality-help');
  const backgroundOptions = document.getElementById('backgroundOptions');
  const transparencyText = document.getElementById('transparency-text');
  const bgColorInput = document.getElementById('bg-color');
  const bgReset = document.getElementById('bg-reset');
  const convertBtn = document.getElementById('convert-btn');
  const clearBtn = document.getElementById('clear-btn');
  const statusMessage = document.getElementById('statusMessage');
  const summaryNote = document.getElementById('summary-note');
  const resultPreview = document.getElementById('result-preview');
  const resultPlaceholder = document.getElementById('result-placeholder');
  const resultBadge = document.getElementById('result-badge');
  const progressContainer = document.getElementById('progress-container');
  const progressText = document.getElementById('progress-text');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressBar = document.getElementById('progress-bar');
  const conversionResults = document.getElementById('conversion-results');
  const originalSizeEl = document.getElementById('original-size');
  const convertedSizeEl = document.getElementById('converted-size');
  const savingsBadge = document.getElementById('savings-badge');
  const resultDimensions = document.getElementById('result-dimensions');
  const resultFormat = document.getElementById('result-format');
  const resultName = document.getElementById('result-name');
  const totalFiles = document.getElementById('total-files');
  const totalSaved = document.getElementById('total-saved');
  const downloadCurrent = document.getElementById('download-current');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const previewContainer = document.getElementById('preview-container');

  const FORMATS = {
    png: { mime: 'image/png', label: 'PNG', ext: 'png', lossy: false, transparent: true },
    jpg: { mime: 'image/jpeg', label: 'JPG', ext: 'jpg', lossy: true, transparent: false },
    webp: { mime: 'image/webp', label: 'WebP', ext: 'webp', lossy: true, transparent: true },
    avif: { mime: 'image/avif', label: 'AVIF', ext: 'avif', lossy: true, transparent: true },
    bmp: { mime: 'image/bmp', label: 'BMP', ext: 'bmp', lossy: false, transparent: false }
  };
  const IMAGE_LABELS = {
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/webp': 'WebP',
    'image/gif': 'GIF',
    'image/bmp': 'BMP',
    'image/avif': 'AVIF',
    'image/tiff': 'TIFF',
    'image/heic': 'HEIC',
    'image/heif': 'HEIF'
  };
  const DOWNLOAD_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  const SPIN_ICON = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const CONVERT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  let uploadedFiles = [];
  let activeId = null;
  let nextId = 1;
  let busy = false;
  let addChain = Promise.resolve();
  let statusTimer = 0;
  let progressTimer = 0;
  const unavailableFormats = new Set();

  function setStatus(message, type = 'info', autoHide = 4500) {
    window.clearTimeout(statusTimer);
    statusMessage.textContent = message;
    statusMessage.className = `status-banner ${type}`.trim();
    statusMessage.hidden = !message;
    if (message && autoHide) {
      statusTimer = window.setTimeout(() => {
        statusMessage.hidden = true;
      }, autoHide);
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  }

  function formatFromFile(file) {
    if (IMAGE_LABELS[file.type]) return IMAGE_LABELS[file.type];
    return (file.name.split('.').pop() || 'Image').toUpperCase();
  }

  function safeBase(name) {
    const cleaned = (name.replace(/\.[^/.]+$/, '') || 'image')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    return cleaned || 'image';
  }

  function buildOutputName(name, format) {
    return `${safeBase(name)}-converted.${FORMATS[format].ext}`;
  }

  function isImageFile(file) {
    return /^image\//.test(file.type || '') || /\.(jpe?g|png|webp|avif|bmp|gif|tiff?|heic|heif)$/i.test(file.name);
  }

  function isHeic(file) {
    return /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]$/.test(file.type || '');
  }

  function getFormat() {
    const checked = formatOptions.querySelector('input[name="output-format"]:checked');
    return checked ? checked.value : 'png';
  }

  function getFormatMeta(format = getFormat()) {
    return FORMATS[format] || FORMATS.png;
  }

  function getQuality() {
    return Math.max(1, Math.min(100, parseInt(qualitySlider.value, 10) || 85));
  }

  function getBackground() {
    const value = (bgColorInput.value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The browser could not open this image.'));
      image.src = url;
    });
  }

  function getActiveItem() {
    return uploadedFiles.find((item) => item.id === activeId) || null;
  }

  function getResults() {
    return uploadedFiles.filter((item) => item.result);
  }

  function getSummaryItem() {
    const active = getActiveItem();
    if (active && active.result) return active;
    const results = getResults();
    return results.length ? results[results.length - 1] : null;
  }

  function updateQuality() {
    qualityValue.textContent = `${getQuality()}%`;
  }

  function syncFormatCards() {
    formatOptions.querySelectorAll('.format-card').forEach((card) => {
      const input = card.querySelector('input');
      card.classList.toggle('is-selected', input.checked);
    });
  }

  function syncFormatAvailability() {
    formatOptions.querySelectorAll('input[name="output-format"]').forEach((input) => {
      const unsupported = unavailableFormats.has(input.value);
      input.disabled = busy || unsupported;
      const card = input.closest('.format-card');
      if (card) {
        card.classList.toggle('is-unsupported', unsupported);
        if (unsupported) card.title = `${FORMATS[input.value].label} encoding is not available in this browser.`;
      }
    });
    if (unavailableFormats.size) {
      const labels = Array.from(unavailableFormats).map((key) => FORMATS[key].label);
      formatSupportNote.textContent = `${labels.join(' and ')} encoding is not available in this browser. PNG, JPG, and BMP still work.`;
      formatSupportNote.hidden = false;
    } else {
      formatSupportNote.hidden = true;
      formatSupportNote.textContent = '';
    }
  }

  function updateFormatUI() {
    const format = getFormat();
    const meta = getFormatMeta(format);
    syncFormatCards();
    qualitySlider.disabled = busy || !meta.lossy;
    qualityGroup.classList.toggle('is-disabled', qualitySlider.disabled);
    qualityHelp.textContent = meta.lossy
      ? 'Affects JPG, WebP, and AVIF output.'
      : `${meta.label} is lossless — the quality slider does not apply.`;
    backgroundOptions.hidden = !(format === 'jpg' || format === 'bmp');
    transparencyText.textContent = format === 'jpg'
      ? 'JPG has no transparency. Transparent areas will be filled with the background colour (white is the default).'
      : 'BMP output is 24-bit and has no transparency. Transparent areas will be filled with the background colour.';
    bgColorInput.disabled = busy;
    bgReset.disabled = busy;
  }

  function renderAll() {
    renderFileList();
    renderSummary();
  }

  function renderFileList() {
    filesList.innerHTML = '';
    const count = uploadedFiles.length;
    fileCountBadge.textContent = String(count);
    fileCountBadge.hidden = count === 0;
    emptyState.classList.toggle('hidden', count > 0);
    convertBtn.disabled = busy || count === 0;
    clearBtn.disabled = busy || count === 0;

    uploadedFiles.forEach((item) => {
      const row = document.createElement('li');
      row.className = `file-row${item.id === activeId ? ' is-active' : ''}`;

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'file-select';
      select.setAttribute('aria-pressed', item.id === activeId ? 'true' : 'false');
      select.setAttribute('aria-label', `Select ${item.file.name}`);

      const thumb = document.createElement('img');
      thumb.className = 'file-thumb';
      thumb.src = item.url;
      thumb.alt = '';
      thumb.loading = 'lazy';

      const copy = document.createElement('span');
      copy.className = 'file-copy';
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = item.file.name;
      name.title = item.file.name;
      const meta = document.createElement('span');
      meta.className = 'file-meta';
      meta.textContent = `${item.format} · ${item.width} × ${item.height} px · ${formatBytes(item.file.size)}`;
      copy.append(name, meta);
      select.append(thumb, copy);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'file-remove';
      remove.innerHTML = '&times;';
      remove.setAttribute('aria-label', `Remove ${item.file.name}`);
      remove.disabled = busy;
      remove.addEventListener('click', () => removeFile(item.id));

      select.addEventListener('click', () => {
        activeId = item.id;
        filesList.querySelectorAll('.file-row').forEach((el, index) => {
          const isActive = uploadedFiles[index] && uploadedFiles[index].id === activeId;
          el.classList.toggle('is-active', isActive);
          const btn = el.querySelector('.file-select');
          if (btn) btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        renderSummary();
      });

      row.append(select, remove);
      filesList.appendChild(row);
    });
  }

  function renderSummary() {
    const results = getResults();
    const summaryItem = getSummaryItem();

    if (!uploadedFiles.length) {
      summaryNote.textContent = 'Add images, choose a format, and convert to see the result.';
    } else if (busy) {
      summaryNote.textContent = `${results.length} of ${uploadedFiles.length} images converted…`;
    } else if (summaryItem) {
      summaryNote.textContent = `${results.length} converted image${results.length === 1 ? '' : 's'}. Select a file below to preview it.`;
    } else {
      summaryNote.textContent = `${uploadedFiles.length} image${uploadedFiles.length === 1 ? '' : 's'} ready. Choose a format and convert.`;
    }

    if (!summaryItem) {
      resultPreview.hidden = true;
      resultPreview.removeAttribute('src');
      resultPlaceholder.hidden = false;
      resultBadge.hidden = true;
      conversionResults.hidden = true;
      downloadCurrent.disabled = true;
      downloadAllBtn.disabled = true;
      downloadCurrent.innerHTML = `${DOWNLOAD_ICON} Download image`;
      return;
    }

    const result = summaryItem.result;
    resultPreview.src = result.url;
    resultPreview.alt = `Converted preview of ${summaryItem.file.name}`;
    resultPreview.hidden = false;
    resultPlaceholder.hidden = true;
    resultBadge.hidden = false;
    resultBadge.textContent = `${result.formatLabel} · ${result.width} × ${result.height} px`;
    conversionResults.hidden = false;

    originalSizeEl.textContent = formatBytes(result.originalSize);
    convertedSizeEl.textContent = formatBytes(result.blob.size);
    const diff = result.originalSize - result.blob.size;
    const percent = result.originalSize > 0 ? Math.round((diff / result.originalSize) * 100) : 0;
    savingsBadge.hidden = false;
    if (percent > 0) {
      savingsBadge.textContent = `${percent}% smaller`;
      savingsBadge.className = 'savings-badge saved';
    } else if (percent < 0) {
      savingsBadge.textContent = `${Math.abs(percent)}% larger`;
      savingsBadge.className = 'savings-badge larger';
    } else {
      savingsBadge.textContent = 'No size change';
      savingsBadge.className = 'savings-badge';
    }

    resultDimensions.textContent = `${result.width} × ${result.height} px`;
    resultFormat.textContent = result.formatLabel;
    resultName.textContent = result.name;
    resultName.title = result.name;

    totalFiles.textContent = `${results.length} file${results.length === 1 ? '' : 's'}`;
    const totalOriginal = results.reduce((sum, item) => sum + item.result.originalSize, 0);
    const totalConverted = results.reduce((sum, item) => sum + item.result.blob.size, 0);
    const totalDiff = totalOriginal - totalConverted;
    totalSaved.textContent = totalDiff > 0
      ? `${formatBytes(totalDiff)} saved`
      : totalDiff < 0
        ? `${formatBytes(Math.abs(totalDiff))} larger`
        : 'No size change';

    downloadCurrent.disabled = busy;
    downloadCurrent.innerHTML = `${DOWNLOAD_ICON} Download .${result.ext}`;
    downloadAllBtn.disabled = busy || results.length === 0;

    renderResultList(summaryItem);
  }

  function renderResultList(activeResultItem) {
    previewContainer.innerHTML = '';
    getResults().forEach((item) => {
      const row = document.createElement('div');
      row.className = `result-row${activeResultItem && item.id === activeResultItem.id ? ' is-active' : ''}`;
      row.setAttribute('role', 'listitem');

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'result-select';
      select.setAttribute('aria-label', `Preview ${item.result.name}`);
      const thumb = document.createElement('img');
      thumb.className = 'result-thumb';
      thumb.src = item.result.url;
      thumb.alt = '';
      thumb.loading = 'lazy';
      const copy = document.createElement('span');
      copy.className = 'result-copy';
      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = item.result.name;
      const meta = document.createElement('span');
      meta.className = 'result-meta';
      meta.textContent = `${item.result.formatLabel} · ${formatBytes(item.result.blob.size)}`;
      copy.append(name, meta);
      select.append(thumb, copy);
      select.addEventListener('click', () => {
        activeId = item.id;
        renderFileList();
        renderSummary();
      });

      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'result-download';
      download.innerHTML = DOWNLOAD_ICON;
      download.setAttribute('aria-label', `Download ${item.result.name}`);
      download.disabled = busy;
      download.addEventListener('click', () => downloadResult(item));

      row.append(select, download);
      previewContainer.appendChild(row);
    });
  }

  function setBusy(value) {
    busy = value;
    chooseBtn.disabled = value;
    qualitySlider.disabled = value || !getFormatMeta().lossy;
    document.querySelectorAll('.file-remove').forEach((button) => {
      button.disabled = value;
    });
    previewContainer.querySelectorAll('button').forEach((button) => {
      button.disabled = value;
    });
    convertBtn.innerHTML = value ? `${SPIN_ICON} Converting…` : `${CONVERT_ICON} Convert images`;
    clearBtn.disabled = value || uploadedFiles.length === 0;
    convertBtn.disabled = value || uploadedFiles.length === 0;
    bgColorInput.disabled = value;
    bgReset.disabled = value;
    syncFormatAvailability();
    updateFormatUI();
    if (value) {
      downloadCurrent.disabled = true;
      downloadAllBtn.disabled = true;
    } else {
      renderSummary();
    }
  }

  function supportsEncoding(mime) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      try {
        canvas.toBlob((blob) => resolve(Boolean(blob) && blob.type === mime), mime, 0.8);
      } catch (error) {
        resolve(false);
      }
    });
  }

  async function detectFormatSupport() {
    const [webp, avif] = await Promise.all([
      supportsEncoding('image/webp'),
      supportsEncoding('image/avif')
    ]);
    if (!webp) unavailableFormats.add('webp');
    if (!avif) unavailableFormats.add('avif');
    syncFormatAvailability();
    if (unavailableFormats.has(getFormat())) {
      const pngInput = formatOptions.querySelector('input[value="png"]');
      if (pngInput) pngInput.checked = true;
      syncFormatCards();
      setStatus('That format is not supported here, so PNG has been selected instead.', 'info', 5000);
    }
    updateFormatUI();
  }

  async function prepareHeic(file) {
    if (!isHeic(file)) return file;
    if (typeof window.heic2any === 'undefined') {
      throw new Error('HEIC support could not load. Check your connection and reload, or choose another image.');
    }
    const converted = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const name = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    addChain = addChain.then(() => processFiles(files));
  }

  async function processFiles(files) {
    if (busy) {
      setStatus('Please wait for the current conversion to finish.', 'info', 3000);
      return;
    }
    const incoming = files.filter(isImageFile);
    if (!incoming.length) {
      setStatus('No supported image files were found.', 'error', 0);
      return;
    }

    let added = 0;
    let duplicates = 0;
    let failed = 0;
    let preparedHeic = 0;
    const errors = [];

    for (const original of incoming) {
      let file = original;
      try {
        if (isHeic(original)) {
          setStatus('Preparing HEIC image for conversion…', 'info', 0);
          file = await prepareHeic(original);
          preparedHeic += 1;
        }
      } catch (error) {
        failed += 1;
        errors.push(error.message);
        continue;
      }

      if (uploadedFiles.some((item) => item.file.name === file.name && item.file.size === file.size)) {
        duplicates += 1;
        continue;
      }

      const url = URL.createObjectURL(file);
      try {
        const image = await loadImage(url);
        uploadedFiles.push({
          id: nextId++,
          file,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          format: formatFromFile(file),
          result: null
        });
        if (activeId === null) activeId = uploadedFiles[uploadedFiles.length - 1].id;
        added += 1;
      } catch (error) {
        URL.revokeObjectURL(url);
        failed += 1;
        errors.push(`${original.name} could not be opened.`);
      }
    }

    fileInput.value = '';
    renderAll();

    const parts = [];
    if (added) parts.push(`${added} image${added === 1 ? '' : 's'} added`);
    if (preparedHeic) parts.push(`${preparedHeic} HEIC converted to JPEG for editing`);
    if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped`);
    if (failed) parts.push(`${failed} file${failed === 1 ? '' : 's'} could not be prepared`);
    setStatus(parts.length ? parts.join(' · ') : 'No images were added.', failed ? 'error' : added ? 'success' : 'info', failed ? 0 : 4500);
  }

  function removeFile(id) {
    if (busy) return;
    const index = uploadedFiles.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [removed] = uploadedFiles.splice(index, 1);
    URL.revokeObjectURL(removed.url);
    if (removed.result) URL.revokeObjectURL(removed.result.url);
    if (activeId === removed.id) {
      activeId = uploadedFiles.length ? uploadedFiles[Math.min(index, uploadedFiles.length - 1)].id : null;
    }
    renderAll();
    setStatus(`${removed.file.name} removed.`, 'info', 3000);
  }

  function canvasToBmp(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext('2d');
    const pixels = context.getImageData(0, 0, width, height).data;
    const rowSize = Math.ceil((width * 3) / 4) * 4;
    const pixelBytes = rowSize * height;
    const buffer = new ArrayBuffer(54 + pixelBytes);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    view.setUint8(0, 0x42);
    view.setUint8(1, 0x4d);
    view.setUint32(2, 54 + pixelBytes, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(34, pixelBytes, true);
    view.setUint32(38, 2835, true);
    view.setUint32(42, 2835, true);

    for (let y = 0; y < height; y += 1) {
      const sourceRow = (height - 1 - y) * width * 4;
      let target = 54 + y * rowSize;
      for (let x = 0; x < width; x += 1) {
        const source = sourceRow + x * 4;
        bytes[target] = pixels[source + 2];
        bytes[target + 1] = pixels[source + 1];
        bytes[target + 2] = pixels[source];
        target += 3;
      }
    }
    return new Blob([buffer], { type: 'image/bmp' });
  }

  async function convertItem(item, settings) {
    const image = await loadImage(item.url);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error('The image has no readable dimensions.');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available in this browser.');

    if (!settings.meta.transparent) {
      context.fillStyle = settings.background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);

    let blob;
    if (settings.format === 'bmp') {
      blob = canvasToBmp(canvas);
    } else {
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob((output) => {
          if (output) resolve(output);
          else reject(new Error(`The browser could not encode ${settings.meta.label}.`));
        }, settings.meta.mime, settings.meta.lossy ? settings.quality / 100 : undefined);
      });
    }

    const type = (blob.type || '').toLowerCase();
    const validType = settings.format === 'jpg'
      ? /^image\/jpe?g$/.test(type)
      : type === settings.meta.mime;
    if (!validType) {
      throw new Error(`${settings.meta.label} encoding is not supported by this browser.`);
    }

    return {
      blob,
      url: URL.createObjectURL(blob),
      width,
      height,
      format: settings.format,
      formatLabel: settings.meta.label,
      ext: settings.meta.ext,
      name: buildOutputName(item.file.name, settings.format),
      originalSize: item.file.size,
      originalName: item.file.name
    };
  }

  function updateProgress(done, total, message) {
    const percent = total ? Math.round((done / total) * 100) : 0;
    progressContainer.hidden = false;
    progressContainer.setAttribute('aria-valuenow', String(percent));
    progressBar.style.width = `${percent}%`;
    progressPercentage.textContent = `${percent}%`;
    progressText.textContent = message;
  }

  async function startConversion() {
    if (busy || !uploadedFiles.length) {
      if (!uploadedFiles.length) setStatus('Add at least one image first.', 'error', 0);
      return;
    }
    const format = getFormat();
    if (unavailableFormats.has(format)) {
      setStatus(`${getFormatMeta(format).label} output is not supported in this browser. Choose another format.`, 'error', 0);
      return;
    }

    const settings = {
      format,
      meta: getFormatMeta(format),
      quality: getQuality(),
      background: getBackground()
    };

    window.clearTimeout(progressTimer);
    uploadedFiles.forEach((item) => {
      if (item.result) {
        URL.revokeObjectURL(item.result.url);
        item.result = null;
      }
    });

    setBusy(true);
    updateProgress(0, uploadedFiles.length, 'Starting conversion…');
    renderFileList();
    renderSummary();

    let converted = 0;
    let failed = 0;
    const errors = [];

    for (let index = 0; index < uploadedFiles.length; index += 1) {
      const item = uploadedFiles[index];
      updateProgress(index, uploadedFiles.length, `Converting ${index + 1} of ${uploadedFiles.length}: ${item.file.name}`);
      try {
        item.result = await convertItem(item, settings);
        converted += 1;
      } catch (error) {
        failed += 1;
        errors.push(error.message);
        console.error(`Conversion failed for ${item.file.name}:`, error);
      }
      updateProgress(index + 1, uploadedFiles.length, `Converting ${index + 1} of ${uploadedFiles.length}: ${item.file.name}`);
      renderSummary();
    }

    const successItem = getResults()[getResults().length - 1];
    if (successItem) activeId = successItem.id;

    setBusy(false);
    updateProgress(uploadedFiles.length, uploadedFiles.length, 'Conversion complete.');
    progressTimer = window.setTimeout(() => {
      if (!busy) progressContainer.hidden = true;
    }, 2200);

    if (converted > 0) {
      const totalOriginal = getResults().reduce((sum, item) => sum + item.result.originalSize, 0);
      const totalNew = getResults().reduce((sum, item) => sum + item.result.blob.size, 0);
      const diff = totalOriginal - totalNew;
      const savings = totalOriginal > 0 ? Math.round((diff / totalOriginal) * 100) : 0;
      const savingsText = savings > 0 ? `${savings}% smaller` : savings < 0 ? `${Math.abs(savings)}% larger` : 'no size change';
      setStatus(
        `Converted ${converted} image${converted === 1 ? '' : 's'} to ${settings.meta.label} — ${savingsText} overall.`,
        failed ? 'info' : 'success',
        failed ? 6000 : 5000
      );
    }
    if (failed) {
      setStatus(
        `${converted} converted · ${failed} failed. ${errors[0] || 'Try a different format or image.'}`,
        'error',
        0
      );
    }

    renderAll();

    if (window.matchMedia('(max-width: 700px)').matches) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector('.summary-panel').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function downloadResult(item) {
    if (!item || !item.result) return;
    const link = document.createElement('a');
    link.href = item.result.url;
    link.download = item.result.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus(`Downloading ${item.result.name}.`, 'success', 3000);
  }

  function uniqueZipName(name, used) {
    let candidate = name;
    let counter = 2;
    while (used.has(candidate.toLowerCase())) {
      const dot = name.lastIndexOf('.');
      candidate = dot > 0 ? `${name.slice(0, dot)}-${counter}${name.slice(dot)}` : `${name}-${counter}`;
      counter += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  async function downloadAllAsZip() {
    const results = getResults();
    if (!results.length) return;

    if (typeof window.JSZip === 'undefined') {
      results.forEach((item) => downloadResult(item));
      setStatus('ZIP support is unavailable, so each file was downloaded separately.', 'info', 5000);
      return;
    }

    downloadAllBtn.disabled = true;
    downloadAllBtn.innerHTML = `${SPIN_ICON} Creating ZIP…`;
    try {
      const zip = new window.JSZip();
      const folder = zip.folder('converted_images');
      const used = new Set();
      for (const item of results) {
        folder.file(uniqueZipName(item.result.name, used), await item.result.blob.arrayBuffer());
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'converted-images.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus(`Downloading converted-images.zip (${results.length} images).`, 'success', 5000);
    } catch (error) {
      console.error(error);
      results.forEach((item) => downloadResult(item));
      setStatus('The ZIP could not be created, so each file was downloaded separately.', 'error', 0);
    } finally {
      downloadAllBtn.disabled = busy || getResults().length === 0;
      downloadAllBtn.innerHTML = `${DOWNLOAD_ICON} Download all (.zip)`;
    }
  }

  function clearAll() {
    if (busy) return;
    if (!uploadedFiles.length) {
      setStatus('There is nothing to clear.', 'info', 3000);
      return;
    }
    uploadedFiles.forEach((item) => {
      URL.revokeObjectURL(item.url);
      if (item.result) URL.revokeObjectURL(item.result.url);
    });
    uploadedFiles = [];
    activeId = null;
    fileInput.value = '';
    window.clearTimeout(progressTimer);
    progressContainer.hidden = true;
    progressContainer.setAttribute('aria-valuenow', '0');
    progressBar.style.width = '0%';
    progressPercentage.textContent = '0%';
    progressText.textContent = 'Converting…';
    renderAll();
    setStatus('All files cleared.', 'success', 3500);
  }

  /* Events */
  dropArea.addEventListener('click', (event) => {
    if (event.target.closest('#chooseBtn')) return;
    fileInput.click();
  });
  chooseBtn.addEventListener('click', () => fileInput.click());
  dropArea.addEventListener('keydown', (event) => {
    if (event.target !== dropArea) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  ['dragenter', 'dragover'].forEach((type) => {
    dropArea.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) dropArea.classList.add('active');
    });
  });
  dropArea.addEventListener('dragleave', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dropArea.contains(event.relatedTarget)) dropArea.classList.remove('active');
  });
  dropArea.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropArea.classList.remove('active');
    if (event.dataTransfer && event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  qualitySlider.addEventListener('input', updateQuality);
  formatOptions.addEventListener('change', updateFormatUI);
  bgReset.addEventListener('click', () => {
    bgColorInput.value = '#ffffff';
  });
  convertBtn.addEventListener('click', startConversion);
  clearBtn.addEventListener('click', clearAll);
  downloadCurrent.addEventListener('click', () => {
    const item = getSummaryItem();
    if (item) downloadResult(item);
  });
  downloadAllBtn.addEventListener('click', downloadAllAsZip);

  document.addEventListener('paste', (event) => {
    if (!event.clipboardData) return;
    const target = event.target;
    if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const files = Array.from(event.clipboardData.files || []).filter(isImageFile);
    if (files.length) {
      event.preventDefault();
      addFiles(files);
      return;
    }
    const fromItems = Array.from(event.clipboardData.items || [])
      .filter((entry) => entry.kind === 'file' && entry.type.startsWith('image/'))
      .map((entry) => entry.getAsFile())
      .filter(Boolean);
    if (fromItems.length) {
      event.preventDefault();
      addFiles(fromItems);
    }
  });

  window.addEventListener('beforeunload', () => {
    uploadedFiles.forEach((item) => {
      URL.revokeObjectURL(item.url);
      if (item.result) URL.revokeObjectURL(item.result.url);
    });
  });

  updateQuality();
  updateFormatUI();
  syncFormatAvailability();
  detectFormatSupport();
  renderAll();
});
