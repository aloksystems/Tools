/**
 * PrintManager — generates print-ready HTML and triggers the browser print dialog.
 */
class PrintManager {
  constructor() {
    this.printContainer = document.getElementById('printContainer');
  }

  async print(pages, gridCalc, settings) {
    const { rows, cols } = settings.grid;
    const {
      paperSize, orientation, margin, gap, borderThickness, scaleMode
    } = settings;

    const paper = gridCalc.getPaperDimensions(paperSize, orientation);
    const calc = gridCalc.calculate(rows, cols, pages.length);
    const cellSize = gridCalc.calculateCellSize(
      paper.width, paper.height, rows, cols, margin, gap
    );

    // Set @page size
    this._setPageSize(paper.width, paper.height);

    // Build print sheets
    this.printContainer.innerHTML = '';

    for (let s = 0; s < calc.sheetsRequired; s++) {
      const sheetDiv = document.createElement('div');
      sheetDiv.className = 'print-sheet';
      sheetDiv.style.width = paper.width + 'mm';
      sheetDiv.style.height = paper.height + 'mm';

      const sheet = calc.sheets[s];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const itemIdx = sheet.startIdx + r * cols + c;
          if (itemIdx >= pages.length) continue;

          const page = pages[itemIdx];
          const cellDiv = document.createElement('div');
          cellDiv.className = 'print-cell' + (borderThickness > 0 ? ' border-on' : '');

          const left = margin + c * (cellSize.cellWidth + gap);
          const top = margin + r * (cellSize.cellHeight + gap);

          cellDiv.style.left = left + 'mm';
          cellDiv.style.top = top + 'mm';
          cellDiv.style.width = cellSize.cellWidth + 'mm';
          cellDiv.style.height = cellSize.cellHeight + 'mm';

          if (borderThickness > 0) {
            cellDiv.style.borderWidth = borderThickness + 'mm';
          }

          const img = document.createElement('img');
          img.src = page.dataUrl;
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.style.objectFit = scaleMode === 'fill' ? 'cover' : 'contain';
          if (scaleMode === 'stretch') {
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'fill';
          }

          cellDiv.appendChild(img);
          sheetDiv.appendChild(cellDiv);
        }
      }

      this.printContainer.appendChild(sheetDiv);
    }

    // Trigger print
    window.print();
  }

  _setPageSize(widthMm, heightMm) {
    let style = document.getElementById('dynamicPrintStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dynamicPrintStyle';
      document.head.appendChild(style);
    }
    style.textContent = `
      @page {
        size: ${widthMm}mm ${heightMm}mm;
        margin: 0;
      }
    `;
  }
}

window.PrintManager = PrintManager;
