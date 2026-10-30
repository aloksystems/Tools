// ========================================
// PROFESSIONAL IMAGE EDITOR - FULL FEATURED
// ========================================

// ====================
// STATE MANAGEMENT
// ====================
const state = {
  // Current image data
  originalImageSrc: null,
  currentImageSrc: null,
  
  // Canvas & context
  canvas: null,
  ctx: null,
  
  // Cropper instance
  cropper: null,
  
  // Layers system
  layers: [],
  activeLayerIndex: 0,
  layerIdCounter: 0,
  
  // History for undo/redo
  history: [],
  historyIndex: -1,
  maxHistory: 50,
  
  // Transform state
  rotation: 0,
  
  // Text overlays (legacy - now part of layers)
  textOverlays: [],
  selectedTextIndex: null,
  isDraggingText: false,
  dragOffsetX: 0,
  dragOffsetY: 0,

  // Brush / Eraser
  toolMode: 'move',
  isDrawing: false,
  brushStrokes: [],
  currentStroke: null,
  
  // Image dimensions
  originalWidth: 0,
  originalHeight: 0,
  aspectRatio: 1,
  
  // UI state
  hasImage: false,
};

// ====================
// DOM ELEMENTS
// ====================
const elements = {
  // Image input
  imageInput: document.getElementById('imageInput'),
  dragArea: document.getElementById('dragArea'),
  imagePreview: document.getElementById('imagePreview'),
  canvas: document.getElementById('canvas'),
  
  // Sliders - Basic
  brightnessInput: document.getElementById('brightnessInput'),
  contrastInput: document.getElementById('contrastInput'),
  saturationInput: document.getElementById('saturationInput'),
  hueInput: document.getElementById('hueInput'),
  grayscaleInput: document.getElementById('grayscaleInput'),
  
  // Sliders - Advanced
  blurInput: document.getElementById('blurInput'),
  sharpenInput: document.getElementById('sharpenInput'),
  warmthInput: document.getElementById('warmthInput'),
  highlightsInput: document.getElementById('highlightsInput'),
  shadowsInput: document.getElementById('shadowsInput'),
  fadeInput: document.getElementById('fadeInput'),
  vignetteInput: document.getElementById('vignetteInput'),
  grainInput: document.getElementById('grainInput'),
  
  // Text controls
  textInput: document.getElementById('textInput'),
  textColor: document.getElementById('textColor'),
  textSize: document.getElementById('textSize'),
  fontFamily: document.getElementById('fontFamily'),
  fontWeight: document.getElementById('fontWeight'),
  fontStyle: document.getElementById('fontStyle'),
  textStrokeColor: document.getElementById('textStrokeColor'),
  textStrokeWidth: document.getElementById('textStrokeWidth'),
  textShadowColor: document.getElementById('textShadowColor'),
  textShadowBlur: document.getElementById('textShadowBlur'),
  textLetterSpacing: document.getElementById('textLetterSpacing'),
  deleteTextBtn: document.getElementById('deleteTextBtn'),

  // Brush controls
  brushSize: document.getElementById('brushSize'),
  brushColor: document.getElementById('brushColor'),
  moveModeBtn: document.getElementById('moveModeBtn'),
  brushModeBtn: document.getElementById('brushModeBtn'),
  eraserModeBtn: document.getElementById('eraserModeBtn'),
  
  // Resize modal
  resizeModal: document.getElementById('resizeModal'),
  widthInput: document.getElementById('widthInput'),
  heightInput: document.getElementById('heightInput'),
  lockAspectRatio: document.getElementById('lockAspectRatio'),
  
  // Download modal
  downloadModal: document.getElementById('downloadModal'),
  exportFormat: document.getElementById('exportFormat'),
  exportQuality: document.getElementById('exportQuality'),
  qualityGroup: document.getElementById('qualityGroup'),
  exportSizePreset: document.getElementById('exportSizePreset'),
  exportProfile: document.getElementById('exportProfile'),
  
  // Download panel
  downloadPanel: document.getElementById('downloadPanel'),
  
  // Layers
  layersList: document.getElementById('layersList'),
  layerOpacity: document.getElementById('layerOpacity'),
  blendModeSelect: document.getElementById('blendModeSelect'),
  addLayerBtn: document.getElementById('addLayerBtn'),
  deleteLayerBtn: document.getElementById('deleteLayerBtn'),
  duplicateLayerBtn: document.getElementById('duplicateLayerBtn'),
  moveLayerUpBtn: document.getElementById('moveLayerUpBtn'),
  moveLayerDownBtn: document.getElementById('moveLayerDownBtn'),
  
  // Undo/Redo
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  
  // Dark mode
};

// ====================
// INITIALIZATION
// ====================
function init() {
  state.canvas = elements.canvas;
  state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
  
  setupEventListeners();
  loadDarkModeSetting();
  initializeTabs();
  initializeCollapsibles();
  updateHistoryButtons();
  updateToolModeButtons();
}

// Setup all event listeners
function setupEventListeners() {
  // Image upload
  elements.imageInput.addEventListener('change', handleFileSelect);
  elements.dragArea.addEventListener('click', () => elements.imageInput.click());
  setupDragAndDrop();
  
  // Filter sliders with debouncing
  const filterInputs = [
    elements.brightnessInput, elements.contrastInput, elements.saturationInput,
    elements.hueInput, elements.grayscaleInput, elements.blurInput,
    elements.sharpenInput, elements.warmthInput, elements.highlightsInput,
    elements.shadowsInput, elements.fadeInput, elements.vignetteInput,
    elements.grainInput
  ];
  
  filterInputs.forEach(input => {
    if (input) {
      // Live preview on input, but only record one history entry when the
      // adjustment is committed (change), so dragging a slider doesn't flood
      // the undo stack with dozens of snapshots.
      input.addEventListener('input', debounce(() => {
        updateFilterValues();
        renderCanvas();
      }, 100));
      input.addEventListener('change', () => saveStateToHistory());
    }
  });
  
  // Resize modal aspect ratio sync
  elements.widthInput?.addEventListener('input', syncAspectRatio);
  elements.heightInput?.addEventListener('input', syncAspectRatio);
  
  // Export quality display
  elements.exportQuality?.addEventListener('input', (e) => {
    document.getElementById('qualityValue').textContent = e.target.value + '%';
  });

  // Text style live update for selected text
  [
    elements.textColor,
    elements.textSize,
    elements.fontFamily,
    elements.fontWeight,
    elements.fontStyle,
    elements.textStrokeColor,
    elements.textStrokeWidth,
    elements.textShadowColor,
    elements.textShadowBlur,
    elements.textLetterSpacing,
  ].forEach((control) => {
    control?.addEventListener('input', updateSelectedTextStyleFromControls);
    control?.addEventListener('change', updateSelectedTextStyleFromControls);
  });
  
  // Layer controls
  elements.layerOpacity?.addEventListener('input', updateActiveLayerOpacity);
  elements.layerOpacity?.addEventListener('change', () => saveStateToHistory());
  elements.blendModeSelect?.addEventListener('change', updateActiveLayerBlendMode);
  elements.addLayerBtn?.addEventListener('click', addNewLayer);
  elements.deleteLayerBtn?.addEventListener('click', deleteActiveLayer);
  elements.duplicateLayerBtn?.addEventListener('click', duplicateActiveLayer);
  elements.moveLayerUpBtn?.addEventListener('click', moveActiveLayerUp);
  elements.moveLayerDownBtn?.addEventListener('click', moveActiveLayerDown);
  
  // Undo/Redo
  elements.undoBtn?.addEventListener('click', undo);
  elements.redoBtn?.addEventListener('click', redo);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // Canvas interaction for text
  state.canvas.addEventListener('mousedown', handleCanvasMouseDown);
  state.canvas.addEventListener('mousemove', handleCanvasMouseMove);
  state.canvas.addEventListener('mouseup', handleCanvasMouseUp);
  state.canvas.addEventListener('mouseleave', handleCanvasMouseUp);
  
  // Touch support for text dragging
  state.canvas.addEventListener('touchstart', handleCanvasTouchStart);
  state.canvas.addEventListener('touchmove', handleCanvasTouchMove);
  state.canvas.addEventListener('touchend', handleCanvasTouchEnd);
  
  
  // Window resize handler (with debounce)
  window.addEventListener('resize', debounce(() => {
    if (state.hasImage && !state.cropper) {
      // Recalculate canvas size based on new viewport
      const img = new Image();
      img.onload = function() {
        const optimalSize = calculateOptimalCanvasSize(img.width, img.height);
        state.canvas.width = optimalSize.width;
        state.canvas.height = optimalSize.height;
        renderCanvas();
      };
      img.src = state.layers[0]?.imageSrc || state.currentImageSrc;
    }
  }, 250));
}

