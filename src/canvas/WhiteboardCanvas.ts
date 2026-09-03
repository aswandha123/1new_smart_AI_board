/**
 * WhiteboardCanvas.ts
 *
 * Coordinates user input (Pointer Events, mouse wheel, pan gestures),
 * manages camera view state (ViewTransform), selection (SelectionManager),
 * clipboard operations (ClipboardManager), and delegates object state to BoardState
 * and rendering to BoardRenderer.
 */

import { DrawingTool, ShapeType } from '../tools/DrawingTool';
import { BoardState } from '../core/BoardState';
import { BoardObject } from '../models/BoardObject';
import { BoardRenderer } from './BoardRenderer';
import { ViewTransform } from './ViewTransform';
import { FreehandObject, Point } from '../models/FreehandObject';
import { ShapeObject } from '../models/ShapeObject';
import { LineObject } from '../models/LineObject';
import { ArrowObject } from '../models/ArrowObject';
import { TextObject, TextAlign } from '../models/TextObject';
import { EquationObject } from '../models/EquationObject';
import { EquationRenderer } from '../equations/EquationRenderer';
import { PageViewState } from '../models/BoardPage';
import katex from 'katex';
import { HistoryManager } from '../history/HistoryManager';
import { SelectionManager } from '../selection/SelectionManager';
import { ClipboardManager } from '../clipboard/ClipboardManager';

export class WhiteboardCanvas {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;

  public boardState: BoardState;
  public renderer: BoardRenderer;
  public history: HistoryManager;
  public viewTransform: ViewTransform;
  public selectionManager: SelectionManager;
  public clipboard: ClipboardManager;

  public currentTool: DrawingTool = 'pen';
  public currentColor: string = '#000000';
  public currentWidth: number = 3;

  // Text configuration
  public currentFontFamily: string = 'Arial';
  public currentFontSize: number = 24;
  public currentTextAlign: TextAlign = 'left';

  private pasteOffsetCount: number = 1;

  // Active in-progress freehand stroke state
  private isDrawing: boolean = false;
  private currentPoints: Point[] = [];
  private liveStroke: FreehandObject | null = null;
  private erasedAnyInCurrentStroke: boolean = false;

  // Active in-progress shape / line / arrow creation state
  private shapeStartPos: { x: number; y: number } | null = null;
  private liveShape: ShapeObject | LineObject | ArrowObject | TextObject | null = null;

  // Active temporary lasso selection path
  private isLassoing: boolean = false;
  private lassoPoints: { x: number; y: number }[] = [];

  // Active marquee selection
  private isMarqueeSelecting: boolean = false;
  private marqueeStartPos: { x: number; y: number } | null = null;
  private marqueeEndPos: { x: number; y: number } | null = null;

  // Active temporary text editor overlay
  public activeTextEditor: {
    textarea: HTMLTextAreaElement;
    boardPos: { x: number; y: number };
    existingTextId?: string;
  } | null = null;

  // Equation configuration & active temporary equation editor overlay
  public currentEquationFontSize: number = 32;
  public activeEquationEditor: {
    popup: HTMLDivElement;
    input: HTMLInputElement;
    boardPos: { x: number; y: number };
    existingEqId?: string;
  } | null = null;

  // Pan and multi-touch state
  private isPanning: boolean = false;
  private isSpacePressed: boolean = false;
  private lastPanScreenPos: { x: number; y: number } = { x: 0, y: 0 };
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private touchPinchStartDistance: number = 0;

  // Active object transformation state (Move, Resize, Rotate)
  private activeTransform: {
    handle: 'move' | 'resize-tl' | 'resize-tr' | 'resize-br' | 'resize-bl' | 'rotate';
    objectIds: string[];
    startBoardPos: { x: number; y: number };
    startObjects: Map<
      string,
      {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        fontSize?: number;
        startX?: number;
        startY?: number;
        endX?: number;
        endY?: number;
      }
    >;
  } | null = null;

  // Active PDF document page background layer
  private pdfPage: {
    canvas: HTMLCanvasElement;
    dimensions: { width: number; height: number };
    pdfDocumentId?: string;
    pageNumber?: number;
  } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Create canvas element dynamically
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('whiteboard-canvas');
    this.canvas.style.touchAction = 'none';

    // 2. Append canvas to container
    this.container.appendChild(this.canvas);

