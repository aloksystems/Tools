/**
 * FileManager — handles file uploads, PDF page extraction, and image loading.
 * Each page/image becomes an individual printable item stored in the pages array.
 */
class FileManager {
  constructor() {
    this.pages = [];
    this.nextId = 1;
    this.pdfjsLib = null;
  }

  async init() {
    if (window.pdfjsLib) {
      this.pdfjsLib = window.pdfjsLib;
      this.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  async processFiles(fileList) {
    const files = Array.from(fileList);
    const newPages = [];

    for (const file of files) {
      const type = file.type || this._guessType(file.name);
      if (type === 'application/pdf') {
        const pdfPages = await this._extractPDFPages(file);
        newPages.push(...pdfPages);
      } else if (this._isImageType(type)) {
        const imgPage = await this._loadImage(file);
        newPages.push(imgPage);
      }
    }

    this.pages.push(...newPages);
    return newPages;
  }

  async _extractPDFPages(file) {
    if (!this.pdfjsLib) {
      console.error('PDF.js not loaded');
      return [];
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/png');
      const aspectRatio = viewport.width / viewport.height;

      pages.push({
        id: this.nextId++,
        type: 'pdf',
        source: file.name,
        pageNumber: i,
        totalPages: pdf.numPages,
        label: pdf.numPages > 1
          ? `${this._shortName(file.name)} p${i}`
          : this._shortName(file.name),
        dataUrl: dataUrl,
        width: viewport.width,
        height: viewport.height,
        aspectRatio: aspectRatio,
        rotation: 0
      });
    }

    return pages;
  }

  _loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const page = {
            id: this.nextId++,
            type: 'image',
            source: file.name,
            pageNumber: 1,
            totalPages: 1,
            label: this._shortName(file.name),
            dataUrl: e.target.result,
            width: img.naturalWidth,
            height: img.naturalHeight,
            aspectRatio: img.naturalWidth / img.naturalHeight,
            rotation: 0
          };
          resolve(page);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _guessType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp'
    };
    return map[ext] || '';
  }

  _isImageType(type) {
    return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(type);
  }

  _shortName(filename) {
    return filename.replace(/\.[^.]+$/, '').substring(0, 16);
  }

  removePage(id) {
    this.pages = this.pages.filter(p => p.id !== id);
  }

  rotatePage(id) {
    const page = this.pages.find(p => p.id === id);
    if (page) {
      page.rotation = (page.rotation + 90) % 360;
      // Swap dimensions for 90/270 rotation
      const temp = page.width;
      page.width = page.height;
      page.height = temp;
      page.aspectRatio = page.width / page.height;
    }
  }

  reorderPages(newOrder) {
    this.pages = newOrder;
  }

  getPages() {
    return this.pages;
  }

  getPageCount() {
    return this.pages.length;
  }

  getStats() {
    const sources = {};
    this.pages.forEach(p => {
      if (!sources[p.source]) sources[p.source] = { pdf: 0, image: 0 };
      if (p.type === 'pdf') sources[p.source].pdf++;
      else sources[p.source].image++;
    });
    return { total: this.pages.length, sources };
  }
}

window.FileManager = FileManager;