// ====================
// DRAG & DROP
// ====================
function setupDragAndDrop() {
  elements.dragArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dragArea.style.borderColor = 'var(--accent-primary)';
    elements.dragArea.style.background = 'var(--accent-light)';
  });
  
  elements.dragArea.addEventListener('dragleave', () => {
    elements.dragArea.style.borderColor = '';
    elements.dragArea.style.background = '';
  });
  
  elements.dragArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dragArea.style.borderColor = '';
    elements.dragArea.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      loadImageFile(file);
    }
  });
}

// ====================
// IMAGE LOADING
// ====================
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    loadImageFile(file);
  }
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      state.originalImageSrc = e.target.result;
      state.currentImageSrc = e.target.result;
      state.originalWidth = img.width;
      state.originalHeight = img.height;
      state.aspectRatio = img.width / img.height;
      state.hasImage = true;
      
      // Update resize inputs
      elements.widthInput.value = img.width;
      elements.heightInput.value = img.height;
      
      // Hide drag area, show download panel
      elements.dragArea.style.display = 'none';
      elements.downloadPanel.style.display = 'flex';
      
      // Initialize first layer with the image
      initializeLayersWithImage(e.target.result);
      
      // Setup cropper (but keep it hidden initially)
      elements.imagePreview.src = e.target.result;
      elements.imagePreview.style.display = 'none'; // Hidden by default
      if (state.cropper) state.cropper.destroy();
      // Don't initialize cropper yet - will do it when crop button is clicked
      
      // Calculate optimal canvas size for viewport
      const optimalSize = calculateOptimalCanvasSize(img.width, img.height);
      state.canvas.width = optimalSize.width;
      state.canvas.height = optimalSize.height;
      
      // Reset history
      state.history = [];
      state.historyIndex = -1;
      
      // Show canvas and render
      state.canvas.style.display = 'block';
      renderCanvas();
      saveStateToHistory();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ====================
// LAYERS SYSTEM
// ====================
function initializeLayersWithImage(imageSrc) {
  state.layers = [{
    id: state.layerIdCounter++,
    name: 'Background',
    type: 'image',
    visible: true,
    opacity: 100,
    blendMode: 'source-over',
    imageSrc: imageSrc,
    filters: getDefaultFilters(),
  }];
  state.activeLayerIndex = 0;
  renderLayersList();
}

function getDefaultFilters() {
  return {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    grayscale: 0,
    blur: 0,
    sharpen: 0,
    warmth: 0,
    highlights: 0,
    shadows: 0,
    fade: 0,
    vignette: 0,
    grain: 0,
  };
}

function addNewLayer() {
  if (!state.hasImage) return;
  
  const newLayer = {
    id: state.layerIdCounter++,
    name: `Layer ${state.layerIdCounter}`,
    type: 'adjustment',
    visible: true,
    opacity: 100,
    blendMode: 'source-over',
    filters: getDefaultFilters(),
  };
  
  state.layers.push(newLayer);
  state.activeLayerIndex = state.layers.length - 1;
  renderLayersList();
  updateLayerControls();
  saveStateToHistory();
  renderCanvas();
}

function deleteActiveLayer() {
  if (state.layers.length <= 1) return; // Keep at least one layer
  
  state.layers.splice(state.activeLayerIndex, 1);
  state.activeLayerIndex = Math.max(0, state.activeLayerIndex - 1);
  renderLayersList();
  updateLayerControls();
  saveStateToHistory();
  renderCanvas();
}

function duplicateActiveLayer() {
  if (!state.hasImage) return;
  
  const activeLayer = state.layers[state.activeLayerIndex];
  const duplicatedLayer = JSON.parse(JSON.stringify(activeLayer));
  duplicatedLayer.id = state.layerIdCounter++;
  duplicatedLayer.name = `${activeLayer.name} Copy`;
  
  state.layers.splice(state.activeLayerIndex + 1, 0, duplicatedLayer);
  state.activeLayerIndex = state.activeLayerIndex + 1;
  renderLayersList();
  updateLayerControls();
  saveStateToHistory();
  renderCanvas();
}

function moveActiveLayerUp() {
  if (state.activeLayerIndex >= state.layers.length - 1) return;
  
  const temp = state.layers[state.activeLayerIndex];
  state.layers[state.activeLayerIndex] = state.layers[state.activeLayerIndex + 1];
  state.layers[state.activeLayerIndex + 1] = temp;
  state.activeLayerIndex++;
  
  renderLayersList();
  saveStateToHistory();
  renderCanvas();
}

function moveActiveLayerDown() {
  if (state.activeLayerIndex <= 0) return;
  
  const temp = state.layers[state.activeLayerIndex];
  state.layers[state.activeLayerIndex] = state.layers[state.activeLayerIndex - 1];
  state.layers[state.activeLayerIndex - 1] = temp;
  state.activeLayerIndex--;
  
  renderLayersList();
  saveStateToHistory();
  renderCanvas();
}

function selectLayer(index) {
  state.activeLayerIndex = index;
  renderLayersList();
  updateLayerControls();
  loadLayerFiltersToUI();
}

