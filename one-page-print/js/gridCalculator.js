/**
 * GridCalculator — handles grid layout math and paper size definitions.
 */
class GridCalculator {
  constructor() {
    // Paper sizes in mm
    this.paperSizes = {
      a4: { width: 210, height: 297, label: 'A4' },
      a3: { width: 297, height: 420, label: 'A3' },
      letter: { width: 216, height: 279, label: 'Letter' },
      legal: { width: 216, height: 356, label: 'Legal' }
    };

    // Common presets: [rows, cols]
    this.presets = [
      [1,1],[1,2],[2,1],[2,2],[2,3],[3,2],[3,3],
      [2,4],[4,2],[3,4],[4,3],[4,4],[5,5]
    ];
  }

  getPaperDimensions(paperSize, orientation) {
    const paper = this.paperSizes[paperSize] || this.paperSizes.a4;
    if (orientation === 'landscape') {
      return { width: paper.height, height: paper.width, label: paper.label };
    }
    return { width: paper.width, height: paper.height, label: paper.label };
  }

  calculate(rows, cols, totalItems) {
    const itemsPerSheet = rows * cols;
    const sheetsRequired = Math.ceil(totalItems / itemsPerSheet);
    const lastSheetItems = totalItems % itemsPerSheet || itemsPerSheet;

    const sheets = [];
    for (let s = 0; s < sheetsRequired; s++) {
      const startIdx = s * itemsPerSheet;
      const endIdx = Math.min(startIdx + itemsPerSheet, totalItems);
      const count = endIdx - startIdx;
      sheets.push({ index: s, startIdx, endIdx, count });
    }

    return {
      rows,
      cols,
      itemsPerSheet,
      sheetsRequired,
      lastSheetItems,
      sheets
    };
  }

  calculateCellSize(paperWidthMm, paperHeightMm, rows, cols, marginMm, gapMm) {
    const totalGapX = gapMm * (cols - 1);
    const totalGapY = gapMm * (rows - 1);
    const cellWidth = (paperWidthMm - 2 * marginMm - totalGapX) / cols;
    const cellHeight = (paperHeightMm - 2 * marginMm - totalGapY) / rows;
    return { cellWidth, cellHeight };
  }

  /**
   * Returns the best fitting area for an item within a cell,
   * based on the scaling mode.
   */
  getPlacement(itemWidth, itemHeight, cellWidth, cellHeight, mode) {
    const itemAR = itemWidth / itemHeight;
    const cellAR = cellWidth / cellHeight;

    let w, h;

    switch (mode) {
      case 'fill': {
        // Fill cell, crop overflow
        if (itemAR > cellAR) {
          h = cellHeight;
          w = cellHeight * itemAR;
        } else {
          w = cellWidth;
          h = cellWidth / itemAR;
        }
        break;
      }
      case 'original': {
        // Original size (assume 96dpi for px to mm: 1px = 0.264583mm)
        w = itemWidth * 0.264583;
        h = itemHeight * 0.264583;
        // Clamp to cell if larger
        if (w > cellWidth || h > cellHeight) {
          if (itemAR > cellAR) {
            w = cellWidth;
            h = cellWidth / itemAR;
          } else {
            h = cellHeight;
            w = cellHeight * itemAR;
          }
        }
        break;
      }
      case 'stretch': {
        w = cellWidth;
        h = cellHeight;
        break;
      }
      case 'fit':
      default: {
        // Fit inside cell, preserve ratio
        if (itemAR > cellAR) {
          w = cellWidth;
          h = cellWidth / itemAR;
        } else {
          h = cellHeight;
          w = cellHeight * itemAR;
        }
        break;
      }
    }

    const x = (cellWidth - w) / 2;
    const y = (cellHeight - h) / 2;

    return { x, y, w, h };
  }

  autoArrange(totalItems, paperSize, orientation) {
    if (totalItems === 0) return { rows: 1, cols: 1 };

    const paper = this.getPaperDimensions(paperSize, orientation);
    const isLandscape = orientation === 'landscape';

    // Try to find a layout that minimizes sheets while keeping readability
    // Never force everything onto a single sheet unless items <= max grid
    const maxCells = 16; // 4x4 max reasonable

    let bestRows = 1, bestCols = 1;
    let bestSheets = totalItems;

    for (let r = 1; r <= 5; r++) {
      for (let c = 1; c <= 5; c++) {
        const itemsPerSheet = r * c;
        if (itemsPerSheet > maxCells) continue;
        if (itemsPerSheet < totalItems && itemsPerSheet < 2) continue; // Don't use 1x1 for multiple items

        const sheets = Math.ceil(totalItems / itemsPerSheet);
        const lastSheetFill = (totalItems % itemsPerSheet) || itemsPerSheet;
        const fillRatio = lastSheetFill / itemsPerSheet;

        // Prefer layouts where the last sheet is reasonably filled
        // Penalize very empty last sheets
        const score = sheets + (fillRatio < 0.3 && sheets > 1 ? 0.5 : 0);

        if (score < bestSheets || (score === bestSheets && itemsPerSheet > bestRows * bestCols)) {
          bestSheets = score;
          bestRows = r;
          bestCols = c;
        }
      }
    }

    // For landscape paper, prefer wider grids
    if (isLandscape && bestRows > bestCols) {
      [bestRows, bestCols] = [bestCols, bestRows];
    }

    return { rows: bestRows, cols: bestCols };
  }
}

window.GridCalculator = GridCalculator;