    // 3. Obtain 2D rendering context
    const context = this.canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Failed to obtain 2D rendering context from canvas.');
    }
    this.ctx = context;

    // 4. Initialize BoardState, ViewTransform, SelectionManager, ClipboardManager, and BoardRenderer
    this.boardState = new BoardState();
    this.viewTransform = new ViewTransform();
    this.selectionManager = new SelectionManager();
    this.clipboard = new ClipboardManager();
    this.renderer = new BoardRenderer(this.canvas, this.ctx, this.dpr);
    this.renderer.setOnRedraw(() => this.render());

    // 5. Initialize History Manager for BoardObject state snapshots
    this.history = new HistoryManager();
    this.history.init(this.boardState.getObjects());

    // 6. Resize canvas to container dimensions and setup high-DPI scaling
    this.resizeCanvas();

    // 7. Setup Window Resize, Wheel Zoom, Keyboard shortcuts, and Pointer Events
    this.setupResizeListener();
    this.setupWheelZoom();
    this.setupKeyboardPan();
    this.setupPointerEvents();
    this.setupDoubleClickListener();
  }

  /**
   * Sets or clears the active rendered PDF background page layer.
   */
  public setPdfPage(
    pdfPage: {
      canvas: HTMLCanvasElement;
      dimensions: { width: number; height: number };
      pdfDocumentId?: string;
      pageNumber?: number;
    } | null
  ): void {
    this.pdfPage = pdfPage;
    this.render();
  }

  public getPdfPage(): {
    canvas: HTMLCanvasElement;
    dimensions: { width: number; height: number };
    pdfDocumentId?: string;
    pageNumber?: number;
  } | null {
    return this.pdfPage;
  }

  /**
   * Adjusts camera zoom and pan offsets so the PDF page fits with margin inside the board viewport.
   */
  public fitToPdfPage(dimensions: { width: number; height: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    const padding = 40;
    const availW = Math.max(100, rect.width - padding * 2);
    const availH = Math.max(100, rect.height - padding * 2);

    const zoom = Math.min(availW / dimensions.width, availH / dimensions.height);
    const panX = (rect.width - dimensions.width * zoom) / 2;
    const panY = (rect.height - dimensions.height * zoom) / 2;

    this.viewTransform.setTransform(zoom, panX, panY);
    this.render();
  }

  /**
   * Central render dispatch that queries BoardState, ViewTransform, live stroke, selection, lasso, live shapes, and PDF layer.
   */
  public render(): void {
    const selectedIds = this.selectionManager.getSelectedIds();
    const selectedObjects = selectedIds
      .map((id) => this.boardState.getObject(id))
      .filter((obj): obj is BoardObject => obj !== undefined && obj !== null);

    this.renderer.render(
      this.boardState.getObjects(),
      this.viewTransform,
      this.liveStroke,
      selectedObjects,
      this.lassoPoints,
      this.liveShape,
      this.pdfPage
    );

    // Render Marquee Selection box
    if (this.isMarqueeSelecting && this.marqueeStartPos && this.marqueeEndPos) {
      const sx = this.marqueeStartPos.x;
      const sy = this.marqueeStartPos.y;
      const ex = this.marqueeEndPos.x;
      const ey = this.marqueeEndPos.y;

      const minX = Math.min(sx, ex);
      const minY = Math.min(sy, ey);
      const width = Math.abs(ex - sx);
      const height = Math.abs(ey - sy);

      // Convert board coordinates to screen coordinates
      const screenPos1 = this.viewTransform.boardToScreen(minX, minY);
      const screenPos2 = this.viewTransform.boardToScreen(minX + width, minY + height);

      const screenWidth = screenPos2.x - screenPos1.x;
      const screenHeight = screenPos2.y - screenPos1.y;

      this.ctx.save();
      this.ctx.strokeStyle = '#0B99FF';
      this.ctx.fillStyle = 'rgba(11, 153, 255, 0.1)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([5, 5]);
      this.ctx.fillRect(screenPos1.x, screenPos1.y, screenWidth, screenHeight);
      this.ctx.strokeRect(screenPos1.x, screenPos1.y, screenWidth, screenHeight);
      this.ctx.restore();
    }
  }

  /**
   * Generates a unique ID for newly created board objects.
   */
  public generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `obj-${crypto.randomUUID()}`;
    }
    return `obj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Copies all currently selected BoardObjects into the in-memory clipboard.
   */
  public copySelected(): boolean {
    const selectedIds = this.selectionManager.getSelectedIds();
    if (selectedIds.length === 0) return false;

    const selectedObjs = selectedIds
      .map((id) => this.boardState.getObject(id))
      .filter((obj): obj is BoardObject => obj !== undefined && obj !== null);

    if (selectedObjs.length === 0) return false;

    this.clipboard.copy(selectedObjs);
    this.pasteOffsetCount = 1;
    console.log(`[WhiteboardCanvas] Copied ${selectedObjs.length} object(s).`);
    return true;
  }

  /**
   * Pastes copied objects from clipboard with unique IDs and progressive board offsets.
   */
  public paste(): boolean {
    const copiedList = this.clipboard.getObjects();
    if (copiedList.length === 0) return false;

    const offset = 20 * this.pasteOffsetCount;
    const pastedIds: string[] = [];

    for (const copied of copiedList) {
      const newId = this.generateId();
      copied.id = newId;
      copied.x += offset;
      copied.y += offset;
      if (copied.type === 'line' || copied.type === 'arrow') {
        const lineOrArrow = copied as LineObject | ArrowObject;
        lineOrArrow.startX += offset;
        lineOrArrow.startY += offset;
        lineOrArrow.endX += offset;
        lineOrArrow.endY += offset;
      }
      copied.createdAt = Date.now();
      copied.updatedAt = Date.now();
      copied.locked = false;

      this.boardState.addObject(copied);
      pastedIds.push(newId);
    }

    this.selectionManager.setSelectedIds(pastedIds);
    this.history.recordAction(this.boardState.getObjects());
    this.pasteOffsetCount++;
    this.render();
    console.log(`[WhiteboardCanvas] Pasted ${copiedList.length} object(s).`);
    return true;
  }

  /**
   * Deletes all currently selected unlocked objects from BoardState.
   */
  public deleteSelected(): boolean {
    const selectedIds = this.selectionManager.getSelectedIds();
    if (selectedIds.length === 0) return false;

    const unlockedToDelete = selectedIds.filter((id) => {
      const obj = this.boardState.getObject(id);
      return obj && !obj.locked;
    });

    if (unlockedToDelete.length === 0) {
      console.log('[WhiteboardCanvas] Cannot delete: selected objects are locked or not found.');
      return false;
    }

    for (const id of unlockedToDelete) {
      this.boardState.removeObject(id);
    }

    this.selectionManager.clearSelection();
    this.history.recordAction(this.boardState.getObjects());
    this.render();
    console.log(`[WhiteboardCanvas] Deleted ${unlockedToDelete.length} object(s).`);
    return true;
  }

  /**
   * Switches the active drawing tool and adjusts default parameters if appropriate.
   */
  public setTool(tool: DrawingTool): void {
    if (this.activeTextEditor && tool !== 'text') {
      this.commitTextEditor();
    }
    if (this.activeEquationEditor && tool !== 'equation') {
      this.commitEquationEditor();
    }

    this.currentTool = tool;

    if (tool === 'select' || tool === 'lasso') {
      this.canvas.style.cursor = 'default';
    } else if (tool === 'text') {
      this.canvas.style.cursor = 'text';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }

    if (tool === 'highlighter') {
      if (this.currentColor === '#000000') {
        this.currentColor = '#ffff00';
      }
      if (this.currentWidth < 10) {
        this.currentWidth = 18;
      }
    } else if (tool === 'eraser') {
      if (this.currentWidth < 10) {
        this.currentWidth = 25;
      }
    } else if (tool === 'pencil') {
      if (this.currentColor === '#ffff00') {
        this.currentColor = '#333333';
      }
      if (this.currentWidth > 10) {
        this.currentWidth = 2;
      }
    } else if (
      tool === 'pen' ||
      tool === 'rectangle' ||
      tool === 'ellipse' ||
      tool === 'triangle' ||
      tool === 'line' ||
      tool === 'arrow' ||
      tool === 'text' ||
      tool === 'equation'
    ) {
      if (this.currentColor === '#ffff00') {
        this.currentColor = '#000000';
      }
      if (this.currentWidth > 20) {
        this.currentWidth = 3;
      }
    }

    this.render();
    console.log(`[WhiteboardCanvas] Tool switched to: ${tool}`);
  }

  public setColor(color: string): void {
    this.currentColor = color;
    console.log(`[WhiteboardCanvas] Color set to: ${color}`);
  }

  public setWidth(width: number): void {
    this.currentWidth = Math.max(1, width);
    console.log(`[WhiteboardCanvas] Width set to: ${width}px`);
  }

  public setFontFamily(family: string): void {
    this.currentFontFamily = family;
    console.log(`[WhiteboardCanvas] Font family set to: ${family}`);
  }

  public setFontSize(size: number): void {
    this.currentFontSize = Math.max(12, Math.min(96, size));
    console.log(`[WhiteboardCanvas] Font size set to: ${this.currentFontSize}px`);
  }

  public setEquationFontSize(size: number): void {
    this.currentEquationFontSize = Math.max(16, Math.min(96, size));
    console.log(`[WhiteboardCanvas] Equation font size set to: ${this.currentEquationFontSize}px`);
  }

  public setTextAlign(align: TextAlign): void {
    this.currentTextAlign = align;
    console.log(`[WhiteboardCanvas] Text align set to: ${align}`);
  }

  public getColor(): string {
    return this.currentColor;
  }

  public getWidth(): number {
    return this.currentWidth;
  }

  public getFontFamily(): string {
    return this.currentFontFamily;
  }

  public getFontSize(): number {
    return this.currentFontSize;
  }

  public getTextAlign(): TextAlign {
    return this.currentTextAlign;
  }

  public getTool(): DrawingTool {
    return this.currentTool;
  }

  /**
   * Measures text width and height in board space.
   */
  public measureTextDimensions(
    text: string,
    fontSize: number,
    fontFamily: string
  ): { width: number; height: number } {
    this.ctx.save();
    this.ctx.font = `${fontSize}px ${fontFamily || 'Arial'}`;
    const lines = text.split('\n');
    let maxLineWidth = 0;
    for (const line of lines) {
      const metrics = this.ctx.measureText(line || ' ');
      if (metrics.width > maxLineWidth) {
        maxLineWidth = metrics.width;
      }
    }
    this.ctx.restore();

    const lineHeight = fontSize * 1.25;
    const height = Math.max(lineHeight, lines.length * lineHeight);
    const width = Math.max(30, maxLineWidth + 12);
    return { width, height };
  }

  /**
   * Opens the temporary textarea editor for creating or editing text in board coordinates.
   */
  public openTextEditor(
    boardPos: { x: number; y: number },
    existingTextObj?: TextObject
  ): void {
    // 1. Commit any currently active editor
    if (this.activeTextEditor) {
      this.commitTextEditor();
    }

    const screenPos = this.viewTransform.boardToScreen(boardPos.x, boardPos.y);
    const zoom = this.viewTransform.zoom;

    const textarea = document.createElement('textarea');
    textarea.classList.add('whiteboard-text-editor');

    const initialText = existingTextObj ? existingTextObj.text : '';
    const fontSize = existingTextObj ? existingTextObj.fontSize : this.currentFontSize;
    const fontFamily = existingTextObj ? existingTextObj.fontFamily : this.currentFontFamily;
    const color = existingTextObj ? existingTextObj.color : this.currentColor;
    const textAlign = existingTextObj ? existingTextObj.textAlign : this.currentTextAlign;

    textarea.value = initialText;
    textarea.placeholder = 'Type text... (Ctrl+Enter to save)';
    textarea.style.position = 'absolute';
    textarea.style.left = `${screenPos.x}px`;
    textarea.style.top = `${screenPos.y}px`;
    textarea.style.fontSize = `${Math.max(12, Math.round(fontSize * zoom))}px`;
    textarea.style.fontFamily = fontFamily;
    textarea.style.color = color;
    textarea.style.textAlign = textAlign;
    textarea.style.lineHeight = '1.25';
    textarea.style.zIndex = '100';

    this.container.appendChild(textarea);

    this.activeTextEditor = {
      textarea,
      boardPos,
      existingTextId: existingTextObj ? existingTextObj.id : undefined,
    };

    // Auto-focus and select
    setTimeout(() => {
      textarea.focus();
      if (initialText) {
        textarea.setSelectionRange(initialText.length, initialText.length);
      }
    }, 10);

    // Stop event propagation to keep canvas from hijacking keys/drag
    textarea.addEventListener('pointerdown', (e) => e.stopPropagation());
    textarea.addEventListener('mousedown', (e) => e.stopPropagation());
    textarea.addEventListener('click', (e) => e.stopPropagation());

    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();

      // Ctrl + Enter (or Cmd + Enter) commits text
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.commitTextEditor();
        return;
      }

      // Escape cancels text creation/edit
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelTextEditor();
        return;
      }
    });

    textarea.addEventListener('blur', () => {
      // Small timeout to allow potential button clicks
      setTimeout(() => {
        if (this.activeTextEditor && this.activeTextEditor.textarea === textarea) {
          this.commitTextEditor();
        }
      }, 100);
    });
  }

  /**
   * Commits the active text editor content to BoardState as a TextObject.
   */
  public commitTextEditor(): void {
    if (!this.activeTextEditor) return;

    const { textarea, boardPos, existingTextId } = this.activeTextEditor;
    const textContent = textarea.value.trim();

    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
    this.activeTextEditor = null;

    if (!textContent) {
      if (existingTextId) {
        // If existing text was cleared, remove it
        this.boardState.removeObject(existingTextId);
        this.selectionManager.removeFromSelection(existingTextId);
        this.history.recordAction(this.boardState.getObjects());
      }
      this.render();
      return;
    }

    if (existingTextId) {
      // Update existing object
      const existingObj = this.boardState.getObject(existingTextId) as TextObject | undefined;
      if (existingObj && existingObj.type === 'text') {
        const metrics = this.measureTextDimensions(
          textContent,
          existingObj.fontSize,
          existingObj.fontFamily
        );
        existingObj.text = textContent;
        existingObj.width = metrics.width;
        existingObj.height = metrics.height;
        existingObj.updatedAt = Date.now();

        this.selectionManager.select(existingObj.id);
        this.history.recordAction(this.boardState.getObjects());
        this.render();
        console.log(`[WhiteboardCanvas] Updated TextObject ${existingTextId}.`);
        return;
      }
    }

    // Create new TextObject
    const metrics = this.measureTextDimensions(
      textContent,
      this.currentFontSize,
      this.currentFontFamily
    );

    const newTextObj: TextObject = {
      id: this.generateId(),
      type: 'text',
      x: boardPos.x,
      y: boardPos.y,
      width: metrics.width,
      height: metrics.height,
      rotation: 0,
      visible: true,
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      text: textContent,
      fontFamily: this.currentFontFamily,
      fontSize: this.currentFontSize,
      color: this.currentColor,
      opacity: 1,
      textAlign: this.currentTextAlign,
    };

    this.boardState.addObject(newTextObj);
    this.selectionManager.select(newTextObj.id);
    this.history.recordAction(this.boardState.getObjects());
    this.render();
    console.log(`[WhiteboardCanvas] Created TextObject ${newTextObj.id}.`);
  }

  /**
   * Cancels the active text editor without creating or modifying a TextObject.
   */
  public cancelTextEditor(): void {
    if (!this.activeTextEditor) return;

    const { textarea } = this.activeTextEditor;
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
    this.activeTextEditor = null;
    this.render();
    console.log('[WhiteboardCanvas] Cancelled text editing.');
  }

  /**
   * Opens the temporary equation editor popup for creating or editing mathematical expressions in board space.
   */
  public openEquationEditor(
    boardPos: { x: number; y: number },
    existingEqObj?: EquationObject
  ): void {
    if (this.activeEquationEditor) {
      this.commitEquationEditor();
    }
    if (this.activeTextEditor) {
      this.commitTextEditor();
    }

    const screenPos = this.viewTransform.boardToScreen(boardPos.x, boardPos.y);

    const popup = document.createElement('div');
    popup.className = 'whiteboard-equation-editor-popup';

    const initialLatex = existingEqObj ? existingEqObj.latex : '';
    const color = existingEqObj ? existingEqObj.color : this.currentColor;

    popup.innerHTML = `
      <div class="eq-popup-header">
        <div class="eq-popup-header-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="4"></line>
            <line x1="6" y1="4" x2="18" y2="20"></line>
          </svg>
          <span>${existingEqObj ? 'Edit Equation' : 'Insert Equation'}</span>
        </div>
        <button class="eq-popup-close-btn" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="eq-popup-body">
        <div class="eq-preview-container">
          <div class="eq-preview-label">Live Preview:</div>
          <div class="eq-preview-math" id="eq-live-preview"></div>
        </div>
        <div class="eq-input-wrapper">
          <label class="eq-input-label">LaTeX Expression:</label>
          <input type="text" class="eq-latex-input" placeholder="e.g. x^2 + 5x + 6 = 0 or \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" value="${initialLatex.replace(/"/g, '&quot;')}" />
        </div>
        <div class="eq-popup-actions">
          <button class="btn-eq-cancel" type="button">Cancel</button>
          <button class="btn-eq-insert" type="button">${existingEqObj ? 'Update' : 'Insert'}</button>
        </div>
      </div>
    `;

    const containerRect = this.container.getBoundingClientRect();
    const popupLeft = Math.max(16, Math.min(containerRect.width - 340, screenPos.x));
    const popupTop = Math.max(16, Math.min(containerRect.height - 250, screenPos.y));

    popup.style.position = 'absolute';
    popup.style.left = `${popupLeft}px`;
    popup.style.top = `${popupTop}px`;
    popup.style.zIndex = '120';

    this.container.appendChild(popup);

    const input = popup.querySelector<HTMLInputElement>('.eq-latex-input')!;
    const previewEl = popup.querySelector<HTMLDivElement>('#eq-live-preview')!;
    previewEl.style.color = color;
    const closeBtn = popup.querySelector<HTMLButtonElement>('.eq-popup-close-btn')!;
    const cancelBtn = popup.querySelector<HTMLButtonElement>('.btn-eq-cancel')!;
    const insertBtn = popup.querySelector<HTMLButtonElement>('.btn-eq-insert')!;

    const updatePreview = () => {
      const latex = input.value.trim();
      if (!latex) {
        previewEl.innerHTML = '<span class="eq-preview-placeholder">Enter LaTeX to preview...</span>';
        return;
      }
      try {
        previewEl.innerHTML = katex.renderToString(latex, {
          displayMode: true,
          throwOnError: false,
        });
      } catch {
        previewEl.innerHTML = '<span class="eq-preview-error">Unable to render equation</span>';
      }
    };

    updatePreview();

    this.activeEquationEditor = {
      popup,
      input,
      boardPos,
      existingEqId: existingEqObj ? existingEqObj.id : undefined,
    };

    setTimeout(() => {
      input.focus();
      if (initialLatex) {
        input.setSelectionRange(initialLatex.length, initialLatex.length);
      }
    }, 20);

    input.addEventListener('input', () => updatePreview());

    popup.addEventListener('pointerdown', (e) => e.stopPropagation());
    popup.addEventListener('mousedown', (e) => e.stopPropagation());
    popup.addEventListener('click', (e) => e.stopPropagation());
    popup.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitEquationEditor();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelEquationEditor();
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelEquationEditor();
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelEquationEditor();
    });

    insertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.commitEquationEditor();
    });
  }

  /**
   * Commits the active equation editor content to BoardState as an EquationObject.
   */
  public commitEquationEditor(): void {
    if (!this.activeEquationEditor) return;

    const { popup, input, boardPos, existingEqId } = this.activeEquationEditor;
    const latex = input.value.trim();

    if (popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }
    this.activeEquationEditor = null;

    if (!latex) {
      if (existingEqId) {
        this.boardState.removeObject(existingEqId);
        this.selectionManager.removeFromSelection(existingEqId);
        this.history.recordAction(this.boardState.getObjects());
      }
      this.render();
      return;
    }

    const fontSize = this.currentEquationFontSize;
    const measured = EquationRenderer.measureEquation(latex, fontSize);

    if (existingEqId) {
      const existingObj = this.boardState.getObject(existingEqId) as EquationObject | undefined;
      if (existingObj && existingObj.type === 'equation') {
        existingObj.latex = latex;
        existingObj.width = measured.width;
        existingObj.height = measured.height;
        existingObj.updatedAt = Date.now();

        this.selectionManager.select(existingObj.id);
        this.history.recordAction(this.boardState.getObjects());
        this.render();
        console.log(`[WhiteboardCanvas] Updated EquationObject ${existingEqId}.`);
        return;
      }
    }

    // Create new EquationObject
    const newEqObj: EquationObject = {
      id: this.generateId(),
      type: 'equation',
      x: boardPos.x,
      y: boardPos.y,
      width: measured.width,
      height: measured.height,
      rotation: 0,
      visible: true,
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      latex,
      fontSize,
      color: this.currentColor,
      opacity: 1,
    };

    this.boardState.addObject(newEqObj);
    this.selectionManager.select(newEqObj.id);
    this.history.recordAction(this.boardState.getObjects());
    this.render();
    console.log(`[WhiteboardCanvas] Created EquationObject ${newEqObj.id}.`);
  }

  /**
   * Cancels the active equation editor without creating or modifying an EquationObject.
   */
  public cancelEquationEditor(): void {
    if (!this.activeEquationEditor) return;

    const { popup } = this.activeEquationEditor;
    if (popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }
    this.activeEquationEditor = null;
    this.render();
    console.log('[WhiteboardCanvas] Cancelled equation editing.');
  }

  /**
   * Zooms in toward the center of the canvas viewport.
   */
  public zoomIn(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.viewTransform.zoomIn(rect.width / 2, rect.height / 2);
    this.render();
  }

  /**
   * Zooms out toward the center of the canvas viewport.
   */
  public zoomOut(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.viewTransform.zoomOut(rect.width / 2, rect.height / 2);
    this.render();
  }

  /**
   * Resets zoom to 100% and pan offsets to (0, 0).
   */
  public resetView(): void {
    this.viewTransform.reset();
    this.render();
  }

  /**
   * Resizes the canvas backing buffer matching container size and devicePixelRatio.
   */
  private resizeCanvas(): void {
    const rect = this.container.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);

    this.renderer.setDpr(this.dpr);
    this.render();
  }

  /**
   * Converts client viewport coordinates into canvas screen coordinates (CSS pixels).
   */
  public getPointerPosition(event: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  /**
   * Registers mouse wheel listener for cursor-centered zooming.
   */
  private setupWheelZoom(): void {
    this.canvas.addEventListener(
      'wheel',
      (event: WheelEvent) => {
        event.preventDefault();

        const screenPos = this.getPointerPosition(event);
        const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;

        this.viewTransform.zoomAt(screenPos.x, screenPos.y, zoomFactor);
        this.render();
      },
      { passive: false }
    );
  }

  /**
   * Registers Space key listener for pan mode navigation.
   */
  private setupKeyboardPan(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !e.repeat &&
        (e.target === document.body || (e.target as HTMLElement).tagName !== 'INPUT')
      ) {
        this.isSpacePressed = true;
        if (!this.isDrawing && !this.isPanning && !this.isLassoing && !this.shapeStartPos && !this.activeTextEditor) {
          this.canvas.style.cursor = 'grab';
        }
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        if (!this.isPanning) {
          this.canvas.style.cursor =
            this.currentTool === 'select' || this.currentTool === 'lasso'
              ? 'default'
              : this.currentTool === 'text'
              ? 'text'
              : 'crosshair';
        }
      }
    });

    window.addEventListener('blur', () => {
      this.isSpacePressed = false;
      if (!this.isPanning) {
        this.canvas.style.cursor =
          this.currentTool === 'select' || this.currentTool === 'lasso'
            ? 'default'
            : this.currentTool === 'text'
            ? 'text'
            : 'crosshair';
      }
    });
  }

  /**
   * Registers double-click listener to edit existing TextObject.
   */
  private setupDoubleClickListener(): void {
    this.canvas.addEventListener('dblclick', (event: MouseEvent) => {
      const screenPos = this.getPointerPosition(event);
      const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);
      const hitObject = this.hitTest(boardPos);

      if (hitObject) {
        if (hitObject.type === 'text') {
          const textObj = hitObject as TextObject;
          this.openTextEditor({ x: textObj.x, y: textObj.y }, textObj);
        } else if (hitObject.type === 'equation') {
          const eqObj = hitObject as EquationObject;
          this.openEquationEditor({ x: eqObj.x, y: eqObj.y }, eqObj);
        }
      }
    });
  }

  /**
   * Registers unified Pointer Event listeners.
   */
  private setupPointerEvents(): void {
    // 1. pointerdown - Input begins
    this.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      // Check for Pan Initiation: Middle mouse button OR Space + Left click
      const isMiddleClick = event.button === 1;
      const isSpaceLeftClick = event.button === 0 && this.isSpacePressed;

      if (isMiddleClick || isSpaceLeftClick) {
        this.isPanning = true;
        this.lastPanScreenPos = { x: event.clientX, y: event.clientY };
        this.canvas.style.cursor = 'grabbing';
        try {
          this.canvas.setPointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
        return;
      }

      // Check for Multi-touch (2 fingers) gesture
      if (this.activePointers.size >= 2) {
        if (this.isDrawing) {
          this.isDrawing = false;
          this.liveStroke = null;
          this.currentPoints = [];
          this.render();
        }
        if (this.isLassoing) {
          this.isLassoing = false;
          this.lassoPoints = [];
          this.render();
        }
        if (this.shapeStartPos) {
          this.shapeStartPos = null;
          this.liveShape = null;
          this.render();
        }
        if (this.activeTransform) {
          this.cancelTransformation(event);
        }

        const pointers = Array.from(this.activePointers.values());
        const p1 = pointers[0];
        const p2 = pointers[1];
        this.touchPinchStartDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        this.lastPanScreenPos = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
        };
        return;
      }

      // Only process primary button (left-click / touch / stylus tip)
      if (event.button !== 0 && event.pointerType === 'mouse') return;

      const screenPos = this.getPointerPosition(event);
      const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);

      // Handle Text Tool Interaction
      if (this.currentTool === 'text') {
        if (this.activeTextEditor) {
          this.commitTextEditor();
        }
        if (this.activeEquationEditor) {
          this.commitEquationEditor();
        }
        this.openTextEditor(boardPos);
        return;
      }

      // Handle Equation Tool Interaction
      if (this.currentTool === 'equation') {
        if (this.activeTextEditor) {
          this.commitTextEditor();
        }
        if (this.activeEquationEditor) {
          this.commitEquationEditor();
        }
        this.openEquationEditor(boardPos);
        return;
      }

      // Handle Shape / Line / Arrow Tools Creation Initiation
      if (
        this.currentTool === 'rectangle' ||
        this.currentTool === 'ellipse' ||
        this.currentTool === 'triangle' ||
        this.currentTool === 'line' ||
        this.currentTool === 'arrow'
      ) {
        try {
          this.canvas.setPointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
        this.shapeStartPos = boardPos;
        this.createShapePreview(boardPos, boardPos);
        this.render();
        return;
      }

      // Handle Lasso Tool Interaction
      if (this.currentTool === 'lasso') {
        try {
          this.canvas.setPointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
        this.isLassoing = true;
        this.lassoPoints = [boardPos];
        this.render();
        return;
      }

      // Handle Select Tool Interaction
      if (this.currentTool === 'select') {
        const isCtrlCmd = event.ctrlKey || event.metaKey;
        const selectedIds = this.selectionManager.getSelectedIds();
        const selectedObjects = selectedIds
          .map((id) => this.boardState.getObject(id))
          .filter((obj): obj is BoardObject => obj !== undefined && obj !== null);

        // Ctrl/Cmd + click: Toggle clicked object selection
        if (isCtrlCmd) {
          const hitObject = this.hitTest(boardPos);
          if (hitObject) {
            this.selectionManager.toggleSelection(hitObject.id);
            this.render();
          }
          return;
        }

        // Check if user clicked on selection controls/body of current selection
        if (selectedObjects.length > 0) {
          const handle = this.getSelectionHandleAt(boardPos, selectedObjects);
          if (handle) {
            const startObjects = new Map<
              string,
              {
                x: number;
                y: number;
                width: number;
                height: number;
                rotation: number;
                fontSize?: number;
                startX?: number;
                startY?: number;
                endX?: number;
                endY?: number;
              }
            >();
            for (const obj of selectedObjects) {
              const lineOrArrow =
                obj.type === 'line' || obj.type === 'arrow'
                  ? (obj as LineObject | ArrowObject)
                  : undefined;
              const textObj = obj.type === 'text' ? (obj as TextObject) : undefined;
              startObjects.set(obj.id, {
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height,
                rotation: obj.rotation || 0,
                fontSize: textObj?.fontSize,
                startX: lineOrArrow?.startX,
                startY: lineOrArrow?.startY,
                endX: lineOrArrow?.endX,
                endY: lineOrArrow?.endY,
              });
            }

            this.activeTransform = {
              handle,
              objectIds: selectedObjects.map((o) => o.id),
              startBoardPos: boardPos,
              startObjects,
            };

            try {
              this.canvas.setPointerCapture(event.pointerId);
            } catch {
              // Ignore
            }
            return;
          }
        }

        // Test if user clicked on any object on the board
        const hitObject = this.hitTest(boardPos);
        if (hitObject) {
          if (this.selectionManager.isSelected(hitObject.id)) {
            // Already selected as part of group -> start move transform
            const startObjects = new Map<
              string,
              {
                x: number;
                y: number;
                width: number;
                height: number;
                rotation: number;
                fontSize?: number;
                startX?: number;
                startY?: number;
                endX?: number;
                endY?: number;
              }
            >();
            for (const obj of selectedObjects) {
              const lineOrArrow =
                obj.type === 'line' || obj.type === 'arrow'
                  ? (obj as LineObject | ArrowObject)
                  : undefined;
              const textObj = obj.type === 'text' ? (obj as TextObject) : undefined;
              startObjects.set(obj.id, {
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height,
                rotation: obj.rotation || 0,
                fontSize: textObj?.fontSize,
                startX: lineOrArrow?.startX,
                startY: lineOrArrow?.startY,
                endX: lineOrArrow?.endX,
                endY: lineOrArrow?.endY,
              });
            }

            this.activeTransform = {
              handle: 'move',
              objectIds: selectedObjects.map((o) => o.id),
              startBoardPos: boardPos,
              startObjects,
            };

            try {
              this.canvas.setPointerCapture(event.pointerId);
            } catch {
              // Ignore
            }
          } else {
            // Single select new object
            this.selectionManager.select(hitObject.id);
            if (!hitObject.locked) {
              const lineOrArrow =
                hitObject.type === 'line' || hitObject.type === 'arrow'
                  ? (hitObject as LineObject | ArrowObject)
                  : undefined;
              const textObj = hitObject.type === 'text' ? (hitObject as TextObject) : undefined;
              const startObjects = new Map<
                string,
                {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                  rotation: number;
                  fontSize?: number;
                  startX?: number;
                  startY?: number;
                  endX?: number;
                  endY?: number;
                }
              >();
              startObjects.set(hitObject.id, {
                x: hitObject.x,
                y: hitObject.y,
                width: hitObject.width,
                height: hitObject.height,
                rotation: hitObject.rotation || 0,
                fontSize: textObj?.fontSize,
                startX: lineOrArrow?.startX,
                startY: lineOrArrow?.startY,
                endX: lineOrArrow?.endX,
                endY: lineOrArrow?.endY,
              });

              this.activeTransform = {
                handle: 'move',
                objectIds: [hitObject.id],
                startBoardPos: boardPos,
                startObjects,
              };

              try {
                this.canvas.setPointerCapture(event.pointerId);
              } catch {
                // Ignore
              }
            }
          }
        } else {
          this.selectionManager.clearSelection();
          this.isMarqueeSelecting = true;
          this.marqueeStartPos = boardPos;
          this.marqueeEndPos = boardPos;
          try {
            this.canvas.setPointerCapture(event.pointerId);
          } catch {
            // Ignore
          }
        }
        this.render();
        return;
      }

      // Drawing tools interaction (pen, pencil, highlighter, eraser)
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // Ignore fallback
      }

      this.isDrawing = true;
      const point: Point = {
        x: boardPos.x,
        y: boardPos.y,
        pressure: event.pressure > 0 ? event.pressure : undefined,
      };

      if (this.currentTool === 'eraser') {
        this.erasedAnyInCurrentStroke = false;
        this.eraseAtPoint(boardPos);
      } else {
        this.currentPoints = [point];

        let opacity = 1;
        if (this.currentTool === 'pencil') opacity = 0.8;
        if (this.currentTool === 'highlighter') opacity = 0.35;

        this.liveStroke = {
          id: this.generateId(),
          type: 'freehand',
          x: boardPos.x,
          y: boardPos.y,
          width: 1,
          height: 1,
          rotation: 0,
          visible: true,
          locked: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          points: this.currentPoints,
          tool: this.currentTool as 'pen' | 'pencil' | 'highlighter',
          color: this.currentColor,
          strokeWidth: this.currentWidth,
          opacity,
        };

        this.render();
      }
    });

    // 2. pointermove - Input continues
    this.canvas.addEventListener('pointermove', (event: PointerEvent) => {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      // Handle Mouse / Keyboard Panning
      if (this.isPanning) {
        const dx = event.clientX - this.lastPanScreenPos.x;
        const dy = event.clientY - this.lastPanScreenPos.y;
        this.viewTransform.panBy(dx, dy);
        this.lastPanScreenPos = { x: event.clientX, y: event.clientY };
        this.render();
        return;
      }

      // Handle Two-Finger Pinch-Zoom & Pan Gesture
      if (this.activePointers.size >= 2) {
        const pointers = Array.from(this.activePointers.values());
        const p1 = pointers[0];
        const p2 = pointers[1];
        const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

        const currentMidX = (p1.x + p2.x) / 2;
        const currentMidY = (p1.y + p2.y) / 2;

        const panDx = currentMidX - this.lastPanScreenPos.x;
        const panDy = currentMidY - this.lastPanScreenPos.y;
        if (panDx !== 0 || panDy !== 0) {
          this.viewTransform.panBy(panDx, panDy);
        }
        this.lastPanScreenPos = { x: currentMidX, y: currentMidY };

        if (this.touchPinchStartDistance > 0 && currentDistance > 0) {
          const pinchFactor = currentDistance / this.touchPinchStartDistance;
          const rect = this.canvas.getBoundingClientRect();
          const centerScreenX = currentMidX - rect.left;
          const centerScreenY = currentMidY - rect.top;
          this.viewTransform.zoomAt(centerScreenX, centerScreenY, pinchFactor);
          this.touchPinchStartDistance = currentDistance;
        }

        this.render();
        return;
      }

      // Handle Shape / Line / Arrow Preview Updating
      if (this.shapeStartPos) {
        const screenPos = this.getPointerPosition(event);
        const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);
        this.createShapePreview(this.shapeStartPos, boardPos);
        this.render();
        return;
      }

      // Handle Active Lasso Path Drawing
      if (this.isLassoing) {
        const screenPos = this.getPointerPosition(event);
        const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);
        this.lassoPoints.push(boardPos);
        this.render();
        return;
      }

      if (this.isMarqueeSelecting && this.marqueeStartPos) {
        const screenPos = this.getPointerPosition(event);
        const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);
        this.marqueeEndPos = boardPos;
        this.render();
        return;
      }

      // Handle Active Transformation (Move, Resize, Rotate)
      if (this.activeTransform) {
        const screenPos = this.getPointerPosition(event);
        const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);
        this.applyTransformation(this.activeTransform, boardPos);
        this.render();
        return;
      }

      // Hover cursor update for Select tool
      if (this.currentTool === 'select' && !this.isDrawing) {
        this.updateCursor(event);
        return;
      }

      if (!this.isDrawing) return;

      const screenPos = this.getPointerPosition(event);
      const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);

      if (this.currentTool === 'eraser') {
        this.eraseAtPoint(boardPos);
      } else if (this.liveStroke) {
        const point: Point = {
          x: boardPos.x,
          y: boardPos.y,
          pressure: event.pressure > 0 ? event.pressure : undefined,
        };
        this.currentPoints.push(point);
        this.liveStroke.points = this.currentPoints;
        this.render();
      }
    });

    // 3. pointerup - Input ends
    this.canvas.addEventListener('pointerup', (event: PointerEvent) => {
      this.activePointers.delete(event.pointerId);

      // Handle Shape / Line / Arrow Completion
      if (this.shapeStartPos && this.liveShape) {
        try {
          if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Ignore
        }

        // Commit permanent BoardObject to BoardState
        this.liveShape.id = this.generateId();
        this.liveShape.createdAt = Date.now();
        this.liveShape.updatedAt = Date.now();

        this.boardState.addObject(this.liveShape);
        this.history.recordAction(this.boardState.getObjects());

        this.liveShape = null;
        this.shapeStartPos = null;
        this.render();
        return;
      }

      // Handle Lasso Completion
      if (this.isLassoing) {
        try {
          if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Ignore
        }

        if (this.lassoPoints.length >= 3) {
          const selected = this.findObjectsInLasso(this.lassoPoints);
          if (selected.length > 0) {
            this.selectionManager.setSelectedIds(selected);
          } else {
            this.selectionManager.clearSelection();
          }
        } else {
          this.selectionManager.clearSelection();
        }

        this.isLassoing = false;
        this.lassoPoints = [];
        this.render();
        return;
      }

      if (this.isMarqueeSelecting && this.marqueeStartPos && this.marqueeEndPos) {
        try {
          if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Ignore
        }

        const minX = Math.min(this.marqueeStartPos.x, this.marqueeEndPos.x);
        const maxX = Math.max(this.marqueeStartPos.x, this.marqueeEndPos.x);
        const minY = Math.min(this.marqueeStartPos.y, this.marqueeEndPos.y);
        const maxY = Math.max(this.marqueeStartPos.y, this.marqueeEndPos.y);

        const objects = this.boardState.getObjects();
        const selectedIds = [];

        for (const obj of objects) {
          if (!obj.visible || obj.locked) continue;
          
          let objMinX = obj.x;
          let objMaxX = obj.x + obj.width;
          let objMinY = obj.y;
          let objMaxY = obj.y + obj.height;
          
          // For line and arrow, use start/end points
          if (obj.type === 'line' || obj.type === 'arrow') {
            const line = obj as LineObject | ArrowObject;
            objMinX = Math.min(line.startX, line.endX);
            objMaxX = Math.max(line.startX, line.endX);
            objMinY = Math.min(line.startY, line.endY);
            objMaxY = Math.max(line.startY, line.endY);
          }

          if (
            minX <= objMaxX &&
            maxX >= objMinX &&
            minY <= objMaxY &&
            maxY >= objMinY
          ) {
            selectedIds.push(obj.id);
          }
        }

        if (selectedIds.length > 0) {
          this.selectionManager.setSelectedIds(selectedIds);
        }
        
        this.isMarqueeSelecting = false;
        this.marqueeStartPos = null;
        this.marqueeEndPos = null;
        this.render();
        return;
      }

      // Handle Transformation Completion
      if (this.activeTransform) {
        let changed = false;
        for (const [id, start] of this.activeTransform.startObjects.entries()) {
          const obj = this.boardState.getObject(id);
          if (
            obj &&
            (obj.x !== start.x ||
              obj.y !== start.y ||
              obj.width !== start.width ||
              obj.height !== start.height ||
              obj.rotation !== start.rotation)
          ) {
            changed = true;
            break;
          }
        }

        try {
          if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Ignore
        }

        if (changed) {
          this.history.recordAction(this.boardState.getObjects());
        }

        this.activeTransform = null;
        this.updateCursor(event);
        return;
      }

      this.stopInput(event);
    });

    // 4. pointercancel - Input cancelled
    this.canvas.addEventListener('pointercancel', (event: PointerEvent) => {
      this.activePointers.delete(event.pointerId);

      if (this.shapeStartPos) {
        try {
          if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Ignore
        }
        this.shapeStartPos = null;
        this.liveShape = null;
        this.render();
        return;
      }

      if (this.isLassoing) {
        try {
          if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Ignore
        }
        this.lassoPoints = [];
        this.isLassoing = false;
        this.render();
        return;
      }

      if (this.activeTransform) {
        this.cancelTransformation(event);
        return;
      }

      this.stopInput(event);
    });

    // 5. pointerleave - Pointer leaves canvas boundary
    this.canvas.addEventListener('pointerleave', (event: PointerEvent) => {
      if (!this.canvas.hasPointerCapture(event.pointerId)) {
        this.activePointers.delete(event.pointerId);
        if (this.isDrawing || this.isPanning || this.isLassoing || this.shapeStartPos) {
          this.stopInput(event);
        }
      }
    });
  }

  /**
   * Constructs live temporary preview for shapes, lines, or arrows based on current drag coordinates.
   */
  private createShapePreview(
    startPos: { x: number; y: number },
    currentPos: { x: number; y: number }
  ): void {
    const minX = Math.min(startPos.x, currentPos.x);
    const minY = Math.min(startPos.y, currentPos.y);
    const width = Math.max(1, Math.abs(currentPos.x - startPos.x));
    const height = Math.max(1, Math.abs(currentPos.y - startPos.y));

    if (
      this.currentTool === 'rectangle' ||
      this.currentTool === 'ellipse' ||
      this.currentTool === 'triangle'
    ) {
      this.liveShape = {
        id: 'preview',
        type: 'shape',
        shapeType: this.currentTool as ShapeType,
        x: minX,
        y: minY,
        width,
        height,
        rotation: 0,
        visible: true,
        locked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: this.currentColor,
        strokeWidth: this.currentWidth,
        opacity: 1,
        fill: false,
      };
    } else if (this.currentTool === 'line') {
      this.liveShape = {
        id: 'preview',
        type: 'line',
        startX: startPos.x,
        startY: startPos.y,
        endX: currentPos.x,
        endY: currentPos.y,
        x: minX,
        y: minY,
        width,
        height,
        rotation: 0,
        visible: true,
        locked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: this.currentColor,
        strokeWidth: this.currentWidth,
        opacity: 1,
      };
    } else if (this.currentTool === 'arrow') {
      this.liveShape = {
        id: 'preview',
        type: 'arrow',
        startX: startPos.x,
        startY: startPos.y,
        endX: currentPos.x,
        endY: currentPos.y,
        x: minX,
        y: minY,
        width,
        height,
        rotation: 0,
        visible: true,
        locked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: this.currentColor,
        strokeWidth: this.currentWidth,
        opacity: 1,
      };
    }
  }

  /**
   * Applies active transformation (move, resize, rotate) to all objects in active session.
   */
  private applyTransformation(
    session: NonNullable<typeof this.activeTransform>,
    currentBoardPos: { x: number; y: number }
  ): void {
    const { handle, startBoardPos, startObjects } = session;

    if (handle === 'move') {
      const dx = currentBoardPos.x - startBoardPos.x;
      const dy = currentBoardPos.y - startBoardPos.y;

      for (const [id, start] of startObjects.entries()) {
        const obj = this.boardState.getObject(id);
        if (obj && !obj.locked) {
          obj.x = start.x + dx;
          obj.y = start.y + dy;
          if (obj.type === 'line' || obj.type === 'arrow') {
            const lineOrArrow = obj as LineObject | ArrowObject;
            if (
              start.startX !== undefined &&
              start.startY !== undefined &&
              start.endX !== undefined &&
              start.endY !== undefined
            ) {
              lineOrArrow.startX = start.startX + dx;
              lineOrArrow.startY = start.startY + dy;
              lineOrArrow.endX = start.endX + dx;
              lineOrArrow.endY = start.endY + dy;
            }
          }
          obj.updatedAt = Date.now();
        }
      }
      return;
    }

    // Single-object resize & rotation handles
    if (session.objectIds.length === 1) {
      const obj = this.boardState.getObject(session.objectIds[0]);
      const startObject = startObjects.get(session.objectIds[0]);
      if (!obj || !startObject || obj.locked) return;

      if (handle === 'rotate') {
        const centerX = startObject.x + startObject.width / 2;
        const centerY = startObject.y + startObject.height / 2;
        const dx = currentBoardPos.x - centerX;
        const dy = currentBoardPos.y - centerY;
        const angle = Math.atan2(dy, dx);
        obj.rotation = angle + Math.PI / 2;
        obj.updatedAt = Date.now();
        return;
      }

      // Corner resize handles
      const theta = startObject.rotation || 0;
      const startCenterX = startObject.x + startObject.width / 2;
      const startCenterY = startObject.y + startObject.height / 2;
      const halfW = startObject.width / 2;
      const halfH = startObject.height / 2;

      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const rotateOffset = (ox: number, oy: number) => ({
        x: cos * ox - sin * oy,
        y: sin * ox + cos * oy,
      });
      const unrotateVector = (vx: number, vy: number) => {
        const uncos = Math.cos(-theta);
        const unsin = Math.sin(-theta);
        return {
          x: uncos * vx - unsin * vy,
          y: unsin * vx + uncos * vy,
        };
      };

      const minSize = 10; // Minimum 10 board pixels

      let newW = startObject.width;
      let newH = startObject.height;
      let newCenterX = startCenterX;
      let newCenterY = startCenterY;

      if (handle === 'resize-br') {
        const anchor = {
          x: startCenterX + rotateOffset(-halfW, -halfH).x,
          y: startCenterY + rotateOffset(-halfW, -halfH).y,
        };
        const v = unrotateVector(currentBoardPos.x - anchor.x, currentBoardPos.y - anchor.y);
        newW = Math.max(minSize, v.x);
        newH = Math.max(minSize, v.y);
        const centerOffset = rotateOffset(newW / 2, newH / 2);
        newCenterX = anchor.x + centerOffset.x;
        newCenterY = anchor.y + centerOffset.y;
      } else if (handle === 'resize-tl') {
        const anchor = {
          x: startCenterX + rotateOffset(halfW, halfH).x,
          y: startCenterY + rotateOffset(halfW, halfH).y,
        };
        const v = unrotateVector(anchor.x - currentBoardPos.x, anchor.y - currentBoardPos.y);
        newW = Math.max(minSize, v.x);
        newH = Math.max(minSize, v.y);
        const centerOffset = rotateOffset(-newW / 2, -newH / 2);
        newCenterX = anchor.x + centerOffset.x;
        newCenterY = anchor.y + centerOffset.y;
      } else if (handle === 'resize-tr') {
        const anchor = {
          x: startCenterX + rotateOffset(-halfW, halfH).x,
          y: startCenterY + rotateOffset(-halfW, halfH).y,
        };
        const v = unrotateVector(currentBoardPos.x - anchor.x, currentBoardPos.y - anchor.y);
        newW = Math.max(minSize, v.x);
        newH = Math.max(minSize, -v.y);
        const centerOffset = rotateOffset(newW / 2, -newH / 2);
        newCenterX = anchor.x + centerOffset.x;
        newCenterY = anchor.y + centerOffset.y;
      } else if (handle === 'resize-bl') {
        const anchor = {
          x: startCenterX + rotateOffset(halfW, -halfH).x,
          y: startCenterY + rotateOffset(halfW, -halfH).y,
        };
        const v = unrotateVector(currentBoardPos.x - anchor.x, currentBoardPos.y - anchor.y);
        newW = Math.max(minSize, -v.x);
        newH = Math.max(minSize, v.y);
        const centerOffset = rotateOffset(-newW / 2, newH / 2);
        newCenterX = anchor.x + centerOffset.x;
        newCenterY = anchor.y + centerOffset.y;
      }

      obj.width = newW;
      obj.height = newH;
      obj.x = newCenterX - newW / 2;
      obj.y = newCenterY - newH / 2;

      // Adjust TextObject font size proportionally when resized
      if (obj.type === 'text' && startObject.fontSize) {
        const textObj = obj as TextObject;
        const scale = newH / startObject.height;
        textObj.fontSize = Math.max(10, Math.min(150, Math.round(startObject.fontSize * scale)));
      }

      // Adjust EquationObject font size proportionally when resized
      if (obj.type === 'equation' && startObject.fontSize) {
        const eqObj = obj as EquationObject;
        const scale = newH / startObject.height;
        eqObj.fontSize = Math.max(16, Math.min(96, Math.round(startObject.fontSize * scale)));
      }

      obj.updatedAt = Date.now();
    }
  }

  /**
   * Cancels active transformation and restores objects to original pre-transform state.
   */
  private cancelTransformation(event: PointerEvent): void {
    if (!this.activeTransform) return;

    for (const [id, start] of this.activeTransform.startObjects.entries()) {
      const obj = this.boardState.getObject(id);
      if (obj) {
        obj.x = start.x;
        obj.y = start.y;
        obj.width = start.width;
        obj.height = start.height;
        obj.rotation = start.rotation;
        if (obj.type === 'text' && start.fontSize) {
          (obj as TextObject).fontSize = start.fontSize;
        }
        if (obj.type === 'equation' && start.fontSize) {
          (obj as EquationObject).fontSize = start.fontSize;
        }
        if (obj.type === 'line' || obj.type === 'arrow') {
          const lineOrArrow = obj as LineObject | ArrowObject;
          if (start.startX !== undefined) lineOrArrow.startX = start.startX;
          if (start.startY !== undefined) lineOrArrow.startY = start.startY;
          if (start.endX !== undefined) lineOrArrow.endX = start.endX;
          if (start.endY !== undefined) lineOrArrow.endY = start.endY;
        }
        obj.updatedAt = Date.now();
      }
    }

    try {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore
    }

    this.activeTransform = null;
    this.render();
  }

  /**
   * Determines which selection control handle (if any) is located at boardPos.
   */
  private getSelectionHandleAt(
    boardPos: { x: number; y: number },
    selectedObjects: BoardObject[]
  ): 'move' | 'resize-tl' | 'resize-tr' | 'resize-br' | 'resize-bl' | 'rotate' | null {
    const box = BoardRenderer.getCombinedBoundingBox(selectedObjects);
    if (!box) return null;

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const theta = box.rotation || 0;

    // Transform point into center-relative unrotated local space
    const cos = Math.cos(-theta);
    const sin = Math.sin(-theta);
    const dx = boardPos.x - centerX;
    const dy = boardPos.y - centerY;
    const localX = cos * dx - sin * dy;
    const localY = sin * dx + cos * dy;

    const padding = 8;
    const halfW = box.width / 2 + padding;
    const halfH = box.height / 2 + padding;
    const rotDist = Math.max(18, 24 / this.viewTransform.zoom);
    const handleRadius = Math.max(10, 14 / this.viewTransform.zoom);

    // 1. Rotation handle check
    const rotHandleY = -halfH - rotDist;
    if (Math.hypot(localX, localY - rotHandleY) <= handleRadius) {
      return 'rotate';
    }

    // 2. Corner resize handles check
    if (Math.hypot(localX - (-halfW), localY - (-halfH)) <= handleRadius) {
      return 'resize-tl';
    }
    if (Math.hypot(localX - halfW, localY - (-halfH)) <= handleRadius) {
      return 'resize-tr';
    }
    if (Math.hypot(localX - halfW, localY - halfH) <= handleRadius) {
      return 'resize-br';
    }
    if (Math.hypot(localX - (-halfW), localY - halfH) <= handleRadius) {
      return 'resize-bl';
    }

    // 3. Inside selection bounding box (Move)
    if (localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH) {
      return 'move';
    }

    return null;
  }

  /**
   * Updates interactive mouse cursor when hovering over selection controls or board objects.
   */
  private updateCursor(event: PointerEvent): void {
    if (this.isPanning) {
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (this.isSpacePressed) {
      this.canvas.style.cursor = 'grab';
      return;
    }
    if (this.currentTool === 'lasso') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    if (this.currentTool === 'text') {
      this.canvas.style.cursor = 'text';
      return;
    }
    if (this.currentTool !== 'select') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    const selectedIds = this.selectionManager.getSelectedIds();
    const selectedObjects = selectedIds
      .map((id) => this.boardState.getObject(id))
      .filter((obj): obj is BoardObject => obj !== undefined && obj !== null);

    if (selectedObjects.length > 0 && selectedObjects.some((o) => !o.locked)) {
      const screenPos = this.getPointerPosition(event);
      const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);
      const handle = this.getSelectionHandleAt(boardPos, selectedObjects);

      if (handle === 'rotate') {
        this.canvas.style.cursor = 'grab';
        return;
      }
      if (handle === 'resize-tl' || handle === 'resize-br') {
        this.canvas.style.cursor = 'nwse-resize';
        return;
      }
      if (handle === 'resize-tr' || handle === 'resize-bl') {
        this.canvas.style.cursor = 'nesw-resize';
        return;
      }
      if (handle === 'move') {
        this.canvas.style.cursor = 'move';
        return;
      }
    }

    const screenPos = this.getPointerPosition(event);
    const boardPos = this.viewTransform.screenToBoard(screenPos.x, screenPos.y);
    const hoveredObj = this.hitTest(boardPos);
    this.canvas.style.cursor = hoveredObj ? 'pointer' : 'default';
  }

  /**
   * Finds all visible, unlocked BoardObjects that intersect or reside inside the given lasso polygon.
   */
  private findObjectsInLasso(polygon: { x: number; y: number }[]): string[] {
    const objects = this.boardState.getObjects();
    const matchedIds: string[] = [];

    for (const obj of objects) {
      if (!obj.visible || obj.locked) continue;

      if (this.isObjectInLasso(obj, polygon)) {
        matchedIds.push(obj.id);
      }
    }

    return matchedIds;
  }

  /**
   * Determines if a BoardObject is enclosed or intersected by the lasso polygon.
   */
  private isObjectInLasso(obj: BoardObject, polygon: { x: number; y: number }[]): boolean {
    const centerX = obj.x + obj.width / 2;
    const centerY = obj.y + obj.height / 2;

    // 1. Test bounding box center point
    if (this.isPointInPolygon(centerX, centerY, polygon)) {
      return true;
    }

    // 2. Test 4 corners of bounding box
    const theta = obj.rotation || 0;
    const hw = obj.width / 2;
    const hh = obj.height / 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    const corners = [
      { x: centerX + cos * (-hw) - sin * (-hh), y: centerY + sin * (-hw) + cos * (-hh) },
      { x: centerX + cos * hw - sin * (-hh), y: centerY + sin * hw + cos * (-hh) },
      { x: centerX + cos * hw - sin * hh, y: centerY + sin * hw + cos * hh },
      { x: centerX + cos * (-hw) - sin * hh, y: centerY + sin * (-hw) + cos * hh },
    ];

    for (const corner of corners) {
      if (this.isPointInPolygon(corner.x, corner.y, polygon)) {
        return true;
      }
    }

    // 3. For line / arrow: test start and end endpoints
    if (obj.type === 'line' || obj.type === 'arrow') {
      const lineOrArrow = obj as LineObject | ArrowObject;
      if (
        this.isPointInPolygon(lineOrArrow.startX, lineOrArrow.startY, polygon) ||
        this.isPointInPolygon(lineOrArrow.endX, lineOrArrow.endY, polygon)
      ) {
        return true;
      }
    }

    // 4. Test freehand sample points
    if (obj.type === 'freehand') {
      const freehand = obj as FreehandObject;
      const baseW = freehand.initialWidth || freehand.width || 1;
      const baseH = freehand.initialHeight || freehand.height || 1;
      const scaleX = freehand.width / baseW;
      const scaleY = freehand.height / baseH;

      const step = Math.max(1, Math.floor(freehand.points.length / 10));
      for (let i = 0; i < freehand.points.length; i += step) {
        const pt = freehand.points[i];
        const unrotX = (pt.x - baseW / 2) * scaleX;
        const unrotY = (pt.y - baseH / 2) * scaleY;
        const boardX = centerX + cos * unrotX - sin * unrotY;
        const boardY = centerY + sin * unrotX + cos * unrotY;

        if (this.isPointInPolygon(boardX, boardY, polygon)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Ray-casting algorithm to test whether a point (px, py) is inside a closed polygon.
   */
  private isPointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Finalizes input (drawing or panning), commits FreehandObject to BoardState,
   * releases pointer capture, and records history.
   */
  private stopInput(event: PointerEvent): void {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.isSpacePressed
        ? 'grab'
        : this.currentTool === 'select' || this.currentTool === 'lasso'
        ? 'default'
        : this.currentTool === 'text'
        ? 'text'
        : 'crosshair';
      try {
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore
      }
      return;
    }

    if (!this.isDrawing) return;

    this.isDrawing = false;

    try {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore
    }

    if (this.currentTool === 'eraser') {
      if (this.erasedAnyInCurrentStroke) {
        this.history.recordAction(this.boardState.getObjects());
        this.erasedAnyInCurrentStroke = false;
      }
    } else if (this.liveStroke && this.currentPoints.length > 0) {
      const minX = Math.min(...this.currentPoints.map((p) => p.x));
      const maxX = Math.max(...this.currentPoints.map((p) => p.x));
      const minY = Math.min(...this.currentPoints.map((p) => p.y));
      const maxY = Math.max(...this.currentPoints.map((p) => p.y));
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);

      const relativePoints: Point[] = this.currentPoints.map((p) => ({
        x: p.x - minX,
        y: p.y - minY,
        pressure: p.pressure,
      }));

      this.liveStroke.x = minX;
      this.liveStroke.y = minY;
      this.liveStroke.width = width;
      this.liveStroke.height = height;
      this.liveStroke.initialWidth = width;
      this.liveStroke.initialHeight = height;
      this.liveStroke.rotation = 0;
      this.liveStroke.points = relativePoints;
      this.liveStroke.updatedAt = Date.now();

      this.boardState.addObject(this.liveStroke);
      this.history.recordAction(this.boardState.getObjects());

      this.liveStroke = null;
      this.currentPoints = [];
      this.render();
    }
  }

  /**
   * Performs hit testing against all visible, unlocked BoardObjects in board coordinates.
   */
  public hitTest(boardPos: { x: number; y: number }): BoardObject | null {
    const objects = this.boardState.getObjects();
    const baseTolerance = 10;

    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (!obj.visible || obj.locked) continue;

      if (obj.type === 'freehand') {
        const freehand = obj as FreehandObject;
        const effectiveTolerance = baseTolerance + freehand.strokeWidth / 2;

        const centerX = freehand.x + freehand.width / 2;
        const centerY = freehand.y + freehand.height / 2;
        const theta = freehand.rotation || 0;

        const cos = Math.cos(-theta);
        const sin = Math.sin(-theta);
        const dx = boardPos.x - centerX;
        const dy = boardPos.y - centerY;
        const unrotX = cos * dx - sin * dy;
        const unrotY = sin * dx + cos * dy;

        const baseW = freehand.initialWidth || freehand.width || 1;
        const baseH = freehand.initialHeight || freehand.height || 1;
        const scaleX = freehand.width / baseW;
        const scaleY = freehand.height / baseH;

        const halfW = freehand.width / 2 + effectiveTolerance;
        const halfH = freehand.height / 2 + effectiveTolerance;
        if (unrotX < -halfW || unrotX > halfW || unrotY < -halfH || unrotY > halfH) {
          continue;
        }

        const localPointX = unrotX / scaleX + baseW / 2;
        const localPointY = unrotY / scaleY + baseH / 2;
        const localTolerance = effectiveTolerance / Math.min(scaleX, scaleY);
        const localToleranceSq = localTolerance * localTolerance;

        if (freehand.points.length === 1) {
          const pdx = localPointX - freehand.points[0].x;
          const pdy = localPointY - freehand.points[0].y;
          if (pdx * pdx + pdy * pdy <= localToleranceSq) {
            return freehand;
          }
        } else if (freehand.points.length >= 2) {
          for (let j = 0; j < freehand.points.length - 1; j++) {
            const dist = this.distanceToSegment(
              localPointX,
              localPointY,
              freehand.points[j].x,
              freehand.points[j].y,
              freehand.points[j + 1].x,
              freehand.points[j + 1].y
            );
            if (dist <= localTolerance) {
              return freehand;
            }
          }
        }
      } else if (obj.type === 'shape') {
        const shape = obj as ShapeObject;
        const effectiveTolerance = baseTolerance + shape.strokeWidth / 2;

        const centerX = shape.x + shape.width / 2;
        const centerY = shape.y + shape.height / 2;
        const theta = shape.rotation || 0;

        const cos = Math.cos(-theta);
        const sin = Math.sin(-theta);
        const dx = boardPos.x - centerX;
        const dy = boardPos.y - centerY;
        const unrotX = cos * dx - sin * dy;
        const unrotY = sin * dx + cos * dy;

        const halfW = shape.width / 2 + effectiveTolerance;
        const halfH = shape.height / 2 + effectiveTolerance;

        if (shape.shapeType === 'rectangle') {
          if (unrotX >= -halfW && unrotX <= halfW && unrotY >= -halfH && unrotY <= halfH) {
            return shape;
          }
        } else if (shape.shapeType === 'ellipse') {
          const normX = unrotX / Math.max(1, halfW);
          const normY = unrotY / Math.max(1, halfH);
          if (normX * normX + normY * normY <= 1.0) {
            return shape;
          }
        } else if (shape.shapeType === 'triangle') {
          if (unrotX >= -halfW && unrotX <= halfW && unrotY >= -halfH && unrotY <= halfH) {
            return shape;
          }
        }
      } else if (obj.type === 'line') {
        const line = obj as LineObject;
        const effectiveTolerance = baseTolerance + line.strokeWidth / 2;
        const dist = this.distanceToSegment(
          boardPos.x,
          boardPos.y,
          line.startX,
          line.startY,
          line.endX,
          line.endY
        );
        if (dist <= effectiveTolerance) {
          return line;
        }
      } else if (obj.type === 'arrow') {
        const arrow = obj as ArrowObject;
        const effectiveTolerance = baseTolerance + arrow.strokeWidth / 2;
        const dist = this.distanceToSegment(
          boardPos.x,
          boardPos.y,
          arrow.startX,
          arrow.startY,
          arrow.endX,
          arrow.endY
        );
        if (dist <= effectiveTolerance) {
          return arrow;
        }
      } else if (obj.type === 'text' || obj.type === 'equation') {
        const textOrEqObj = obj as TextObject | EquationObject;
        const effectiveTolerance = baseTolerance;

        const centerX = textOrEqObj.x + textOrEqObj.width / 2;
        const centerY = textOrEqObj.y + textOrEqObj.height / 2;
        const theta = textOrEqObj.rotation || 0;

        const cos = Math.cos(-theta);
        const sin = Math.sin(-theta);
        const dx = boardPos.x - centerX;
        const dy = boardPos.y - centerY;
        const unrotX = cos * dx - sin * dy;
        const unrotY = sin * dx + cos * dy;

        const halfW = textOrEqObj.width / 2 + effectiveTolerance;
        const halfH = textOrEqObj.height / 2 + effectiveTolerance;

        if (unrotX >= -halfW && unrotX <= halfW && unrotY >= -halfH && unrotY <= halfH) {
          return textOrEqObj;
        }
      }
    }

    return null;
  }

  /**
   * Calculates the minimum Euclidean distance from a point (px, py) to a line segment (x1, y1)-(x2, y2).
   */
  private distanceToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      const dpx = px - x1;
      const dpy = py - y1;
      return Math.sqrt(dpx * dpx + dpy * dpy);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    const dpx = px - projX;
    const dpy = py - projY;
    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  /**
   * Erases board objects whose geometry intersects the eraser position in board space.
   */
  private eraseAtPoint(boardPos: { x: number; y: number }): void {
    const eraserRadius = Math.max(10, this.currentWidth / 2) / this.viewTransform.zoom;
    const objects = this.boardState.getObjects();
    let modified = false;

    for (const obj of objects) {
      let hit = false;
      const threshold = eraserRadius + (obj as any).strokeWidth / 2 || eraserRadius + 2;

      if (obj.type === 'freehand') {
        const freehand = obj as FreehandObject;
        const centerX = freehand.x + freehand.width / 2;
        const centerY = freehand.y + freehand.height / 2;
        const theta = freehand.rotation || 0;

        const cos = Math.cos(-theta);
        const sin = Math.sin(-theta);
        const dx = boardPos.x - centerX;
        const dy = boardPos.y - centerY;
        const unrotX = cos * dx - sin * dy;
        const unrotY = sin * dx + cos * dy;

        const baseW = freehand.initialWidth || freehand.width || 1;
        const baseH = freehand.initialHeight || freehand.height || 1;
        const scaleX = freehand.width / baseW;
        const scaleY = freehand.height / baseH;

        const halfW = freehand.width / 2 + threshold;
        const halfH = freehand.height / 2 + threshold;
        if (unrotX >= -halfW && unrotX <= halfW && unrotY >= -halfH && unrotY <= halfH) {
          const localPointX = unrotX / scaleX + baseW / 2;
          const localPointY = unrotY / scaleY + baseH / 2;
          const localThreshold = threshold / Math.min(scaleX, scaleY);
          const localThresholdSq = localThreshold * localThreshold;

          if (freehand.points.length === 1) {
            const pdx = localPointX - freehand.points[0].x;
            const pdy = localPointY - freehand.points[0].y;
            hit = pdx * pdx + pdy * pdy <= localThresholdSq;
          } else if (freehand.points.length >= 2) {
            hit = freehand.points.some((p, idx) => {
              if (idx === freehand.points.length - 1) return false;
              return (
                this.distanceToSegment(
                  localPointX,
                  localPointY,
                  p.x,
                  p.y,
                  freehand.points[idx + 1].x,
                  freehand.points[idx + 1].y
                ) <= localThreshold
              );
            });
          }
        }
      } else if (obj.type === 'shape' || obj.type === 'text' || obj.type === 'equation') {
        const target = obj;
        const centerX = target.x + target.width / 2;
        const centerY = target.y + target.height / 2;
        const theta = target.rotation || 0;

        const cos = Math.cos(-theta);
        const sin = Math.sin(-theta);
        const dx = boardPos.x - centerX;
        const dy = boardPos.y - centerY;
        const unrotX = cos * dx - sin * dy;
        const unrotY = sin * dx + cos * dy;

        const halfW = target.width / 2 + threshold;
        const halfH = target.height / 2 + threshold;
        hit = unrotX >= -halfW && unrotX <= halfW && unrotY >= -halfH && unrotY <= halfH;
      } else if (obj.type === 'line' || obj.type === 'arrow') {
        const lineOrArrow = obj as LineObject | ArrowObject;
        hit =
          this.distanceToSegment(
            boardPos.x,
            boardPos.y,
            lineOrArrow.startX,
            lineOrArrow.startY,
            lineOrArrow.endX,
            lineOrArrow.endY
          ) <= threshold;
      }

      if (hit) {
        if (this.selectionManager.isSelected(obj.id)) {
          this.selectionManager.removeFromSelection(obj.id);
        }
        this.boardState.removeObject(obj.id);
        this.erasedAnyInCurrentStroke = true;
        modified = true;
      }
    }

    if (modified) {
      this.render();
    }
  }

  /**
   * Performs an Undo operation by restoring the previous BoardState snapshot.
   */
  public undo(): boolean {
    if (this.activeTextEditor) {
      this.cancelTextEditor();
    }
    if (this.activeEquationEditor) {
      this.cancelEquationEditor();
    }

    const previousObjects = this.history.undo();
    if (previousObjects !== null) {
      this.boardState.setObjects(previousObjects);
      const selectedIds = this.selectionManager.getSelectedIds();
      const existingIds = selectedIds.filter((id) => previousObjects.some((o) => o.id === id));
      this.selectionManager.setSelectedIds(existingIds);
      this.render();
      return true;
    }
    return false;
  }

  /**
   * Performs a Redo operation by restoring the next BoardState snapshot.
   */
  public redo(): boolean {
    if (this.activeTextEditor) {
      this.cancelTextEditor();
    }
    if (this.activeEquationEditor) {
      this.cancelEquationEditor();
    }

    const nextObjects = this.history.redo();
    if (nextObjects !== null) {
      this.boardState.setObjects(nextObjects);
      const selectedIds = this.selectionManager.getSelectedIds();
      const existingIds = selectedIds.filter((id) => nextObjects.some((o) => o.id === id));
      this.selectionManager.setSelectedIds(existingIds);
      this.render();
      return true;
    }
    return false;
  }

  /**
   * Clears all objects from BoardState and re-renders an empty canvas.
   */
  public clearBoard(skipConfirm: boolean = false): boolean {
    if (!skipConfirm) {
      const confirmed = window.confirm('Are you sure you want to clear the entire board?');
      if (!confirmed) {
        return false;
      }
    }

    if (this.activeTextEditor) {
      this.cancelTextEditor();
    }
    if (this.activeEquationEditor) {
      this.cancelEquationEditor();
    }

    this.selectionManager.clearSelection();
    this.lassoPoints = [];
    this.isLassoing = false;
    this.shapeStartPos = null;
    this.liveShape = null;
    this.boardState.clear();
    this.history.recordAction(this.boardState.getObjects());
    this.render();
    console.log('[WhiteboardCanvas] BoardState cleared.');
    return true;
  }

  /**
   * Handles window resizing by resizing canvas buffer and re-rendering BoardState objects.
   */
  private setupResizeListener(): void {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
    });
  }

  /**
   * Loads a BoardPage's objects, isolated history, and view state into the canvas.
   */
  public loadPage(
    objects: readonly BoardObject[],
    historyManager: HistoryManager,
    viewState?: PageViewState
  ): void {
    if (this.activeTextEditor) {
      this.cancelTextEditor();
    }
    if (this.activeEquationEditor) {
      this.cancelEquationEditor();
    }

    this.selectionManager.clearSelection();
    this.lassoPoints = [];
    this.isLassoing = false;
    this.shapeStartPos = null;
    this.liveShape = null;

    this.boardState.setObjects(Array.from(objects));
    this.history = historyManager;

    if (viewState) {
      this.viewTransform.setTransform(viewState.zoom, viewState.panX, viewState.panY);
    } else {
      this.viewTransform.setTransform(1.0, 0, 0);
    }

    this.render();
  }

  /**
   * Returns current camera viewport state.
   */
  public getViewState(): PageViewState {
    return {
      zoom: this.viewTransform.getZoom(),
      panX: this.viewTransform.panX,
      panY: this.viewTransform.panY,
    };
  }

  /**
   * Sets camera viewport state.
   */
  public setViewState(viewState: PageViewState): void {
    this.viewTransform.setTransform(viewState.zoom, viewState.panX, viewState.panY);
    this.render();
  }

  /**
   * Sets the active history manager.
   */
  public setHistory(history: HistoryManager): void {
    this.history = history;
  }

  /**
   * Returns current zoom percentage (e.g. 100 for 1.0x).
   */
  public getZoomPercentage(): number {
    return this.viewTransform.getZoomPercentage();
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