function toggleLayerVisibility(index) {
  state.layers[index].visible = !state.layers[index].visible;
  renderLayersList();
  saveStateToHistory();
  renderCanvas();
}

function updateActiveLayerOpacity(e) {
  if (!state.hasImage) return;
  
  const opacity = parseInt(e.target.value);
  state.layers[state.activeLayerIndex].opacity = opacity;
  document.getElementById('layerOpacityValue').textContent = opacity + '%';
  renderCanvas();
}

function updateActiveLayerBlendMode(e) {
  if (!state.hasImage) return;
  
  state.layers[state.activeLayerIndex].blendMode = e.target.value;
  saveStateToHistory();
  renderCanvas();
}

function updateLayerControls() {
  const activeLayer = state.layers[state.activeLayerIndex];
  if (!activeLayer) return;
  
  elements.layerOpacity.value = activeLayer.opacity;
  document.getElementById('layerOpacityValue').textContent = activeLayer.opacity + '%';
  elements.blendModeSelect.value = activeLayer.blendMode;
}

function loadLayerFiltersToUI() {
  const activeLayer = state.layers[state.activeLayerIndex];
  if (!activeLayer || !activeLayer.filters) return;
  
  const filters = activeLayer.filters;
  
  elements.brightnessInput.value = filters.brightness;
  elements.contrastInput.value = filters.contrast;
  elements.saturationInput.value = filters.saturation;
  elements.hueInput.value = filters.hue;
  elements.grayscaleInput.value = filters.grayscale;
  elements.blurInput.value = filters.blur;
  elements.sharpenInput.value = filters.sharpen;
  elements.warmthInput.value = filters.warmth;
  elements.highlightsInput.value = filters.highlights;
  elements.shadowsInput.value = filters.shadows;
  elements.fadeInput.value = filters.fade;
  elements.vignetteInput.value = filters.vignette;
  elements.grainInput.value = filters.grain;
  
  updateFilterValues();
}

function saveCurrentFiltersToActiveLayer() {
  const activeLayer = state.layers[state.activeLayerIndex];
  if (!activeLayer) return;
  
  if (!activeLayer.filters) {
    activeLayer.filters = getDefaultFilters();
  }
  
  activeLayer.filters = {
    brightness: parseInt(elements.brightnessInput.value),
    contrast: parseInt(elements.contrastInput.value),
    saturation: parseInt(elements.saturationInput.value),
    hue: parseInt(elements.hueInput.value),
    grayscale: parseInt(elements.grayscaleInput.value),
    blur: parseInt(elements.blurInput.value),
    sharpen: parseInt(elements.sharpenInput.value),
    warmth: parseInt(elements.warmthInput.value),
    highlights: parseInt(elements.highlightsInput.value),
    shadows: parseInt(elements.shadowsInput.value),
    fade: parseInt(elements.fadeInput.value),
    vignette: parseInt(elements.vignetteInput.value),
    grain: parseInt(elements.grainInput.value),
  };
}

function renderLayersList() {
  const listHTML = state.layers.map((layer, index) => {
    const isActive = index === state.activeLayerIndex;
    const visibilityIcon = layer.visible ? 'fa-eye' : 'fa-eye-slash';
    
    return `
      <div class="layer-item ${isActive ? 'selected' : ''}" onclick="selectLayer(${index})">
        <div class="layer-thumbnail"></div>
        <div class="layer-info">
          <div class="layer-name">${layer.name}</div>
          <div class="layer-type">${layer.type}</div>
        </div>
        <i class="fas ${visibilityIcon} layer-visibility ${!layer.visible ? 'hidden' : ''}" 
           onclick="event.stopPropagation(); toggleLayerVisibility(${index})"></i>
      </div>
    `;
  }).reverse().join(''); // Reverse to show top layer first
  
  elements.layersList.innerHTML = listHTML;
}

// ====================
// HISTORY (UNDO/REDO)
// ====================
function saveStateToHistory() {
  if (!state.hasImage) return;
  
  // Remove any states after current position
  state.history = state.history.slice(0, state.historyIndex + 1);
  
  // Save current state
  const stateSnapshot = {
    layers: JSON.parse(JSON.stringify(state.layers)),
    textOverlays: JSON.parse(JSON.stringify(state.textOverlays)),
    brushStrokes: JSON.parse(JSON.stringify(state.brushStrokes)),
    rotation: state.rotation,
    currentImageSrc: state.currentImageSrc,
    toolMode: state.toolMode,
    canvasWidth: state.canvas.width,
    canvasHeight: state.canvas.height,
  };
  
  state.history.push(stateSnapshot);
  
  // Limit history size
  if (state.history.length > state.maxHistory) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }
  
  updateHistoryButtons();
}

function undo() {
  if (state.historyIndex <= 0) return;
  
  state.historyIndex--;
  loadStateFromHistory();
  updateHistoryButtons();
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  
  state.historyIndex++;
  loadStateFromHistory();
  updateHistoryButtons();
}

function loadStateFromHistory() {
  const stateSnapshot = state.history[state.historyIndex];
  if (!stateSnapshot) return;
  
  state.layers = JSON.parse(JSON.stringify(stateSnapshot.layers));
  state.textOverlays = JSON.parse(JSON.stringify(stateSnapshot.textOverlays));
  state.brushStrokes = JSON.parse(JSON.stringify(stateSnapshot.brushStrokes || []));
  state.rotation = stateSnapshot.rotation;
  state.currentImageSrc = stateSnapshot.currentImageSrc;
  state.toolMode = stateSnapshot.toolMode || 'move';
  updateToolModeButtons();

  // Restore canvas dimensions so undo/redo work correctly after resize/crop.
  if (stateSnapshot.canvasWidth && stateSnapshot.canvasHeight) {
    state.canvas.width = stateSnapshot.canvasWidth;
    state.canvas.height = stateSnapshot.canvasHeight;
  }
  
  renderLayersList();
  updateLayerControls();
  loadLayerFiltersToUI();
  renderCanvas();
}

