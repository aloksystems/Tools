document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('fileInput');
  const chooseBtn = document.getElementById('chooseBtn');
  const fileListEl = document.getElementById('file-list');
  const fileSummaryEl = document.getElementById('file-summary');
  const qualitySlider = document.getElementById('quality-slider');
  const qualityValueEl = document.getElementById('quality-value');
  const formatSelect = document.getElementById('format');
  const resizeToggle = document.getElementById('resize-toggle');
  const resizeOptions = document.getElementById('resize-options');
  const maxDimensionEl = document.getElementById('max-dimension');
  const pngNotice = document.getElementById('png-notice');
  const compressBtn = document.getElementById('compress-btn');
  const statusMessage = document.getElementById('statusMessage');
  const summaryNote = document.getElementById('summaryNote');
  const previewImage = document.getElementById('previewImage');
  const previewPlaceholder = document.getElementById('previewPlaceholder');
  const previewBadge = document.getElementById('previewBadge');
  const resultSummary = document.getElementById('resultSummary');
  const originalSizeEl = document.getElementById('original-size');
  const compressedSizeEl = document.getElementById('compressed-size');
  const savingsBadge = document.getElementById('savings-badge');
  const progressTrack = document.getElementById('progressTrack');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progressText');
  const metaDimensions = document.getElementById('metaDimensions');
  const metaFormat = document.getElementById('metaFormat');
  const metaName = document.getElementById('metaName');
  const metaQuality = document.getElementById('metaQuality');
  const batchSummary = document.getElementById('batchSummary');
  const downloadBtn = document.getElementById('download-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const resultListEl = document.getElementById('result-list');
  const resetBtn = document.getElementById('reset-btn');

  const FORMATS = {
    jpg: { mime: 'image/jpeg', label: 'JPG', ext: 'jpg' },
    webp: { mime: 'image/webp', label: 'WebP', ext: 'webp' },
    png: { mime: 'image/png', label: 'PNG', ext: 'png' }
  };
  const IMAGE_LABELS = {
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/webp': 'WebP',
    'image/gif': 'GIF',
    'image/bmp': 'BMP',
    'image/avif': 'AVIF',
    'image/svg+xml': 'SVG'
  };
  const DOWNLOAD_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  const SPIN_ICON = '<svg class="spin" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const COMPRESS_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path></svg>';

  let items = [];
  let activeId = null;
  let nextId = 1;
  let busy = false;
  let addChain = Promise.resolve();
  let statusTimer = 0;

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
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
  }

  function formatFromFile(file) {
    if (IMAGE_LABELS[file.type]) return IMAGE_LABELS[file.type];
    const ext = (file.name.split('.').pop() || '').toUpperCase();
    return ext || 'Image';
  }

  function baseName(name) {
    return name.replace(/\.[^/.]+$/, '') || 'image';
  }

  function safeBase(name) {
    const cleaned = baseName(name)
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    return cleaned || 'image';
  }

  function buildDownloadName(name, format) {
    return `${safeBase(name)}-compressed.${FORMATS[format].ext}`;
  }

  function isImageFile(file) {
    return /^image\//.test(file.type || '') || /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i.test(file.name);
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
    return items.find((item) => item.id === activeId) || null;
  }

  function getResults() {
    return items.filter((item) => item.result);
  }

  function getQuality() {
    return Math.max(1, Math.min(100, parseInt(qualitySlider.value, 10) || 80));
  }

  function getMaxDimension() {
    const value = parseInt(maxDimensionEl.value, 10);
    if (!Number.isFinite(value)) return 1920;
    return Math.max(100, Math.min(8000, value));
  }

  function updateQuality() {
    const quality = getQuality();
    qualityValueEl.textContent = `${quality}%`;
  }

  function updateFormatUI() {
    pngNotice.hidden = formatSelect.value !== 'png';
  }

  function updateResizeUI() {
    const enabled = resizeToggle.checked;
    resizeOptions.hidden = !enabled;
    maxDimensionEl.disabled = !enabled || busy;
  }

  function renderAll() {
    renderFileList();
    renderFileSummary();
    renderSummary();
  }

  function renderFileList() {
    fileListEl.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('li');
      row.className = `file-row${item.id === activeId ? ' is-active' : ''}`;

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'file-select';
      select.setAttribute('aria-pressed', item.id === activeId ? 'true' : 'false');
      select.setAttribute('aria-label', `Preview ${item.file.name}`);

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
      select.addEventListener('click', () => {
        activeId = item.id;
        row.parentElement.querySelectorAll('.file-row').forEach((el, index) => {
          el.classList.toggle('is-active', items[index] && items[index].id === activeId);
          const btn = el.querySelector('.file-select');
          if (btn) btn.setAttribute('aria-pressed', items[index] && items[index].id === activeId ? 'true' : 'false');
        });
        renderSummary();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'file-remove';
      remove.innerHTML = '&times;';
      remove.setAttribute('aria-label', `Remove ${item.file.name}`);
      remove.disabled = busy;
      remove.addEventListener('click', () => removeItem(item.id));

      row.append(select, remove);
      fileListEl.appendChild(row);
    });

    document.querySelectorAll('.file-remove').forEach((button) => {
      button.disabled = busy;
    });
  }

  function renderFileSummary() {
    if (!items.length) {
      fileSummaryEl.hidden = true;
      fileSummaryEl.textContent = '';
      return;
    }
    const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
    fileSummaryEl.textContent = `${items.length} image${items.length === 1 ? '' : 's'} queued · ${formatBytes(totalBytes)} total`;
    fileSummaryEl.hidden = false;
  }

  function renderSummary() {
    const item = getActiveItem();

    if (!item) {
      previewImage.hidden = true;
      previewImage.removeAttribute('src');
      previewPlaceholder.hidden = false;
      previewBadge.hidden = true;
      resultSummary.hidden = true;
      summaryNote.textContent = 'Add an image to see its preview and size comparison.';
      downloadBtn.disabled = true;
      downloadAllBtn.hidden = true;
      compressBtn.disabled = busy || items.length === 0;
      if (!busy) resetBtn.disabled = items.length === 0;
      return;
    }

    const result = item.result;
    previewImage.src = result ? result.url : item.url;
    previewImage.alt = result ? `Compressed preview of ${item.file.name}` : `Original preview of ${item.file.name}`;
    previewImage.hidden = false;
    previewPlaceholder.hidden = true;
    previewBadge.hidden = false;
    previewBadge.textContent = result
      ? `${result.formatLabel} · ${result.width} × ${result.height} px`
      : `Original · ${item.format}`;
    resultSummary.hidden = false;
    summaryNote.textContent = result
      ? 'Compressed preview. Check the savings, then download the file.'
      : 'This is the original image. Compress it to see the size comparison.';

    originalSizeEl.textContent = formatBytes(item.file.size);
    compressedSizeEl.textContent = result ? formatBytes(result.blob.size) : '—';

    if (result) {
      const savedBytes = item.file.size - result.blob.size;
      const percent = item.file.size > 0 ? Math.round((savedBytes / item.file.size) * 100) : 0;
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
    } else {
      savingsBadge.hidden = true;
      savingsBadge.textContent = '';
      savingsBadge.className = 'savings-badge';
    }

    const displayQuality = result
      ? (result.format === 'png' ? 'Lossless' : `${result.quality}%`)
      : `Not compressed${formatSelect.value === 'png' ? '' : ` · ${getQuality()}%`}`;
    metaDimensions.textContent = `${result ? result.width : item.width} × ${result ? result.height : item.height} px`;
    metaFormat.textContent = result ? result.formatLabel : item.format;
    metaName.textContent = result ? result.downloadName : item.file.name;
    metaName.title = result ? result.downloadName : item.file.name;
    metaQuality.textContent = displayQuality;

    const results = getResults();
    if (results.length > 1) {
      const originalTotal = results.reduce((sum, entry) => sum + entry.file.size, 0);
      const compressedTotal = results.reduce((sum, entry) => sum + entry.result.blob.size, 0);
      const percent = originalTotal > 0 ? Math.round((1 - compressedTotal / originalTotal) * 100) : 0;
      const change = percent > 0 ? `${percent}% smaller` : percent < 0 ? `${Math.abs(percent)}% larger` : 'no size change';
      batchSummary.textContent = `${results.length} of ${items.length} images compressed · ${formatBytes(originalTotal)} → ${formatBytes(compressedTotal)} · ${change}`;
      batchSummary.hidden = false;
    } else {
      batchSummary.hidden = true;
      batchSummary.textContent = '';
    }

    downloadBtn.disabled = busy || !result;
    downloadBtn.innerHTML = result
      ? `${DOWNLOAD_ICON} Download .${result.ext}`
      : `${DOWNLOAD_ICON} Download image`;
    downloadAllBtn.hidden = results.length < 2;
    downloadAllBtn.disabled = busy;
    compressBtn.disabled = busy || items.length === 0;
    if (!busy) resetBtn.disabled = false;

    renderResultList();
  }

  function renderResultList() {
    const results = getResults();
    resultListEl.innerHTML = '';
    results.forEach((item) => {
      const row = document.createElement('div');
      row.className = `result-row${item.id === activeId ? ' is-active' : ''}`;

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'result-select';
      select.setAttribute('aria-label', `Show compressed result for ${item.file.name}`);
      const thumb = document.createElement('img');
      thumb.className = 'result-thumb';
      thumb.src = item.result.url;
      thumb.alt = '';
      thumb.loading = 'lazy';
      const copy = document.createElement('span');
      copy.className = 'result-copy';
      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = item.result.downloadName;
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
      download.setAttribute('aria-label', `Download ${item.result.downloadName}`);
      download.disabled = busy;
      download.addEventListener('click', () => downloadItem(item));

      row.append(select, download);
      resultListEl.appendChild(row);
    });
  }

  function setBusy(value) {
    busy = value;
    qualitySlider.disabled = value;
    formatSelect.disabled = value;
    resizeToggle.disabled = value;
    chooseBtn.disabled = value;
    resetBtn.disabled = value;
    maxDimensionEl.disabled = value || !resizeToggle.checked;
    document.querySelectorAll('.file-remove').forEach((button) => {
      button.disabled = value;
    });
    resultListEl.querySelectorAll('button').forEach((button) => {
      button.disabled = value;
    });
    compressBtn.disabled = value || items.length === 0;
    compressBtn.innerHTML = value
      ? `${SPIN_ICON} Compressing…`
      : `${COMPRESS_ICON} Compress images`;
    if (!value) {
      renderSummary();
    } else {
      downloadBtn.disabled = true;
      downloadAllBtn.disabled = true;
    }
  }

  function addFiles(fileList) {
    const incomingFiles = Array.from(fileList || []);
    if (!incomingFiles.length) return;
    addChain = addChain.then(() => processFiles(incomingFiles));
  }

  async function processFiles(incomingFiles) {
    if (busy) {
      setStatus('Please wait for the current compression to finish.', 'info', 3000);
      return;
    }
    const incoming = incomingFiles.filter(isImageFile);
    if (!incoming.length) {
      setStatus('No supported image files were found. Try JPG, PNG, WebP, GIF, or BMP.', 'error', 0);
      return;
    }

    let added = 0;
    let duplicates = 0;
    let failed = 0;

    for (const file of incoming) {
      if (items.some((item) => item.file.name === file.name && item.file.size === file.size)) {
        duplicates += 1;
        continue;
      }
      const url = URL.createObjectURL(file);
      try {
        const image = await loadImage(url);
        items.push({
          id: nextId++,
          file,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          format: formatFromFile(file),
          result: null
        });
        if (activeId === null) activeId = items[items.length - 1].id;
        added += 1;
      } catch (error) {
        URL.revokeObjectURL(url);
        failed += 1;
      }
    }

    fileInput.value = '';
    renderAll();

    if (!items.length) {
      setStatus('Those images could not be opened in this browser. Try JPG, PNG, or WebP.', 'error', 0);
      return;
    }

    const parts = [];
    if (added) parts.push(`${added} image${added === 1 ? '' : 's'} added`);
    if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped`);
    if (failed) parts.push(`${failed} file${failed === 1 ? '' : 's'} could not be opened`);
    setStatus(parts.join(' · '), failed ? 'error' : 'success', failed ? 0 : 4000);
  }

  function removeItem(id) {
    if (busy) return;
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [removed] = items.splice(index, 1);
    URL.revokeObjectURL(removed.url);
    if (removed.result) URL.revokeObjectURL(removed.result.url);
    if (activeId === removed.id) {
      activeId = items.length ? items[Math.min(index, items.length - 1)].id : null;
    }
    renderAll();
    setStatus(`${removed.file.name} removed.`, 'info', 3000);
  }

  async function compressOne(item, settings) {
    const image = await loadImage(item.url);
    let width = image.naturalWidth;
    let height = image.naturalHeight;

    if (!width || !height) {
      throw new Error('The image has no readable dimensions.');
    }

    if (settings.resize && (width > settings.maxDimension || height > settings.maxDimension)) {
      if (width >= height) {
        height = Math.max(1, Math.round((height / width) * settings.maxDimension));
        width = settings.maxDimension;
      } else {
        width = Math.max(1, Math.round((width / height) * settings.maxDimension));
        height = settings.maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available in this browser.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    if (settings.format === 'jpg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);

    const format = FORMATS[settings.format];
    const quality = settings.format === 'png' ? undefined : settings.quality / 100;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((output) => {
        if (output) resolve(output);
        else reject(new Error('The browser could not create the compressed file.'));
      }, format.mime, quality);
    });

    if ((settings.format === 'webp' && blob.type !== 'image/webp') || (settings.format === 'jpg' && !/^image\/jpe?g$/.test(blob.type))) {
      throw new Error(`This browser cannot create ${format.label} files.`);
    }

    return {
      blob,
      url: URL.createObjectURL(blob),
      width,
      height,
      format: settings.format,
      formatLabel: format.label,
      ext: format.ext,
      quality: settings.quality,
      downloadName: buildDownloadName(item.file.name, settings.format)
    };
  }

  function updateProgress(done, total) {
    const percent = total ? Math.round((done / total) * 100) : 0;
    progressFill.style.width = `${percent}%`;
    progressTrack.setAttribute('aria-valuenow', String(percent));
    progressTrack.hidden = false;
    progressText.hidden = false;
    progressText.textContent = done >= total ? 'Compression complete.' : `Compressing ${done + 1} of ${total}…`;
  }

  async function compressAll() {
    if (busy || !items.length) return;

    const settings = {
      quality: getQuality(),
      format: formatSelect.value,
      resize: resizeToggle.checked,
      maxDimension: getMaxDimension()
    };
    if (!FORMATS[settings.format]) {
      setStatus('Choose a valid output format.', 'error', 0);
      return;
    }

    items.forEach((item) => {
      if (item.result) {
        URL.revokeObjectURL(item.result.url);
        item.result = null;
      }
    });

    setBusy(true);
    progressFill.style.width = '0%';
    progressTrack.setAttribute('aria-valuenow', '0');
    progressTrack.hidden = false;
    progressText.hidden = false;
    progressText.textContent = `Preparing ${items.length} image${items.length === 1 ? '' : 's'}…`;
    renderAll();

    let failures = 0;
    let compressed = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      updateProgress(index, items.length);
      progressText.textContent = `Compressing ${index + 1} of ${items.length}: ${item.file.name}`;
      try {
        item.result = await compressOne(item, settings);
        compressed += 1;
      } catch (error) {
        failures += 1;
        console.error(`Compression failed for ${item.file.name}:`, error);
      }
      updateProgress(index + 1, items.length);
      renderSummary();
    }

    setBusy(false);
    updateProgress(items.length, items.length);
    progressText.textContent = 'Compression complete.';

    if (activeId === null && items.length) {
      activeId = items[0].id;
      renderSummary();
    }

    if (failures === 0) {
      const results = getResults();
      const originalTotal = results.reduce((sum, item) => sum + item.file.size, 0);
      const compressedTotal = results.reduce((sum, item) => sum + item.result.blob.size, 0);
      const percent = originalTotal > 0 ? Math.round((1 - compressedTotal / originalTotal) * 100) : 0;
      const change = percent > 0 ? `${percent}% smaller` : percent < 0 ? `${Math.abs(percent)}% larger` : 'no size change';
      setStatus(`Compressed ${compressed} image${compressed === 1 ? '' : 's'} — ${change} overall.`, 'success', 6000);
    } else {
      setStatus(
        `${compressed} image${compressed === 1 ? '' : 's'} compressed · ${failures} failed. Try a different format or a smaller image.`,
        'error',
        0
      );
    }
  }

  function downloadItem(item) {
    if (!item || !item.result) return;
    const link = document.createElement('a');
    link.href = item.result.url;
    link.download = item.result.downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus(`Downloading ${item.result.downloadName}.`, 'success', 3000);
  }

  function uniqueZipName(name, used) {
    let candidate = name;
    let counter = 2;
    while (used.has(candidate.toLowerCase())) {
      const dot = name.lastIndexOf('.');
      candidate = dot > 0
        ? `${name.slice(0, dot)}-${counter}${name.slice(dot)}`
        : `${name}-${counter}`;
      counter += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  async function downloadAll() {
    const results = getResults();
    if (!results.length) return;

    if (results.length === 1 || typeof window.JSZip === 'undefined') {
      results.forEach((item) => downloadItem(item));
      if (typeof window.JSZip === 'undefined' && results.length > 1) {
        setStatus('ZIP support is unavailable, so each file was downloaded separately.', 'info', 5000);
      }
      return;
    }

    downloadAllBtn.disabled = true;
    downloadAllBtn.innerHTML = `${SPIN_ICON} Creating ZIP…`;

    try {
      const zip = new window.JSZip();
      const used = new Set();
      for (const item of results) {
        const name = uniqueZipName(item.result.downloadName, used);
        zip.file(name, await item.result.blob.arrayBuffer());
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'compressed-images.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus(`Downloading compressed-images.zip (${results.length} images).`, 'success', 5000);
    } catch (error) {
      console.error(error);
      results.forEach((item) => downloadItem(item));
      setStatus('The ZIP could not be created, so each file was downloaded separately.', 'error', 0);
    } finally {
      downloadAllBtn.disabled = busy;
      downloadAllBtn.innerHTML = `${DOWNLOAD_ICON} Download all (.zip)`;
    }
  }

  function resetEverything() {
    if (busy) return;
    items.forEach((item) => {
      URL.revokeObjectURL(item.url);
      if (item.result) URL.revokeObjectURL(item.result.url);
    });
    items = [];
    activeId = null;
    fileInput.value = '';

    qualitySlider.value = '80';
    updateQuality();
    formatSelect.value = 'jpg';
    updateFormatUI();
    resizeToggle.checked = true;
    updateResizeUI();
    maxDimensionEl.value = '1920';

    progressTrack.hidden = true;
    progressFill.style.width = '0%';
    progressTrack.setAttribute('aria-valuenow', '0');
    progressText.hidden = true;
    progressText.textContent = '';

    setBusy(false);
    renderAll();
    setStatus('Workspace reset. Add images to start again.', 'success', 3500);
  }

  /* Event wiring */
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
  formatSelect.addEventListener('change', updateFormatUI);
  resizeToggle.addEventListener('change', updateResizeUI);
  compressBtn.addEventListener('click', compressAll);
  downloadBtn.addEventListener('click', () => downloadItem(getActiveItem()));
  downloadAllBtn.addEventListener('click', downloadAll);
  resetBtn.addEventListener('click', resetEverything);

  document.addEventListener('paste', (event) => {
    if (!event.clipboardData) return;
    const target = event.target;
    if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const files = Array.from(event.clipboardData.files || []).filter(isImageFile);
    if (!files.length) {
      const fromItems = Array.from(event.clipboardData.items || [])
        .filter((entry) => entry.kind === 'file' && entry.type.startsWith('image/'))
        .map((entry) => entry.getAsFile())
        .filter(Boolean);
      if (fromItems.length) {
        event.preventDefault();
        addFiles(fromItems);
      }
      return;
    }
    event.preventDefault();
    addFiles(files);
  });

  window.addEventListener('beforeunload', () => {
    items.forEach((item) => {
      URL.revokeObjectURL(item.url);
      if (item.result) URL.revokeObjectURL(item.result.url);
    });
  });

  updateQuality();
  updateFormatUI();
  updateResizeUI();
  renderAll();
});
