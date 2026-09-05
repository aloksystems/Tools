/**
 * PreviewRenderer — renders the live print preview onto a canvas.
 */
class PreviewRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imageCache = new Map();
  }

  clearCache() {
    this.imageCache.clear();
  }

  _getImage(dataUrl) {
    if (this.imageCache.has(dataUrl)) {
      return Promise.resolve(this.imageCache.get(dataUrl));
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(dataUrl, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  async render(pages, sheetIndex, gridCalc, settings) {
    const { rows, cols } = settings.grid;
    const {
      paperSize, orientation, margin, gap, borderThickness, scaleMode
    } = settings;

    const paper = gridCalc.getPaperDimensions(paperSize, orientation);
    const cellSize = gridCalc.calculateCellSize(
      paper.width, paper.height, rows, cols, margin, gap
    );

    const calc = gridCalc.calculate(rows, cols, pages.length);
    if (sheetIndex >= calc.sheetsRequired) sheetIndex = calc.sheetsRequired - 1;
    if (sheetIndex < 0) sheetIndex = 0;

    // Convert paper mm to pixels at 2x for crisp display
    const scale = 2;
    const pxPerMm = scale * 3.78; // ~3.78 px/mm at 96dpi
    const canvasW = Math.round(paper.width * pxPerMm);
    const canvasH = Math.round(paper.height * pxPerMm);

    this.canvas.width = canvasW;
    this.canvas.height = canvasH;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw grid cells
    const sheet = calc.sheets[sheetIndex];
    if (!sheet) return;

    const marginPx = margin * pxPerMm;
    const gapPx = gap * pxPerMm;
    const cellWPx = cellSize.cellWidth * pxPerMm;
    const cellHPx = cellSize.cellHeight * pxPerMm;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const itemIdx = sheet.startIdx + r * cols + c;
        if (itemIdx >= pages.length) break;

        const page = pages[itemIdx];
        const cellX = marginPx + c * (cellWPx + gapPx);
        const cellY = marginPx + r * (cellHPx + gapPx);

        // Cell background
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(cellX, cellY, cellWPx, cellHPx);

        // Border
        if (borderThickness > 0) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = borderThickness * scale;
          ctx.strokeRect(cellX, cellY, cellWPx, cellHPx);
        }

        // Load and draw image
        const img = await this._getImage(page.dataUrl);
        if (!img) continue;

        const placement = gridCalc.getPlacement(
          img.naturalWidth, img.naturalHeight,
          cellSize.cellWidth, cellSize.cellHeight,
          scaleMode
        );

        const imgX = cellX + placement.x * pxPerMm;
        const imgY = cellY + placement.y * pxPerMm;
        const imgW = placement.w * pxPerMm;
        const imgH = placement.h * pxPerMm;

        ctx.save();
        if (page.rotation === 90) {
          ctx.translate(imgX + imgW, imgY);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, 0, 0, imgH, imgW);
        } else if (page.rotation === 180) {
          ctx.translate(imgX + imgW, imgY + imgH);
          ctx.rotate(Math.PI);
          ctx.drawImage(img, 0, 0, imgW, imgH);
        } else if (page.rotation === 270) {
          ctx.translate(imgX, imgY + imgH);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(img, 0, 0, imgH, imgW);
        } else {
          ctx.drawImage(img, imgX, imgY, imgW, imgH);
        }
        ctx.restore();
      }
    }
  }

  /**
   * Render a sheet to a high-res canvas for PDF export.
   */
  async renderForExport(pages, sheetIndex, gridCalc, settings, dpi) {
    const origCanvas = this.canvas;
    const origCtx = this.ctx;

    // Create temporary canvas at requested DPI
    const tmpCanvas = document.createElement('canvas');
    const tmpCtx = tmpCanvas.getContext('2d');

    this.canvas = tmpCanvas;
    this.ctx = tmpCtx;

    await this.render(pages, sheetIndex, gridCalc, settings);

    const result = tmpCanvas;

    // Restore
    this.canvas = origCanvas;
    this.ctx = origCtx;

    return result;
  }
}

window.PreviewRenderer = PreviewRenderer;