function updateHistoryButtons() {
  elements.undoBtn.disabled = state.historyIndex <= 0;
  elements.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

// ====================
// IMAGE TRANSFORMATIONS
// ====================
function rotateImage() {
  if (!state.hasImage) return;
  
  state.rotation = (state.rotation + 90) % 360;
  saveStateToHistory();
  renderCanvas();
}

function cropImage() {
  // If cropper is not active, enter crop mode
  if (!state.cropper) {
    // Hide canvas, show imagePreview
    state.canvas.style.display = 'none';
    elements.imagePreview.style.display = 'block';
    
    // Initialize cropper
    state.cropper = new Cropper(elements.imagePreview, {
      aspectRatio: NaN,
      viewMode: 1,
    });
    
    // Update button text
    const cropBtnText = document.getElementById('cropBtnText');
    if (cropBtnText) cropBtnText.textContent = 'Apply Crop';
    return;
  }
  
  // If cropper is active, apply the crop
  const croppedCanvas = state.cropper.getCroppedCanvas();
  state.currentImageSrc = croppedCanvas.toDataURL('image/png');
  
  // Update base layer
  if (state.layers[0]) {
    state.layers[0].imageSrc = state.currentImageSrc;
  }
  
  // Recalculate optimal canvas size for cropped image
  const optimalSize = calculateOptimalCanvasSize(croppedCanvas.width, croppedCanvas.height);
  state.canvas.width = optimalSize.width;
  state.canvas.height = optimalSize.height;
  state.aspectRatio = croppedCanvas.width / croppedCanvas.height;
  
  // Update resize inputs
  elements.widthInput.value = croppedCanvas.width;
  elements.heightInput.value = croppedCanvas.height;
  
  // Destroy cropper and hide preview
  elements.imagePreview.src = state.currentImageSrc;
  state.cropper.destroy();
  state.cropper = null;
  elements.imagePreview.style.display = 'none';
  state.canvas.style.display = 'block';
  
  // Update button text back
  const cropBtnText = document.getElementById('cropBtnText');
  if (cropBtnText) cropBtnText.textContent = 'Crop';
  
  saveStateToHistory();
  renderCanvas();
}

function resetImage() {
  if (!state.originalImageSrc) return;
  
  state.currentImageSrc = state.originalImageSrc;
  state.rotation = 0;
  state.textOverlays = [];
  state.selectedTextIndex = null;
  state.brushStrokes = [];
  state.toolMode = 'move';
  updateToolModeButtons();
  
  // Reset all layers
  if (state.layers[0]) {
    state.layers[0].imageSrc = state.originalImageSrc;
    state.layers[0].filters = getDefaultFilters();
  }
  
  // Reset other layers
  state.layers = state.layers.slice(0, 1);
  state.activeLayerIndex = 0;
  
  // Reset cropper - but keep it hidden
  elements.imagePreview.src = state.originalImageSrc;
  if (state.cropper) {
    state.cropper.destroy();
    state.cropper = null;
  }
  elements.imagePreview.style.display = 'none';
  state.canvas.style.display = 'block';
  
  // Reset canvas size to optimal for original image
  const optimalSize = calculateOptimalCanvasSize(state.originalWidth, state.originalHeight);
  state.canvas.width = optimalSize.width;
  state.canvas.height = optimalSize.height;
  state.aspectRatio = state.originalWidth / state.originalHeight;
  
  // Reset resize inputs
  elements.widthInput.value = state.originalWidth;
  elements.heightInput.value = state.originalHeight;
  
  // Reset crop button text
  const cropBtnText = document.getElementById('cropBtnText');
  if (cropBtnText) cropBtnText.textContent = 'Crop';
  
  // Reset UI
  loadLayerFiltersToUI();
  renderLayersList();
  updateLayerControls();
  elements.deleteTextBtn.disabled = true;
  
  saveStateToHistory();
  renderCanvas();
}

// ====================
// RESIZE
// ====================
function openResizeModal() {
  if (!state.hasImage) return;
  elements.resizeModal.classList.add('active');
}

function closeResizeModal() {
  elements.resizeModal.classList.remove('active');
}

function syncAspectRatio(e) {
  if (!elements.lockAspectRatio.checked) return;
  
  if (e.target === elements.widthInput) {
    const newHeight = Math.round(elements.widthInput.value / state.aspectRatio);
    elements.heightInput.value = newHeight;
  } else {
    const newWidth = Math.round(elements.heightInput.value * state.aspectRatio);
    elements.widthInput.value = newWidth;
  }
}

function resizeImage() {
  if (!state.hasImage) return;
  
  const newWidth = parseInt(elements.widthInput.value);
  const newHeight = parseInt(elements.heightInput.value);
  
  if (newWidth > 0 && newHeight > 0) {
    // Calculate optimal canvas size based on new dimensions
    const optimalSize = calculateOptimalCanvasSize(newWidth, newHeight);
    state.canvas.width = optimalSize.width;
    state.canvas.height = optimalSize.height;
    
    // Update aspect ratio
    state.aspectRatio = newWidth / newHeight;
    
    closeResizeModal();
    saveStateToHistory();
    renderCanvas();
  }
}

// ====================
// EXPORT/DOWNLOAD
// ====================
function openDownloadModal() {
  if (!state.hasImage) return;
  elements.downloadModal.classList.add('active');
}

function closeDownloadModal() {
  elements.downloadModal.classList.remove('active');
}

function toggleQuality() {
  const format = elements.exportFormat.value;
  elements.qualityGroup.style.display = (format === 'jpeg' || format === 'webp') ? 'block' : 'none';
}

function downloadImage() {
  if (!state.hasImage) return;
  
  const format = elements.exportFormat.value;
  const profile = elements.exportProfile?.value || 'high';
  const sizePreset = elements.exportSizePreset?.value || 'current';

  let qualityFromProfile = 0.95;
  if (profile === 'balanced') qualityFromProfile = 0.85;
  if (profile === 'web') qualityFromProfile = 0.75;

  const qualitySlider = parseInt(elements.exportQuality.value, 10) / 100;
  const quality = Math.min(qualitySlider, qualityFromProfile);
  
  let mimeType;
  let extension;
  
  switch (format) {
    case 'jpeg':
      mimeType = 'image/jpeg';
      extension = 'jpg';
      break;
    case 'webp':
      mimeType = 'image/webp';
      extension = 'webp';
      break;
    default:
      mimeType = 'image/png';
      extension = 'png';
  }
  
  const exportCanvas = buildExportCanvas(sizePreset);
  const dataURL = exportCanvas.toDataURL(mimeType, quality);
  
  const link = document.createElement('a');
  link.download = `image-editor-export.${extension}`;
  link.href = dataURL;
  link.click();
  
  closeDownloadModal();
  saveToLocalStorage();
}

function buildExportCanvas(sizePreset) {
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  let targetWidth = state.canvas.width;
  let targetHeight = state.canvas.height;

  if (sizePreset === 'original') {
    targetWidth = state.originalWidth;
    targetHeight = state.originalHeight;
  }
  if (sizePreset === 'instagram-square') {
    targetWidth = 1080;
    targetHeight = 1080;
  }
  if (sizePreset === 'instagram-story') {
    targetWidth = 1080;
    targetHeight = 1920;
  }
  if (sizePreset === 'youtube-thumb') {
    targetWidth = 1280;
    targetHeight = 720;
  }

  tempCanvas.width = targetWidth;
  tempCanvas.height = targetHeight;
  tempCtx.fillStyle = '#000000';
  tempCtx.fillRect(0, 0, targetWidth, targetHeight);

  const scale = Math.min(targetWidth / state.canvas.width, targetHeight / state.canvas.height);
  const drawWidth = state.canvas.width * scale;
  const drawHeight = state.canvas.height * scale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;

  tempCtx.drawImage(state.canvas, offsetX, offsetY, drawWidth, drawHeight);
  return tempCanvas;
}

function saveToLocalStorage() {
  try {
    localStorage.setItem('editedImage', state.canvas.toDataURL('image/png'));
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('editedImage');
    if (saved && !state.hasImage) {
      // Optionally auto-load saved image
      // For now, we won't auto-load
    }
  } catch (e) {
    console.warn('Could not load from localStorage:', e);
  }
}

// ====================
// TEXT OVERLAY
// ====================
function addText() {
  const text = elements.textInput.value.trim();
  if (!text || !state.hasImage) return;
  
  const textObj = {
    text: text,
    x: 50,
    y: 100,
    size: parseInt(elements.textSize.value),
    color: elements.textColor.value,
    fontFamily: elements.fontFamily.value,
    fontWeight: elements.fontWeight.value,
    fontStyle: elements.fontStyle.value,
    strokeColor: elements.textStrokeColor?.value || '#000000',
    strokeWidth: parseInt(elements.textStrokeWidth?.value || '0', 10),
    shadowColor: elements.textShadowColor?.value || '#000000',
    shadowBlur: parseInt(elements.textShadowBlur?.value || '0', 10),
    letterSpacing: parseInt(elements.textLetterSpacing?.value || '0', 10),
  };
  
  state.textOverlays.push(textObj);
  state.selectedTextIndex = null;
  elements.deleteTextBtn.disabled = true;
  
  saveStateToHistory();
  renderCanvas();
}

function updateSelectedTextStyleFromControls(event) {
  if (state.selectedTextIndex === null || !state.textOverlays[state.selectedTextIndex]) return;

  const textObj = state.textOverlays[state.selectedTextIndex];
  textObj.color = elements.textColor.value;
  textObj.size = parseInt(elements.textSize.value, 10);
  textObj.fontFamily = elements.fontFamily.value;
  textObj.fontWeight = elements.fontWeight.value;
  textObj.fontStyle = elements.fontStyle.value;
  textObj.strokeColor = elements.textStrokeColor?.value || '#000000';
  textObj.strokeWidth = parseInt(elements.textStrokeWidth?.value || '0', 10);
  textObj.shadowColor = elements.textShadowColor?.value || '#000000';
  textObj.shadowBlur = parseInt(elements.textShadowBlur?.value || '0', 10);
  textObj.letterSpacing = parseInt(elements.textLetterSpacing?.value || '0', 10);

  renderCanvas();
  if (event?.type === 'change') {
    saveStateToHistory();
  }
}

function measureLetterSpacedText(textObj) {
  const text = textObj.text || '';
  if (!text.length) return 0;
  const baseWidth = state.ctx.measureText(text).width;
  const spacing = textObj.letterSpacing || 0;
  return baseWidth + Math.max(0, text.length - 1) * spacing;
}

function drawLetterSpacedText(textObj, mode = 'fill') {
  const text = textObj.text || '';
  if (!text.length) return;
  const spacing = textObj.letterSpacing || 0;

  if (spacing <= 0) {
    if (mode === 'stroke') {
      state.ctx.strokeText(text, textObj.x, textObj.y);
    } else {
      state.ctx.fillText(text, textObj.x, textObj.y);
    }
    return;
  }

  let cursorX = textObj.x;
  for (const char of text) {
    if (mode === 'stroke') {
      state.ctx.strokeText(char, cursorX, textObj.y);
    } else {
      state.ctx.fillText(char, cursorX, textObj.y);
    }
    cursorX += state.ctx.measureText(char).width + spacing;
  }
}

function alignSelectedText(direction) {
  if (state.selectedTextIndex === null || !state.textOverlays[state.selectedTextIndex]) return;

  const textObj = state.textOverlays[state.selectedTextIndex];
  state.ctx.font = `${textObj.fontStyle} ${textObj.fontWeight} ${textObj.size}px ${textObj.fontFamily}`;
  const width = measureLetterSpacedText(textObj);

  if (direction === 'left') {
    textObj.x = 24;
  }
  if (direction === 'center') {
    textObj.x = Math.max(10, (state.canvas.width - width) / 2);
  }
  if (direction === 'right') {
    textObj.x = Math.max(10, state.canvas.width - width - 24);
  }

  saveStateToHistory();
  renderCanvas();
}

function deleteSelectedText() {
  if (state.selectedTextIndex === null) return;
  
  state.textOverlays.splice(state.selectedTextIndex, 1);
  state.selectedTextIndex = null;
  elements.deleteTextBtn.disabled = true;
  
  saveStateToHistory();
  renderCanvas();
}

function getTextBounds(textObj) {
  state.ctx.font = `${textObj.fontStyle} ${textObj.fontWeight} ${textObj.size}px ${textObj.fontFamily}`;
  const width = measureLetterSpacedText(textObj) + (textObj.strokeWidth || 0) * 2;
  const height = textObj.size + (textObj.shadowBlur || 0);
  
  return {
    x: textObj.x,
    y: textObj.y - height,
    width: width,
    height: height,
  };
}

function getTextAtPosition(x, y) {
  for (let i = state.textOverlays.length - 1; i >= 0; i--) {
    const bounds = getTextBounds(state.textOverlays[i]);
    if (x >= bounds.x && x <= bounds.x + bounds.width &&
        y >= bounds.y && y <= bounds.y + bounds.height) {
      return i;
    }
  }
  return null;
}

function getCanvasCoordinates(event) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

// Mouse events
function handleCanvasMouseDown(e) {
  if (!state.hasImage) return;
  
  const coords = getCanvasCoordinates(e);

  if (state.toolMode === 'brush' || state.toolMode === 'eraser') {
    state.isDrawing = true;
    state.currentStroke = {
      mode: state.toolMode,
      color: elements.brushColor?.value || '#ff3b30',
      size: parseInt(elements.brushSize?.value || '20', 10),
      points: [coords],
    };
    renderCanvas();
    return;
  }

  const index = getTextAtPosition(coords.x, coords.y);
  
  if (index !== null) {
    state.selectedTextIndex = index;
    state.isDraggingText = true;
    state.dragOffsetX = coords.x - state.textOverlays[index].x;
    state.dragOffsetY = coords.y - state.textOverlays[index].y;
    elements.deleteTextBtn.disabled = false;
    populateTextControlsFromSelected();
  } else {
    state.selectedTextIndex = null;
    elements.deleteTextBtn.disabled = true;
  }
  
  renderCanvas();
}

function handleCanvasMouseMove(e) {
  if (state.isDrawing && state.currentStroke) {
    const coords = getCanvasCoordinates(e);
    state.currentStroke.points.push(coords);
    renderCanvas();
    return;
  }

  if (!state.isDraggingText || state.selectedTextIndex === null) return;
  
  const coords = getCanvasCoordinates(e);
  state.textOverlays[state.selectedTextIndex].x = coords.x - state.dragOffsetX;
  state.textOverlays[state.selectedTextIndex].y = coords.y - state.dragOffsetY;
  
  renderCanvas();
}

function handleCanvasMouseUp() {
  if (state.isDrawing && state.currentStroke) {
    if (state.currentStroke.points.length > 0) {
      state.brushStrokes.push(state.currentStroke);
      saveStateToHistory();
    }
    state.currentStroke = null;
    state.isDrawing = false;
    renderCanvas();
    return;
  }

  if (state.isDraggingText) {
    state.isDraggingText = false;
    saveStateToHistory();
  }
}

// Touch events
function handleCanvasTouchStart(e) {
  e.preventDefault();
  if (!state.hasImage || e.touches.length !== 1) return;
  
  const touch = e.touches[0];
  const coords = getCanvasCoordinates(touch);

  if (state.toolMode === 'brush' || state.toolMode === 'eraser') {
    state.isDrawing = true;
    state.currentStroke = {
      mode: state.toolMode,
      color: elements.brushColor?.value || '#ff3b30',
      size: parseInt(elements.brushSize?.value || '20', 10),
      points: [coords],
    };
    renderCanvas();
    return;
  }

  const index = getTextAtPosition(coords.x, coords.y);
  
  if (index !== null) {
    state.selectedTextIndex = index;
    state.isDraggingText = true;
    state.dragOffsetX = coords.x - state.textOverlays[index].x;
    state.dragOffsetY = coords.y - state.textOverlays[index].y;
    elements.deleteTextBtn.disabled = false;
    populateTextControlsFromSelected();
  } else {
    state.selectedTextIndex = null;
    elements.deleteTextBtn.disabled = true;
  }
  
  renderCanvas();
}

function handleCanvasTouchMove(e) {
  e.preventDefault();

  if (state.isDrawing && state.currentStroke && e.touches.length === 1) {
    const touch = e.touches[0];
    const coords = getCanvasCoordinates(touch);
    state.currentStroke.points.push(coords);
    renderCanvas();
    return;
  }

  if (!state.isDraggingText || state.selectedTextIndex === null || e.touches.length !== 1) return;
  
  const touch = e.touches[0];
  const coords = getCanvasCoordinates(touch);
  state.textOverlays[state.selectedTextIndex].x = coords.x - state.dragOffsetX;
  state.textOverlays[state.selectedTextIndex].y = coords.y - state.dragOffsetY;
  
  renderCanvas();
}

function handleCanvasTouchEnd(e) {
  e.preventDefault();

  if (state.isDrawing && state.currentStroke) {
    if (state.currentStroke.points.length > 0) {
      state.brushStrokes.push(state.currentStroke);
      saveStateToHistory();
    }
    state.currentStroke = null;
    state.isDrawing = false;
    renderCanvas();
    return;
  }

  if (state.isDraggingText) {
    state.isDraggingText = false;
    saveStateToHistory();
  }
}

// ====================
// CANVAS SIZING
// ====================
function calculateOptimalCanvasSize(imageWidth, imageHeight) {
  // Get the canvas container dimensions
  const container = document.querySelector('.canvas-container');
  const maxWidth = container.clientWidth - 48; // Account for padding
  const maxHeight = container.clientHeight - 48;
  
  // Calculate aspect ratio
  const aspectRatio = imageWidth / imageHeight;
  
  let width = imageWidth;
  let height = imageHeight;
  
  // Scale down if image is too large for viewport
  if (width > maxWidth || height > maxHeight) {
    if (width > maxWidth) {
      width = maxWidth;
      height = width / aspectRatio;
    }
    
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }
  }
  
  // Also scale up if image is too small (but not beyond original size)
  if (width < maxWidth * 0.5 && height < maxHeight * 0.5) {
    const scale = Math.min(
      (maxWidth * 0.8) / width,
      (maxHeight * 0.8) / height,
      2 // Don't scale beyond 2x original
    );
    width *= scale;
    height *= scale;
  }
  
  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

// ====================
// RENDERING
// ====================
function renderCanvas() {
  if (!state.hasImage || state.layers.length === 0) return;
  
  // Save current filters to active layer
  saveCurrentFiltersToActiveLayer();
  
  // Get base image
  const baseLayer = state.layers[0];
  if (!baseLayer || !baseLayer.imageSrc) return;
  
  const img = new Image();
  img.onload = function() {
    // Canvas size should already be set during image load
    // But ensure we have valid dimensions
    if (state.canvas.width === 0 || state.canvas.height === 0) {
      const optimalSize = calculateOptimalCanvasSize(img.width, img.height);
      state.canvas.width = optimalSize.width;
      state.canvas.height = optimalSize.height;
    }
    
    // Clear canvas
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    
    // Apply rotation
    state.ctx.save();
    state.ctx.translate(state.canvas.width / 2, state.canvas.height / 2);
    state.ctx.rotate((state.rotation * Math.PI) / 180);
    state.ctx.translate(-state.canvas.width / 2, -state.canvas.height / 2);
    
    // Render all visible layers
    state.layers.forEach((layer) => {
      if (!layer.visible) return;
      
      state.ctx.save();
      state.ctx.globalAlpha = layer.opacity / 100;
      state.ctx.globalCompositeOperation = layer.blendMode;
      
      if (layer.type === 'image' && layer.imageSrc) {
        // Apply filters
        if (layer.filters) {
          applyFiltersToContext(layer.filters);
        }
        
        state.ctx.drawImage(img, 0, 0, state.canvas.width, state.canvas.height);
        
        // Apply advanced filters that need pixel manipulation
        if (layer.filters) {
          applyAdvancedFilters(layer.filters);
        }
      }
      
      state.ctx.restore();
    });
    
    state.ctx.restore();

    drawBrushStrokes(state.brushStrokes);
    if (state.currentStroke) {
      drawBrushStrokes([state.currentStroke]);
    }
    
    // Draw text overlays
    state.textOverlays.forEach((textObj, index) => {
      state.ctx.save();
      state.ctx.fillStyle = textObj.color;
      state.ctx.font = `${textObj.fontStyle} ${textObj.fontWeight} ${textObj.size}px ${textObj.fontFamily}`;
      state.ctx.shadowColor = textObj.shadowColor || 'transparent';
      state.ctx.shadowBlur = textObj.shadowBlur || 0;

      if ((textObj.strokeWidth || 0) > 0) {
        state.ctx.lineWidth = textObj.strokeWidth;
        state.ctx.strokeStyle = textObj.strokeColor || '#000000';
        drawLetterSpacedText(textObj, 'stroke');
      }
      drawLetterSpacedText(textObj, 'fill');
      
      // Draw selection box
      if (index === state.selectedTextIndex) {
        const bounds = getTextBounds(textObj);
        state.ctx.shadowColor = 'transparent';
        state.ctx.shadowBlur = 0;
        state.ctx.strokeStyle = '#528bff';
        state.ctx.lineWidth = 2;
        state.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
      state.ctx.restore();
    });
  };
  
  img.src = baseLayer.imageSrc;
}

function drawBrushStrokes(strokes) {
  strokes.forEach((stroke) => {
    if (!stroke.points || stroke.points.length < 1) return;

    state.ctx.save();
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';
    state.ctx.lineWidth = stroke.size || 20;

    if (stroke.mode === 'eraser') {
      state.ctx.globalCompositeOperation = 'destination-out';
      state.ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      state.ctx.globalCompositeOperation = 'source-over';
      state.ctx.strokeStyle = stroke.color || '#ff3b30';
    }

    state.ctx.beginPath();
    state.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      state.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    if (stroke.points.length === 1) {
      state.ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
    }
    state.ctx.stroke();
    state.ctx.restore();
  });
}

function applyFiltersToContext(filters) {
  let filterString = '';
  filterString += `brightness(${filters.brightness}%) `;
  filterString += `contrast(${filters.contrast}%) `;
  filterString += `saturate(${filters.saturation}%) `;
  filterString += `hue-rotate(${filters.hue}deg) `;
  filterString += `grayscale(${filters.grayscale}%) `;
  filterString += `blur(${filters.blur}px)`;
  
  state.ctx.filter = filterString;
}

function applyAdvancedFilters(filters) {
  // Apply warmth
  if (filters.warmth !== 0) {
    applyWarmth(filters.warmth);
  }
  
  // Apply fade
  if (filters.fade > 0) {
    applyFade(filters.fade);
  }
  
  // Apply highlights/shadows
  if (filters.highlights !== 0 || filters.shadows !== 0) {
    applyHighlightsShadows(filters.highlights, filters.shadows);
  }
  
  // Apply sharpen
  if (filters.sharpen > 0) {
    applySharpen(filters.sharpen);
  }
  
  // Apply grain
  if (filters.grain > 0) {
    applyGrain(filters.grain);
  }
  
  // Apply vignette
  if (filters.vignette > 0) {
    applyVignette(filters.vignette);
  }
  
  // Reset filter
  state.ctx.filter = 'none';
}

// Advanced filter implementations
function applyWarmth(value) {
  const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    if (value > 0) {
      data[i] = Math.min(255, data[i] + value);
      data[i + 2] = Math.max(0, data[i + 2] - value / 2);
    } else {
      data[i] = Math.max(0, data[i] + value / 2);
      data[i + 2] = Math.min(255, data[i + 2] - value);
    }
  }
  
  state.ctx.putImageData(imageData, 0, 0);
}

function applyFade(value) {
  const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  const data = imageData.data;
  const fadeFactor = value / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i] + (128 - data[i]) * fadeFactor;
    data[i + 1] = data[i + 1] + (128 - data[i + 1]) * fadeFactor;
    data[i + 2] = data[i + 2] + (128 - data[i + 2]) * fadeFactor;
  }
  
  state.ctx.putImageData(imageData, 0, 0);
}

