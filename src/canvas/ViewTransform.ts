/**
 * ViewTransform.ts
 *
 * Manages the camera viewport state (zoom and pan offsets) for the AI Smart Board.
 * Provides bidirectional coordinate transformation between screen space and board space.
 */

export interface ViewChangeListener {
  (zoom: number, panX: number, panY: number): void;
}

export class ViewTransform {
  public zoom: number = 1.0;
  public panX: number = 0;
  public panY: number = 0;

  public minZoom: number = 0.25;
  public maxZoom: number = 4.0;

  private listeners: ViewChangeListener[] = [];

  constructor(initialZoom: number = 1.0, initialPanX: number = 0, initialPanY: number = 0) {
    this.zoom = initialZoom;
    this.panX = initialPanX;
    this.panY = initialPanY;
  }

  /**
   * Returns the current zoom level.
   */
  public getZoom(): number {
    return this.zoom;
  }

  /**
   * Returns current pan offsets.
   */
  public getPan(): { x: number; y: number } {
    return { x: this.panX, y: this.panY };
  }

  /**
   * Converts a screen coordinate (CSS pixels relative to canvas) to board space.
   *
   * @param screenX - Screen X coordinate
   * @param screenY - Screen Y coordinate
   * @returns Board coordinate { x, y }
   */
  public screenToBoard(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.panX) / this.zoom,
      y: (screenY - this.panY) / this.zoom,
    };
  }

  /**
   * Converts a board coordinate to screen space (CSS pixels relative to canvas).
   *
   * @param boardX - Board X coordinate
   * @param boardY - Board Y coordinate
   * @returns Screen coordinate { x, y }
   */
  public boardToScreen(boardX: number, boardY: number): { x: number; y: number } {
    return {
      x: boardX * this.zoom + this.panX,
      y: boardY * this.zoom + this.panY,
    };
  }

  /**
   * Adjusts zoom centered around a specific screen coordinate (cursor-centered zoom).
   *
   * @param screenX - Focus point X in screen coordinates
   * @param screenY - Focus point Y in screen coordinates
   * @param factor - Zoom multiplier (e.g. 1.1 for zoom in, 1/1.1 for zoom out)
   */
  public zoomAt(screenX: number, screenY: number, factor: number): void {
    const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    if (newZoom === this.zoom) return;

    // Preserve the board position under the cursor
    const boardPoint = this.screenToBoard(screenX, screenY);
    this.zoom = newZoom;
    this.panX = screenX - boardPoint.x * this.zoom;
    this.panY = screenY - boardPoint.y * this.zoom;

    this.notifyListeners();
  }

  /**
   * Zooms in by a step factor (centered on given screen point or canvas center).
   */
  public zoomIn(centerX: number = 0, centerY: number = 0): void {
    this.zoomAt(centerX, centerY, 1.1);
  }

  /**
   * Zooms out by a step factor (centered on given screen point or canvas center).
   */
  public zoomOut(centerX: number = 0, centerY: number = 0): void {
    this.zoomAt(centerX, centerY, 1 / 1.1);
  }

  /**
   * Sets zoom directly with optional center point.
   */
  public setZoom(targetZoom: number, centerX: number = 0, centerY: number = 0): void {
    const clampedZoom = Math.min(this.maxZoom, Math.max(this.minZoom, targetZoom));
    if (clampedZoom === this.zoom) return;

    const boardPoint = this.screenToBoard(centerX, centerY);
    this.zoom = clampedZoom;
    this.panX = centerX - boardPoint.x * this.zoom;
    this.panY = centerY - boardPoint.y * this.zoom;

    this.notifyListeners();
  }

  /**
   * Translates the camera view by delta offsets.
   */
  public panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.notifyListeners();
  }

  /**
   * Sets absolute pan offsets.
   */
  public setPan(panX: number, panY: number): void {
    this.panX = panX;
    this.panY = panY;
    this.notifyListeners();
  }

  /**
   * Resets zoom to 100% and pan to (0, 0).
   */
  public reset(): void {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.notifyListeners();
  }

  /**
   * Alias for reset()
   */
  /**
   * Sets zoom and pan coordinates directly.
   */
  public setTransform(zoom: number, panX: number, panY: number): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    this.panX = panX;
    this.panY = panY;
    this.notifyListeners();
  }

  public resetView(): void {
    this.reset();
  }

  /**
   * Returns current zoom percentage as an integer (e.g. 100 for 1.0x).
   */
  public getZoomPercentage(): number {
    return Math.round(this.zoom * 100);
  }

  /**
   * Subscribes a listener to view transform changes.
   */
  public onChange(listener: ViewChangeListener): void {
    this.listeners.push(listener);
    listener(this.zoom, this.panX, this.panY);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.zoom, this.panX, this.panY);
    }
  }
}
