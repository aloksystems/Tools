/**
 * DownloadManager — generates a PDF from the N-up layout using jsPDF.
 */
class DownloadManager {
  async download(pages, gridCalc, settings, renderer, showLoading, hideLoading) {
    if (!window.jspdf) {
      alert('PDF library not loaded. Please check your internet connection.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const { rows, cols } = settings.grid;
    const {
      paperSize, orientation, margin, gap, borderThickness, scaleMode
    } = settings;

    const paper = gridCalc.getPaperDimensions(paperSize, orientation);
    const calc = gridCalc.calculate(rows, cols, pages.length);

    // jsPDF uses mm for units
    const pdfW = paper.width;
    const pdfH = paper.height;
    const isLandscape = orientation === 'landscape';

    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pdfW, pdfH]
    });

    if (showLoading) showLoading('Generating PDF...');

    const cellSize = gridCalc.calculateCellSize(
      pdfW, pdfH, rows, cols, margin, gap
    );

    for (let s = 0; s < calc.sheetsRequired; s++) {
      if (s > 0) pdf.addPage([pdfW, pdfH], isLandscape ? 'landscape' : 'portrait');

      const sheet = calc.sheets[s];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const itemIdx = sheet.startIdx + r * cols + c;
          if (itemIdx >= pages.length) continue;

          const page = pages[itemIdx];

          const cellX = margin + c * (cellSize.cellWidth + gap);
          const cellY = margin + r * (cellSize.cellHeight + gap);

          // Render page to a temporary canvas for the export
          const exportCanvas = await this._renderPageToCanvas(
            page, cellSize.cellWidth, cellSize.cellHeight, gridCalc, scaleMode
          );

          const imgData = exportCanvas.toDataURL('image/jpeg', 0.95);
          const imgW = cellSize.cellWidth;
          const imgH = cellSize.cellHeight;

          // Calculate placement within cell
          const pageAR = page.width / page.height;
          const cellAR = cellSize.cellWidth / cellSize.cellHeight;
          let drawW, drawH, drawX, drawY;

          if (scaleMode === 'fill') {
            if (pageAR > cellAR) {
              drawH = imgH;
              drawW = imgH * pageAR;
            } else {
              drawW = imgW;
              drawH = imgW / pageAR;
            }
            drawX = cellX + (imgW - drawW) / 2;
            drawY = cellY + (imgH - drawH) / 2;
          } else if (scaleMode === 'stretch') {
            drawW = imgW;
            drawH = imgH;
            drawX = cellX;
            drawY = cellY;
          } else {
            // fit or original
            if (pageAR > cellAR) {
              drawW = imgW;
              drawH = imgW / pageAR;
            } else {
              drawH = imgH;
              drawW = imgH * pageAR;
            }
            drawX = cellX + (imgW - drawW) / 2;
            drawY = cellY + (imgH - drawH) / 2;
          }

          pdf.addImage(imgData, 'JPEG', drawX, drawY, drawW, drawH);

          // Border
          if (borderThickness > 0) {
            pdf.setDrawColor(0);
            pdf.setLineWidth(borderThickness);
            pdf.rect(cellX, cellY, imgW, imgH);
          }
        }
      }
    }

    pdf.save('one-page-print.pdf');

    if (hideLoading) hideLoading();
  }

  async _renderPageToCanvas(page, cellWidthMm, cellHeightMm, gridCalc, scaleMode) {
    const img = await this._loadImage(page.dataUrl);
    if (!img) {
      const c = document.createElement('canvas');
      c.width = 100;
      c.height = 100;
      return c;
    }

    // Render at high resolution (300 DPI)
    const dpi = 300;
    const pxPerMm = dpi / 25.4;

    const cellWPx = Math.round(cellWidthMm * pxPerMm);
    const cellHPx = Math.round(cellHeightMm * pxPerMm);

    const placement = gridCalc.getPlacement(
      img.naturalWidth, img.naturalHeight,
      cellWidthMm, cellHeightMm,
      scaleMode
    );

    const canvas = document.createElement('canvas');
    canvas.width = cellWPx;
    canvas.height = cellHPx;
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cellWPx, cellHPx);

    const imgXPx = Math.round(placement.x * pxPerMm);
    const imgYPx = Math.round(placement.y * pxPerMm);
    const imgWPx = Math.round(placement.w * pxPerMm);
    const imgHPx = Math.round(placement.h * pxPerMm);

    if (page.rotation === 90) {
      ctx.translate(imgXPx + imgWPx, imgYPx);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, imgHPx, imgWPx);
    } else if (page.rotation === 180) {
      ctx.translate(imgXPx + imgWPx, imgYPx + imgHPx);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0, imgWPx, imgHPx);
    } else if (page.rotation === 270) {
      ctx.translate(imgXPx, imgYPx + imgHPx);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, imgHPx, imgWPx);
    } else {
      ctx.drawImage(img, imgXPx, imgYPx, imgWPx, imgHPx);
    }

    return canvas;
  }

  _loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
}

window.DownloadManager = DownloadManager;