function applyHighlightsShadows(highlightsValue, shadowsValue) {
  const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
    
    if (luminance > 180 && highlightsValue !== 0) {
      const factor = highlightsValue > 0 ? 1 + (highlightsValue / 100) : 1 + (highlightsValue / 200);
      data[i] = Math.min(255, Math.max(0, data[i] * factor));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor));
    } else if (luminance < 80 && shadowsValue !== 0) {
      const factor = shadowsValue > 0 ? 1 + (shadowsValue / 50) : 1 + (shadowsValue / 100);
      data[i] = Math.min(255, Math.max(0, data[i] * factor));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor));
    }
  }
  
  state.ctx.putImageData(imageData, 0, 0);
}

function applySharpen(amount) {
  if (amount <= 0) return;
  
  const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  const original = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  const strength = amount * 0.1;
  
  for (let y = 1; y < state.canvas.height - 1; y++) {
    for (let x = 1; x < state.canvas.width - 1; x++) {
      const centerIdx = (y * state.canvas.width + x) * 4;
      
      for (let c = 0; c < 3; c++) {
        const currentVal = original[centerIdx + c];
        const surroundingAvg = (
          original[((y - 1) * state.canvas.width + x) * 4 + c] +
          original[((y + 1) * state.canvas.width + x) * 4 + c] +
          original[(y * state.canvas.width + (x - 1)) * 4 + c] +
          original[(y * state.canvas.width + (x + 1)) * 4 + c]
        ) / 4;
        
        const diff = currentVal - surroundingAvg;
        data[centerIdx + c] = Math.min(255, Math.max(0, currentVal + diff * strength));
      }
    }
  }
  
  state.ctx.putImageData(imageData, 0, 0);
}

