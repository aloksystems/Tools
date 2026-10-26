document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('tools-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const setTheme = theme => {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  };
  setTheme(savedTheme === 'dark' || (!savedTheme && prefersDark) ? 'dark' : 'light');
  themeToggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('tools-theme', nextTheme);
    setTheme(nextTheme);
  });

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const dropArea        = document.getElementById('drop-area');
  const fileInput       = document.getElementById('file-input');
  const fileListEl      = document.getElementById('file-list');
  const qualitySlider   = document.getElementById('quality-slider');
  const qualityValueEl  = document.getElementById('quality-value');
  const formatSelect    = document.getElementById('format');
  const compressBtn     = document.getElementById('compress-btn');
  const resizeToggle    = document.getElementById('resize-toggle');
  const resizeOptions   = document.getElementById('resize-options');
  const maxDimensionEl  = document.getElementById('max-dimension');
  const pngNotice       = document.getElementById('png-notice');
  const resultsSection  = document.getElementById('results-section');
  const resultsContainer= document.getElementById('results-container');
  const progressFill    = document.getElementById('progress-fill');
  const originalSizeEl  = document.getElementById('original-size');
  const compressedSizeEl= document.getElementById('compressed-size');
  const savingsBadge    = document.getElementById('savings-badge');
  const downloadBtn     = document.getElementById('download-btn');

  // ── State ─────────────────────────────────────────────────────────────────
  let files           = [];
  let compressedFiles = [];

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  dropArea.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt =>
    dropArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); })
  );

  ['dragenter', 'dragover'].forEach(evt =>
    dropArea.addEventListener(evt, () => dropArea.classList.add('active'))
  );
  ['dragleave', 'drop'].forEach(evt =>
    dropArea.addEventListener(evt, () => dropArea.classList.remove('active'))
  );

  dropArea.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  // ── Quality slider ────────────────────────────────────────────────────────
  qualitySlider.addEventListener('input', () => {
    qualityValueEl.textContent = `${qualitySlider.value}%`;
  });

  // ── Format change → PNG notice ────────────────────────────────────────────
  formatSelect.addEventListener('change', () => {
    pngNotice.classList.toggle('hidden', formatSelect.value !== 'png');
  });

  // ── Resize toggle ─────────────────────────────────────────────────────────
  resizeToggle.addEventListener('change', () => {
    resizeOptions.classList.toggle('hidden', !resizeToggle.checked);
  });

  // ── Compress button ───────────────────────────────────────────────────────
  compressBtn.addEventListener('click', () => {
    if (files.length === 0) {
      showToast('Please add at least one image first.');
      return;
    }
    compressAll();
  });

  // ── Download All (zip via JSZip) ──────────────────────────────────────────
  downloadBtn.addEventListener('click', async () => {
    if (compressedFiles.length === 0) return;

    if (compressedFiles.length === 1) {
      triggerDownload(compressedFiles[0]);
      return;
    }

    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        class="spin">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Zipping…`;

    try {
      const zip = new JSZip();
      const ext = formatSelect.value;

      for (const cf of compressedFiles) {
        const arrayBuffer = await cf.blob.arrayBuffer();
        zip.file(`compressed-${stripExt(cf.name)}.${ext}`, arrayBuffer);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'compressed-images.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      showToast('Zip failed — downloading files individually.');
      compressedFiles.forEach(triggerDownload);
    }

    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Download All`;
  });

  // ── Handle incoming files ─────────────────────────────────────────────────
  function handleFiles(incoming) {
    const imageFiles = Array.from(incoming).filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      showToast('No valid image files found.');
      return;
    }

    // Deduplicate by name + size
    const existing = new Set(files.map(f => `${f.name}-${f.size}`));
    const newFiles = imageFiles.filter(f => !existing.has(`${f.name}-${f.size}`));

    if (newFiles.length === 0) {
      showToast('All selected images are already in the list.');
      return;
    }

    files = [...files, ...newFiles];
    renderFileList();

    // Reset file input so the same file can be re-added after removal
    fileInput.value = '';
  }

  // ── Render file list ──────────────────────────────────────────────────────
  function renderFileList() {
    fileListEl.innerHTML = '';

    if (files.length === 0) return;

    files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-item';

      // Thumbnail
      const thumb = document.createElement('img');
      thumb.className = 'file-thumb';
      thumb.alt = file.name;
      const objUrl = URL.createObjectURL(file);
      thumb.src = objUrl;
      thumb.onload = () => URL.revokeObjectURL(objUrl);

      // Info
      const info = document.createElement('div');
      info.className = 'file-info';

      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = file.name;
      name.title = file.name;

      const size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = formatSize(file.size);

      info.appendChild(name);
      info.appendChild(size);

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        files.splice(index, 1);
        renderFileList();
      });

      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(removeBtn);
      fileListEl.appendChild(item);
    });
  }

  // ── Compress all images ───────────────────────────────────────────────────
  function compressAll() {
    compressedFiles = [];
    compressBtn.disabled = true;
    compressBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        class="spin">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Compressing…`;

    resultsSection.classList.remove('hidden');
    resultsContainer.innerHTML = '';

    const totalOriginal = files.reduce((s, f) => s + f.size, 0);
    originalSizeEl.textContent = formatSize(totalOriginal);
    compressedSizeEl.textContent = '—';
    savingsBadge.textContent = '';
    savingsBadge.className = 'savings-badge';
    progressFill.style.width = '0%';

    const quality    = parseInt(qualitySlider.value, 10);
    const format     = formatSelect.value;
    const doResize   = resizeToggle.checked;
    const maxDim     = parseInt(maxDimensionEl.value, 10) || 1920;

    let processed        = 0;
    let totalCompressed  = 0;

    files.forEach((file, index) => {
      compressImage(file, quality, format, doResize, maxDim, (blob, previewUrl) => {
        const result = { blob, previewUrl, name: file.name, originalSize: file.size, index };
        compressedFiles.push(result);
        totalCompressed += blob.size;
        processed++;

        renderResultItem(result);

        // Progress
        progressFill.style.width = `${(processed / files.length) * 100}%`;
        compressedSizeEl.textContent = formatSize(totalCompressed);

        const pct = Math.round((1 - totalCompressed / totalOriginal) * 100);
        if (pct > 0) {
          savingsBadge.textContent = `${pct}% saved`;
          savingsBadge.className = 'savings-badge saved';
        } else if (pct < 0) {
          savingsBadge.textContent = `${Math.abs(pct)}% larger`;
          savingsBadge.className = 'savings-badge larger';
        } else {
          savingsBadge.textContent = 'no change';
          savingsBadge.className = 'savings-badge';
        }

        if (processed === files.length) {
          compressBtn.disabled = false;
          compressBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="8 17 12 21 16 17"></polyline>
              <line x1="12" y1="12" x2="12" y2="21"></line>
              <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path>
            </svg>
            Compress`;
          downloadBtn.textContent;
          updateDownloadLabel();
        }
      });
    });
  }

  // ── Render a single result card ───────────────────────────────────────────
  function renderResultItem(result) {
    const ext = formatSelect.value;
    const pct = Math.round((1 - result.blob.size / result.originalSize) * 100);

    const card = document.createElement('div');
    card.className = 'result-item';

    card.innerHTML = `
      <div class="image-preview">
        <img src="${result.previewUrl}" alt="${result.name}">
      </div>
      <div class="info-container">
        <div class="result-name" title="${result.name}">${result.name}</div>
        <div class="size-comparison">
          <span>Original: <strong>${formatSize(result.originalSize)}</strong></span>
          <span>Compressed: <strong>${formatSize(result.blob.size)}</strong></span>
          <span class="savings ${pct < 0 ? 'larger' : ''}">
            ${pct >= 0 ? `${pct}% saved` : `${Math.abs(pct)}% larger`}
          </span>
        </div>
        <button class="individual-download-btn" aria-label="Download ${result.name}">
          Download
        </button>
      </div>`;

    card.querySelector('.individual-download-btn').addEventListener('click', () => {
      triggerDownload(result);
    });

    resultsContainer.appendChild(card);
  }

  // ── Core compression ──────────────────────────────────────────────────────
  function compressImage(file, quality, format, doResize, maxDim, callback) {
    const reader = new FileReader();

    reader.onload = event => {
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        if (doResize && (width > maxDim || height > maxDim)) {
          if (width >= height) {
            height = Math.round((height / width) * maxDim);
            width  = maxDim;
          } else {
            width  = Math.round((width / height) * maxDim);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Fill white background for JPG (avoids black bg on transparent PNGs)
        if (format === 'jpg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const mimeMap = { jpg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
        const mime    = mimeMap[format] || 'image/jpeg';
        // PNG ignores quality; pass 1 to avoid any browser quirks
        const q       = format === 'png' ? 1 : quality / 100;

        canvas.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          callback(blob, url);
        }, mime, q);
      };

      img.onerror = () => showToast(`Failed to load image: ${file.name}`);
      img.src = event.target.result;
    };

    reader.onerror = () => showToast(`Failed to read file: ${file.name}`);
    reader.readAsDataURL(file);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function triggerDownload(result) {
    const ext = formatSelect.value;
    const a   = document.createElement('a');
    a.href     = result.previewUrl;
    a.download = `compressed-${stripExt(result.name)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function updateDownloadLabel() {
    const single = compressedFiles.length === 1;
    downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      ${single ? 'Download' : 'Download All (ZIP)'}`;
  }

  function stripExt(name) {
    return name.replace(/\.[^/.]+$/, '');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    // Trigger reflow for animation
    toast.getBoundingClientRect();
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

});
