/**
 * BoardRenderer.ts
 *
 * Responsible for rendering structured BoardObjects (Freehand, Shapes, Lines, Arrows, Text)
 * from BoardState onto the HTML5 Canvas through the active ViewTransform (zoom and pan),
 * as well as transient UI state such as selection bounding boxes, live previews, and lasso paths.
 */

import { BoardObject } from '../models/BoardObject';
import { FreehandObject } from '../models/FreehandObject';
import { ShapeObject } from '../models/ShapeObject';
import { LineObject } from '../models/LineObject';
import { ArrowObject } from '../models/ArrowObject';
import { TextObject } from '../models/TextObject';
import { EquationObject } from '../models/EquationObject';
import { CircuitComponentObject } from '../models/CircuitComponentObject';
import { EquationRenderer } from '../equations/EquationRenderer';
import { ViewTransform } from './ViewTransform';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export class BoardRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;
  private onRedraw?: () => void;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, dpr: number = 1) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.dpr = dpr;
  }

  /**
   * Sets the callback to trigger when an asynchronous resource (e.g. equation rasterization) finishes loading.
   */
  public setOnRedraw(cb: () => void): void {
    this.onRedraw = cb;
  }

  /**
   * Updates the devicePixelRatio.
   */
  public setDpr(dpr: number): void {
    this.dpr = dpr;
  }

  /**
   * Clears the canvas, applies the camera view transform, and renders all visible board objects,
   * active live stroke / shape preview, multi/single selection bounding boxes, and active lasso paths.
   */
  public render(
    objects: readonly BoardObject[],
    viewTransform: ViewTransform,
    liveStroke?: FreehandObject | null,
    selectedObjects: BoardObject[] = [],
    lassoPoints: { x: number; y: number }[] = [],
    liveShape?: ShapeObject | LineObject | ArrowObject | TextObject | EquationObject | null,
    pdfPage?: { canvas: HTMLCanvasElement; dimensions: { width: number; height: number } } | null
  ): void {
    // 1. Reset canvas transform and clear raw buffer
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Apply combined High-DPI and ViewTransform (zoom + pan) matrix
    const scale = this.dpr * viewTransform.zoom;
    const translateX = this.dpr * viewTransform.panX;
    const translateY = this.dpr * viewTransform.panY;
    this.ctx.setTransform(scale, 0, 0, scale, translateX, translateY);

    // 2.5 Render PDF document background layer if present
    if (pdfPage && pdfPage.canvas && pdfPage.dimensions) {
      this.renderPdfLayer(pdfPage.canvas, pdfPage.dimensions);
    }

    // 3. Render all committed board objects using original board coordinates
    for (const obj of objects) {
      if (!obj.visible) continue;
      this.renderObject(obj);
    }

    // 4. Render active in-progress stroke or shape preview if present
    if (liveStroke && liveStroke.visible) {
      this.renderLiveStroke(liveStroke);
    }

    if (liveShape && liveShape.visible) {
      this.renderObject(liveShape);
    }

    // 5. Render active temporary lasso path
    if (lassoPoints && lassoPoints.length >= 2) {
      this.renderLasso(lassoPoints, viewTransform);
    }

    // 6. Render temporary selection outline, resize handles, and rotation handle for selected objects
    if (selectedObjects.length > 0) {
      this.renderSelection(selectedObjects, viewTransform);
    }
  }

  /**
   * Directly renders an array of BoardObjects using the current canvas context transform.
   */
  public renderObjects(objects: readonly BoardObject[]): void {
    for (const obj of objects) {
      if (obj.visible) {
        this.renderObject(obj);
      }
    }
  }

  /**
   * Dispatches rendering of a single BoardObject based on its type.
   */
  public renderObject(obj: BoardObject): void {
    switch (obj.type) {
      case 'freehand':
        this.renderFreehand(obj as FreehandObject);
        break;
      case 'shape':
        this.renderShape(obj as ShapeObject);
        break;
      case 'line':
        this.renderLine(obj as LineObject);
        break;
      case 'arrow':
        this.renderArrow(obj as ArrowObject);
        break;
      case 'text':
        this.renderText(obj as TextObject);
        break;
      case 'equation':
        this.renderEquation(obj as EquationObject);
        break;
      case 'circuit':
        this.renderCircuitComponent(obj as CircuitComponentObject);
        break;
      default:
        break;
    }
  }

  /**
   * Renders an EquationObject using EquationRenderer.
   */
  private renderEquation(eq: EquationObject): void {
    EquationRenderer.renderEquationToCanvas(this.ctx, eq, () => {
      if (this.onRedraw) {
        this.onRedraw();
      }
    });
  }

  /**
   * Renders the PDF page document layer with drop shadow, white page background, and border in board space.
   */
  public renderPdfLayer(
    pdfCanvas: HTMLCanvasElement,
    dimensions: { width: number; height: number }
  ): void {
    const x = 0;
    const y = 0;
    const w = dimensions.width;
    const h = dimensions.height;

    // Draw document drop shadow & white paper background
    this.ctx.save();
    this.ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
    this.ctx.shadowBlur = 20;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 6;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(x, y, w, h);
    this.ctx.restore();

    // Draw PDF page canvas bitmap
    this.ctx.drawImage(pdfCanvas, x, y, w, h);

    // Subtle page boundary line
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.restore();
  }

  /**
   * Calculates the combined axis-aligned bounding box enclosing an array of BoardObjects in board space.
   */
  public static getCombinedBoundingBox(objects: BoardObject[]): BoundingBox | null {
    if (objects.length === 0) return null;
    if (objects.length === 1) {
      const obj = objects[0];
      return {
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: obj.rotation || 0,
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const obj of objects) {
      const cx = obj.x + obj.width / 2;
      const cy = obj.y + obj.height / 2;
      const theta = obj.rotation || 0;
      const hw = obj.width / 2;
      const hh = obj.height / 2;

      if (theta === 0) {
        minX = Math.min(minX, obj.x);
        minY = Math.min(minY, obj.y);
        maxX = Math.max(maxX, obj.x + obj.width);
        maxY = Math.max(maxY, obj.y + obj.height);
      } else {
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const corners = [
          { x: cx + cos * (-hw) - sin * (-hh), y: cy + sin * (-hw) + cos * (-hh) },
          { x: cx + cos * hw - sin * (-hh), y: cy + sin * hw + cos * (-hh) },
          { x: cx + cos * hw - sin * hh, y: cy + sin * hw + cos * hh },
          { x: cx + cos * (-hw) - sin * hh, y: cy + sin * (-hw) + cos * hh },
        ];
        for (const c of corners) {
          minX = Math.min(minX, c.x);
          minY = Math.min(minY, c.y);
          maxX = Math.max(maxX, c.x);
          maxY = Math.max(maxY, c.y);
        }
      }
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      rotation: 0,
    };
  }

  /**
   * Renders the temporary selection outline, 4 corner resize handles, and rotation handle.
   */
  private renderSelection(selectedObjects: BoardObject[], viewTransform: ViewTransform): void {
    const box = BoardRenderer.getCombinedBoundingBox(selectedObjects);
    if (!box) return;

    const padding = 8; // 8 board pixels visual padding
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    const halfW = box.width / 2 + padding;
    const halfH = box.height / 2 + padding;
    const boxX = -halfW;
    const boxY = -halfH;
    const boxW = halfW * 2;
    const boxH = halfH * 2;

    const lineWidth = Math.max(1, 1.5 / viewTransform.zoom);
    const handleSize = Math.max(6, 8 / viewTransform.zoom);
    const rotDist = Math.max(18, 24 / viewTransform.zoom);
    const rotRadius = Math.max(4.5, 6 / viewTransform.zoom);

    this.ctx.save();

    // 1. Position and orient selection overlay at selection center
    this.ctx.translate(centerX, centerY);
    if (box.rotation) {
      this.ctx.rotate(box.rotation);
    }

    // 2. Semi-transparent selection fill inside bounding box
    this.ctx.fillStyle = 'rgba(37, 99, 235, 0.04)';
    this.ctx.fillRect(boxX, boxY, boxW, boxH);

    // 3. Dashed primary selection border
    this.ctx.strokeStyle = '#2563eb';
    this.ctx.lineWidth = lineWidth;
    this.ctx.setLineDash([4 / viewTransform.zoom, 3 / viewTransform.zoom]);
    this.ctx.strokeRect(boxX, boxY, boxW, boxH);

    // 4. Rotation handle connecting line (stalk)
    this.ctx.setLineDash([]);
    this.ctx.beginPath();
    this.ctx.moveTo(0, boxY);
    this.ctx.lineTo(0, boxY - rotDist);
    this.ctx.stroke();

    // 5. Rotation handle circle
    this.ctx.beginPath();
    this.ctx.arc(0, boxY - rotDist, rotRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fill();
    this.ctx.strokeStyle = '#2563eb';
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();

    // 6. Four corner resize handles (top-left, top-right, bottom-left, bottom-right)
    const corners = [
      { x: boxX, y: boxY },
      { x: boxX + boxW, y: boxY },
      { x: boxX + boxW, y: boxY + boxH },
      { x: boxX, y: boxY + boxH },
    ];

    for (const corner of corners) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(
        corner.x - handleSize / 2,
        corner.y - handleSize / 2,
        handleSize,
        handleSize
      );
      this.ctx.strokeStyle = '#2563eb';
      this.ctx.lineWidth = lineWidth;
      this.ctx.strokeRect(
        corner.x - handleSize / 2,
        corner.y - handleSize / 2,
        handleSize,
        handleSize
      );
    }

    this.ctx.restore();
  }

  /**
   * Renders the temporary in-progress lasso path with translucent fill and dashed border.
   */
  private renderLasso(points: { x: number; y: number }[], viewTransform: ViewTransform): void {
    if (points.length < 2) return;

    const lineWidth = Math.max(1.5, 2 / viewTransform.zoom);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.closePath();

    // Translucent blue fill
    this.ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    this.ctx.fill();

    // Vibrant dashed stroke
    this.ctx.strokeStyle = '#2563eb';
    this.ctx.lineWidth = lineWidth;
    this.ctx.setLineDash([5 / viewTransform.zoom, 4 / viewTransform.zoom]);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Renders a multiline TextObject onto the Canvas.
   */
  private renderText(textObj: TextObject): void {
    if (!textObj.text) return;

    this.ctx.save();
    this.ctx.globalAlpha = textObj.opacity;
    this.ctx.fillStyle = textObj.color;
    this.ctx.globalCompositeOperation = 'source-over';

    const centerX = textObj.x + textObj.width / 2;
    const centerY = textObj.y + textObj.height / 2;
    this.ctx.translate(centerX, centerY);
    if (textObj.rotation) {
      this.ctx.rotate(textObj.rotation);
    }

    const hw = textObj.width / 2;
    const hh = textObj.height / 2;

    this.ctx.font = `${textObj.fontSize}px ${textObj.fontFamily || 'Arial'}`;
    this.ctx.textAlign = textObj.textAlign || 'left';
    this.ctx.textBaseline = 'top';

    const lines = textObj.text.split('\n');
    const lineHeight = textObj.fontSize * 1.25;

    let drawX = -hw;
    if (textObj.textAlign === 'center') {
      drawX = 0;
    } else if (textObj.textAlign === 'right') {
      drawX = hw;
    }

    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], drawX, -hh + i * lineHeight);
    }

    this.ctx.restore();
  }

  private renderCircuitComponent(component: CircuitComponentObject): void {
    this.ctx.save();
    this.ctx.globalAlpha = component.opacity;
    this.ctx.strokeStyle = component.color;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.lineWidth = 2;

    const centerX = component.x + component.width / 2;
    const centerY = component.y + component.height / 2;
    this.ctx.translate(centerX, centerY);
    if (component.rotation) {
      this.ctx.rotate(component.rotation);
    }

    this.ctx.fillRect(-component.width / 2, -component.height / 2, component.width, component.height);
    this.ctx.strokeRect(-component.width / 2, -component.height / 2, component.width, component.height);

    this.ctx.fillStyle = component.color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = '12px Arial';
    this.ctx.fillText(component.label, 0, 0);
    this.ctx.restore();
  }

  /**
   * Renders a ShapeObject (Rectangle, Ellipse, Triangle) with its full transformation.
   */
  private renderShape(shape: ShapeObject): void {
    this.ctx.save();
    this.ctx.globalAlpha = shape.opacity;
    this.ctx.lineWidth = shape.strokeWidth;
    this.ctx.strokeStyle = shape.color;
    this.ctx.fillStyle = shape.fillColor || shape.color;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalCompositeOperation = 'source-over';

    const centerX = shape.x + shape.width / 2;
    const centerY = shape.y + shape.height / 2;
    this.ctx.translate(centerX, centerY);
    if (shape.rotation) {
      this.ctx.rotate(shape.rotation);
    }

    const hw = shape.width / 2;
    const hh = shape.height / 2;

    if (shape.shapeType === 'rectangle') {
      if (shape.fill) {
        this.ctx.fillRect(-hw, -hh, shape.width, shape.height);
      }
      this.ctx.strokeRect(-hw, -hh, shape.width, shape.height);
    } else if (shape.shapeType === 'ellipse') {
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, Math.max(0.1, hw), Math.max(0.1, hh), 0, 0, Math.PI * 2);
      if (shape.fill) {
        this.ctx.fill();
      }
      this.ctx.stroke();
    } else if (shape.shapeType === 'triangle') {
      this.ctx.beginPath();
      this.ctx.moveTo(0, -hh);
      this.ctx.lineTo(hw, hh);
      this.ctx.lineTo(-hw, hh);
      this.ctx.closePath();
      if (shape.fill) {
        this.ctx.fill();
      }
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Renders a straight LineObject.
   */
  private renderLine(line: LineObject): void {
    this.ctx.save();
    this.ctx.globalAlpha = line.opacity;
    this.ctx.lineWidth = line.strokeWidth;
    this.ctx.strokeStyle = line.color;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalCompositeOperation = 'source-over';

    this.ctx.beginPath();
    this.ctx.moveTo(line.startX, line.startY);
    this.ctx.lineTo(line.endX, line.endY);
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Renders a directional ArrowObject with a shaft and triangular arrowhead.
   */
  private renderArrow(arrow: ArrowObject): void {
    this.ctx.save();
    this.ctx.globalAlpha = arrow.opacity;
    this.ctx.lineWidth = arrow.strokeWidth;
    this.ctx.strokeStyle = arrow.color;
    this.ctx.fillStyle = arrow.color;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalCompositeOperation = 'source-over';

    // 1. Draw shaft
    this.ctx.beginPath();
    this.ctx.moveTo(arrow.startX, arrow.startY);
    this.ctx.lineTo(arrow.endX, arrow.endY);
    this.ctx.stroke();

    // 2. Draw triangular arrowhead
    const angle = Math.atan2(arrow.endY - arrow.startY, arrow.endX - arrow.startX);
    const headLen = Math.max(12, arrow.strokeWidth * 3.5);
    const headAngle = Math.PI / 6; // 30 degrees

    const leftX = arrow.endX - headLen * Math.cos(angle - headAngle);
    const leftY = arrow.endY - headLen * Math.sin(angle - headAngle);
    const rightX = arrow.endX - headLen * Math.cos(angle + headAngle);
    const rightY = arrow.endY - headLen * Math.sin(angle + headAngle);

    this.ctx.beginPath();
    this.ctx.moveTo(arrow.endX, arrow.endY);
    this.ctx.lineTo(leftX, leftY);
    this.ctx.lineTo(rightX, rightY);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Renders a committed FreehandObject with its full transformation (translation, rotation, scaling).
   */
  private renderFreehand(stroke: FreehandObject): void {
    if (stroke.points.length === 0) return;

    const baseW = stroke.initialWidth || stroke.width || 1;
    const baseH = stroke.initialHeight || stroke.height || 1;
    const scaleX = stroke.width / baseW;
    const scaleY = stroke.height / baseH;

    this.ctx.save();
    this.ctx.globalAlpha = stroke.opacity;
    this.ctx.lineWidth = stroke.strokeWidth;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.fillStyle = stroke.color;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalCompositeOperation = 'source-over';

    // Apply object transformation: center translation, rotation, scale, local origin translation
    const centerX = stroke.x + stroke.width / 2;
    const centerY = stroke.y + stroke.height / 2;
    this.ctx.translate(centerX, centerY);
    if (stroke.rotation) {
      this.ctx.rotate(stroke.rotation);
    }
    this.ctx.scale(scaleX, scaleY);
    this.ctx.translate(-baseW / 2, -baseH / 2);

    this.drawStrokePoints(stroke.points, stroke.strokeWidth);

    this.ctx.restore();
  }

  /**
   * Renders in-progress live stroke directly without object transform matrix.
   */
  private renderLiveStroke(stroke: FreehandObject): void {
    if (stroke.points.length === 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = stroke.opacity;
    this.ctx.lineWidth = stroke.strokeWidth;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.fillStyle = stroke.color;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalCompositeOperation = 'source-over';

    this.drawStrokePoints(stroke.points, stroke.strokeWidth);

    this.ctx.restore();
  }

  /**
   * Internal path drawing for stroke points.
   */
  private drawStrokePoints(points: readonly { x: number; y: number }[], strokeWidth: number): void {
    if (points.length === 1) {
      const point = points[0];
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, strokeWidth / 2, 0, Math.PI * 2);
      this.ctx.fill();
    } else if (points.length === 2) {
      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].y);
      this.ctx.lineTo(points[1].x, points[1].y);
      this.ctx.stroke();
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        this.ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }

      const lastIndex = points.length - 1;
      this.ctx.lineTo(points[lastIndex].x, points[lastIndex].y);
      this.ctx.stroke();
    }
  }
}