function applyGrain(amount) {
  if (amount <= 0) return;
  
  const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  const data = imageData.data;
  const intensity = amount * 0.5;
  
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  
  state.ctx.putImageData(imageData, 0, 0);
}

function applyVignette(amount) {
  if (amount <= 0) return;
  
  const centerX = state.canvas.width / 2;
  const centerY = state.canvas.height / 2;
  const radius = Math.max(state.canvas.width, state.canvas.height) / 2;
  const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  const data = imageData.data;
  const maxDark = (amount / 100) * 0.8;
  
  for (let y = 0; y < state.canvas.height; y++) {
    for (let x = 0; x < state.canvas.width; x++) {
      const index = (y * state.canvas.width + x) * 4;
      const dx = (x - centerX) / radius;
      const dy = (y - centerY) / radius;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      let factor = 0;
      if (distance > 0.4) {
        factor = Math.min(1, (distance - 0.4) / 0.6) * maxDark;
      }
      
      data[index] = data[index] * (1 - factor);
      data[index + 1] = data[index + 1] * (1 - factor);
      data[index + 2] = data[index + 2] * (1 - factor);
    }
  }
  
  state.ctx.putImageData(imageData, 0, 0);
}

// ====================
// PRESET FILTERS
// ====================
function applyPresetFilter(filterName, buttonElement) {
  if (!state.hasImage) return;
  
  // Reset sliders
  resetFilters();
  
  // Apply preset
  switch (filterName) {
    case 'vintage':
      elements.saturationInput.value = 50;
      elements.warmthInput.value = 30;
      elements.fadeInput.value = 30;
      elements.vignetteInput.value = 40;
      elements.grainInput.value = 20;
      break;
    case 'sepia':
      elements.hueInput.value = 30;
      elements.saturationInput.value = 70;
      elements.brightnessInput.value = 110;
      elements.warmthInput.value = 40;
      break;
    case 'clarendon':
      elements.saturationInput.value = 130;
      elements.contrastInput.value = 120;
      elements.highlightsInput.value = 15;
      elements.shadowsInput.value = -15;
      break;
    case 'inkwell':
      elements.grayscaleInput.value = 100;
      elements.contrastInput.value = 125;
      elements.shadowsInput.value = -20;
      break;
    case 'lofi':
      elements.saturationInput.value = 140;
      elements.contrastInput.value = 130;
      elements.shadowsInput.value = -10;
      break;
    case 'toaster':
      elements.brightnessInput.value = 120;
      elements.contrastInput.value = 135;
      elements.warmthInput.value = 35;
      elements.vignetteInput.value = 60;
      break;
    case 'walden':
      elements.brightnessInput.value = 110;
      elements.saturationInput.value = 160;
      elements.warmthInput.value = -20;
      elements.hueInput.value = 200;
      break;
  }
  
  updateFilterValues();
  saveStateToHistory();
  renderCanvas();
  
  // Update active state on filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  buttonElement?.classList.add('active');
}

