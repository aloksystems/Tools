/**
 * DragManager — handles drag-and-drop reordering of thumbnail items.
 */
class DragManager {
  constructor(container, onReorder) {
    this.container = container;
    this.onReorder = onReorder;
    this.draggedItem = null;
    this.draggedIndex = -1;

    this._onDragStart = this._onDragStart.bind(this);
    this._onDragOver = this._onDragOver.bind(this);
    this._onDragEnd = this._onDragEnd.bind(this);
    this._onDrop = this._onDrop.bind(this);
  }

  init() {
    this.container.addEventListener('dragstart', this._onDragStart);
    this.container.addEventListener('dragover', this._onDragOver);
    this.container.addEventListener('dragend', this._onDragEnd);
    this.container.addEventListener('drop', this._onDrop);
  }

  destroy() {
    this.container.removeEventListener('dragstart', this._onDragStart);
    this.container.removeEventListener('dragover', this._onDragOver);
    this.container.removeEventListener('dragend', this._onDragEnd);
    this.container.removeEventListener('drop', this._onDrop);
  }

  _onDragStart(e) {
    const item = e.target.closest('.thumb-item');
    if (!item) return;

    this.draggedItem = item;
    this.draggedIndex = parseInt(item.dataset.index, 10);

    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.id);
  }

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const item = e.target.closest('.thumb-item');
    if (!item || item === this.draggedItem) return;

    // Remove drag-over from all
    this.container.querySelectorAll('.thumb-item').forEach(el => {
      el.classList.remove('drag-over');
    });
    item.classList.add('drag-over');
  }

  _onDragEnd(e) {
    if (this.draggedItem) {
      this.draggedItem.classList.remove('dragging');
    }
    this.container.querySelectorAll('.thumb-item').forEach(el => {
      el.classList.remove('drag-over');
    });
    this.draggedItem = null;
    this.draggedIndex = -1;
  }

  _onDrop(e) {
    e.preventDefault();

    const targetItem = e.target.closest('.thumb-item');
    if (!targetItem || !this.draggedItem) return;

    const fromIndex = this.draggedIndex;
    const toIndex = parseInt(targetItem.dataset.index, 10);

    if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
      this.onReorder(fromIndex, toIndex);
    }

    this._onDragEnd(e);
  }
}

window.DragManager = DragManager;