function resetFilters() {
  elements.brightnessInput.value = 100;
  elements.contrastInput.value = 100;
  elements.saturationInput.value = 100;
  elements.hueInput.value = 0;
  elements.grayscaleInput.value = 0;
  elements.blurInput.value = 0;
  elements.sharpenInput.value = 0;
  elements.warmthInput.value = 0;
  elements.highlightsInput.value = 0;
  elements.shadowsInput.value = 0;
  elements.fadeInput.value = 0;
  elements.vignetteInput.value = 0;
  elements.grainInput.value = 0;
}

function updateFilterValues() {
  document.getElementById('brightnessValue').textContent = elements.brightnessInput.value + '%';
  document.getElementById('contrastValue').textContent = elements.contrastInput.value + '%';
  document.getElementById('saturationValue').textContent = elements.saturationInput.value + '%';
  document.getElementById('hueValue').textContent = elements.hueInput.value + '°';
  document.getElementById('grayscaleValue').textContent = elements.grayscaleInput.value + '%';
  document.getElementById('blurValue').textContent = elements.blurInput.value + 'px';
  document.getElementById('sharpenValue').textContent = elements.sharpenInput.value;
  document.getElementById('warmthValue').textContent = elements.warmthInput.value;
  document.getElementById('highlightsValue').textContent = elements.highlightsInput.value;
  document.getElementById('shadowsValue').textContent = elements.shadowsInput.value;
  document.getElementById('fadeValue').textContent = elements.fadeInput.value + '%';
  document.getElementById('vignetteValue').textContent = elements.vignetteInput.value + '%';
  document.getElementById('grainValue').textContent = elements.grainInput.value + '%';
}

function autoEnhance() {
  if (!state.hasImage) return;

  const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  const data = imageData.data;

  let luminanceTotal = 0;
  let saturationTotal = 0;
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    luminanceTotal += (r + g + b) / 3;
    saturationTotal += max === 0 ? 0 : ((max - min) / max) * 100;
  }

  const avgLum = luminanceTotal / pixelCount;
  const avgSat = saturationTotal / pixelCount;

  const brightnessBoost = Math.round((128 - avgLum) * 0.25);
  const saturationBoost = Math.round((60 - avgSat) * 0.4);

  elements.brightnessInput.value = String(Math.max(80, Math.min(130, 100 + brightnessBoost)));
  elements.contrastInput.value = '112';
  elements.saturationInput.value = String(Math.max(90, Math.min(140, 100 + saturationBoost)));
  elements.highlightsInput.value = '8';
  elements.shadowsInput.value = '10';

  updateFilterValues();
  saveStateToHistory();
  renderCanvas();
}

function setToolMode(mode) {
  state.toolMode = mode;
  updateToolModeButtons();
}

function updateToolModeButtons() {
  elements.moveModeBtn?.classList.toggle('active-tool', state.toolMode === 'move');
  elements.brushModeBtn?.classList.toggle('active-tool', state.toolMode === 'brush');
  elements.eraserModeBtn?.classList.toggle('active-tool', state.toolMode === 'eraser');
}

function clearBrushStrokes() {
  if (!state.brushStrokes.length) return;
  state.brushStrokes = [];
  saveStateToHistory();
  renderCanvas();
}

function populateTextControlsFromSelected() {
  if (state.selectedTextIndex === null || !state.textOverlays[state.selectedTextIndex]) return;
  const textObj = state.textOverlays[state.selectedTextIndex];

  elements.textColor.value = textObj.color || '#ffffff';
  elements.textSize.value = textObj.size || 30;
  elements.fontFamily.value = textObj.fontFamily || 'Arial';
  elements.fontWeight.value = textObj.fontWeight || 'normal';
  elements.fontStyle.value = textObj.fontStyle || 'normal';
  if (elements.textStrokeColor) elements.textStrokeColor.value = textObj.strokeColor || '#000000';
  if (elements.textStrokeWidth) elements.textStrokeWidth.value = textObj.strokeWidth || 0;
  if (elements.textShadowColor) elements.textShadowColor.value = textObj.shadowColor || '#000000';
  if (elements.textShadowBlur) elements.textShadowBlur.value = textObj.shadowBlur || 0;
  if (elements.textLetterSpacing) elements.textLetterSpacing.value = textObj.letterSpacing || 0;
}

// ====================
// UI - TABS
// ====================
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      // Remove active from all
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      
      // Add active to clicked
      btn.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
}

// ====================
// UI - COLLAPSIBLE SECTIONS
// ====================
function initializeCollapsibles() {
  const collapsibles = document.querySelectorAll('.collapsible');
  
  collapsibles.forEach(title => {
    title.addEventListener('click', () => {
      const sectionId = title.dataset.section;
      const content = document.getElementById(sectionId);
      
      if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        title.classList.remove('collapsed');
      } else {
        content.classList.add('collapsed');
        title.classList.add('collapsed');
      }
    });
  });
}

// ====================
// KEYBOARD SHORTCUTS
// ====================
function handleKeyboardShortcuts(e) {
  // Don't hijack shortcuts while the user is typing/editing a field.
  const t = e.target;
  const isEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' || t.isContentEditable);
  if (isEditable) return;

  // Undo: Ctrl+Z
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  
  // Redo: Ctrl+Y or Ctrl+Shift+Z
  if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
    e.preventDefault();
    redo();
  }
  
  // Delete selected text: Delete or Backspace
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedTextIndex !== null) {
    e.preventDefault();
    deleteSelectedText();
  }
}

// ====================
// DARK MODE
// ====================
function applyDarkMode(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  try { localStorage.setItem('tools-theme', isDark ? 'dark' : 'light'); } catch (e) {}
}

new MutationObserver(() => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

function loadDarkModeSetting() {
  let isDark = false;
  try {
    const savedTheme = localStorage.getItem('tools-theme');
    if (savedTheme) {
      isDark = savedTheme === 'dark';
    } else {
      isDark = localStorage.getItem('darkMode') === 'enabled'
        || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  } catch (e) {}
  applyDarkMode(isDark);
}

// ====================
// UTILITY FUNCTIONS
// ====================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ====================
// INITIALIZE ON LOAD
// ====================
window.addEventListener('DOMContentLoaded', init);
window.addEventListener('load', loadFromLocalStorage);
