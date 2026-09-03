/**
 * BoardExporter.ts
 *
 * Dedicated export engine responsible for exporting BoardState into
 * high-resolution PNG, vector SVG, and print-ready layouts independently
 * of the current camera view transform (zoom/pan) and UI overlays.
 */

import { BoardState } from '../core/BoardState';
import { BoardObject } from '../models/BoardObject';
import { FreehandObject } from '../models/FreehandObject';
import { ShapeObject } from '../models/ShapeObject';
import { LineObject } from '../models/LineObject';
import { ArrowObject } from '../models/ArrowObject';
import { TextObject } from '../models/TextObject';
import { EquationObject } from '../models/EquationObject';
import { EquationRenderer } from '../equations/EquationRenderer';

export interface BoardBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export class BoardExporter {
  /**
   * Sanitizes a board title string for safe filesystem usage.
   */
  public static sanitizeFilename(name: string): string {
    const clean = (name || 'Untitled Board')
      .trim()
      .replace(/[\/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, '-');
    return clean.replace(/-+/g, '-');
  }

  /**
   * Calculates the overall bounding rectangle of all visible BoardObjects in board space.
   */
  public static calculateBoardBounds(objects: readonly BoardObject[], margin: number = 40): BoardBounds {
    const visibleObjects = objects.filter((o) => o.visible);

    if (visibleObjects.length === 0) {
      return {
        minX: 0,
        minY: 0,
        maxX: 1200,
        maxY: 800,
        width: 1200,
        height: 800,
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const obj of visibleObjects) {
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

    const boundedMinX = minX - margin;
    const boundedMinY = minY - margin;
    const boundedMaxX = maxX + margin;
    const boundedMaxY = maxY + margin;

    return {
      minX: boundedMinX,
      minY: boundedMinY,
      maxX: boundedMaxX,
      maxY: boundedMaxY,
      width: Math.max(100, boundedMaxX - boundedMinX),
      height: Math.max(100, boundedMaxY - boundedMinY),
    };
  }

  /**
   * Exports the board content as a high-resolution PNG image file.
   */
  public static async exportPNG(boardState: BoardState, boardName: string): Promise<void> {
    const objects = boardState.getObjects().filter((o) => o.visible);
    const bounds = this.calculateBoardBounds(objects, 40);

    const canvas = document.createElement('canvas');
    const scale = 2; // 2x High-DPI render quality
    canvas.width = Math.ceil(bounds.width * scale);
    canvas.height = Math.ceil(bounds.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create offscreen 2D canvas context for PNG export.');
    }

    // 1. Fill clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Set transform matrix to offset board bounds and apply scale
    ctx.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);

    // 3. Render all visible board objects
    for (const obj of objects) {
      this.renderObjectToCanvas(ctx, obj);
    }

    // 4. Download file as PNG
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to generate PNG blob from canvas.'));
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `smart-board-${this.sanitizeFilename(boardName)}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      }, 'image/png');
    });
  }

  /**
   * Exports the board content as a scalable, pure vector SVG file.
   */
  public static async exportSVG(boardState: BoardState, boardName: string): Promise<void> {
    const objects = boardState.getObjects().filter((o) => o.visible);
    const bounds = this.calculateBoardBounds(objects, 40);

    const svgElements: string[] = [];

    // 1. Background rectangle
    svgElements.push(
      `<rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />`
    );

    // 2. Convert each visible board object into SVG vector nodes
    for (const obj of objects) {
      svgElements.push(this.convertObjectToSVG(obj));
    }

    const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">
  ${svgElements.join('\n  ')}
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `smart-board-${this.sanitizeFilename(boardName)}.svg`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Prepares and triggers a clean browser print dialog with the full board graphic.
   */
  public static async printBoard(boardState: BoardState, boardName: string): Promise<void> {
    const objects = boardState.getObjects().filter((o) => o.visible);
    const bounds = this.calculateBoardBounds(objects, 40);

    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = Math.ceil(bounds.width * scale);
    canvas.height = Math.ceil(bounds.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create canvas context for printing.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);

    for (const obj of objects) {
      this.renderObjectToCanvas(ctx, obj);
    }

    const dataUrl = canvas.toDataURL('image/png');

    const printIframe = document.createElement('iframe');
    printIframe.style.position = 'fixed';
    printIframe.style.right = '0';
    printIframe.style.bottom = '0';
    printIframe.style.width = '0';
    printIframe.style.height = '0';
    printIframe.style.border = 'none';

    document.body.appendChild(printIframe);

    const printDoc = printIframe.contentWindow?.document;
    if (!printDoc) {
      document.body.removeChild(printIframe);
      throw new Error('Failed to access print frame document.');
    }

    printDoc.open();
    printDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${this.escapeXml(boardName)} - Print</title>
          <style>
            @page {
              size: auto;
              margin: 15mm;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #333;
            }
            .print-header {
              width: 100%;
              text-align: left;
              margin-bottom: 12px;
              border-bottom: 1px solid #eee;
              padding-bottom: 8px;
            }
            .print-header h1 {
              font-size: 18px;
              margin: 0 0 4px 0;
            }
            .print-header p {
              font-size: 11px;
              color: #777;
              margin: 0;
            }
            .print-image {
              max-width: 100%;
              height: auto;
              border: 1px solid #e2e8f0;
              box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>${this.escapeXml(boardName)}</h1>
            <p>Exported from AI Smart Board on ${new Date().toLocaleString()}</p>
          </div>
          <img src="${dataUrl}" class="print-image" />
        </body>
      </html>
    `);
    printDoc.close();

    // Trigger printing once image loads
    setTimeout(() => {
      printIframe.contentWindow?.focus();
      printIframe.contentWindow?.print();
      setTimeout(() => {
        if (printIframe.parentNode) {
          document.body.removeChild(printIframe);
        }
      }, 2000);
    }, 300);
  }

  /**
   * Exports a specific set of objects as a Base64 JPEG data URL.
   */
  public static async exportDataUrlForObjects(objects: readonly BoardObject[], scale: number = 2): Promise<string> {
    const bounds = this.calculateBoardBounds(objects, 10);

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(bounds.width * scale);
    canvas.height = Math.ceil(bounds.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create offscreen 2D canvas context for data URL export.');
    }

    // Fill clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set transform matrix to offset board bounds and apply scale
    ctx.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);

    // Render objects
    for (const obj of objects) {
      this.renderObjectToCanvas(ctx, obj);
    }

    return canvas.toDataURL('image/jpeg', 0.9);
  }

  /**
   * Internal helper rendering a BoardObject onto a CanvasRenderingContext2D.
   */
  private static renderObjectToCanvas(ctx: CanvasRenderingContext2D, obj: BoardObject): void {
    if (obj.type === 'freehand') {
      const stroke = obj as FreehandObject;
      if (stroke.points.length === 0) return;

      const baseW = stroke.initialWidth || stroke.width || 1;
      const baseH = stroke.initialHeight || stroke.height || 1;
      const scaleX = stroke.width / baseW;
      const scaleY = stroke.height / baseH;

      ctx.save();
      ctx.globalAlpha = stroke.opacity;
      ctx.lineWidth = stroke.strokeWidth;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const centerX = stroke.x + stroke.width / 2;
      const centerY = stroke.y + stroke.height / 2;
      ctx.translate(centerX, centerY);
      if (stroke.rotation) {
        ctx.rotate(stroke.rotation);
      }
      ctx.scale(scaleX, scaleY);
      ctx.translate(-baseW / 2, -baseH / 2);

      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.strokeWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (stroke.points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length - 1; i++) {
          const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
          const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
          ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, midX, midY);
        }
        const last = stroke.points.length - 1;
        ctx.lineTo(stroke.points[last].x, stroke.points[last].y);
        ctx.stroke();
      }

      ctx.restore();
    } else if (obj.type === 'shape') {
      const shape = obj as ShapeObject;
      ctx.save();
      ctx.globalAlpha = shape.opacity;
      ctx.lineWidth = shape.strokeWidth;
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.fillColor || shape.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const centerX = shape.x + shape.width / 2;
      const centerY = shape.y + shape.height / 2;
      ctx.translate(centerX, centerY);
      if (shape.rotation) {
        ctx.rotate(shape.rotation);
      }

      const hw = shape.width / 2;
      const hh = shape.height / 2;

      if (shape.shapeType === 'rectangle') {
        if (shape.fill) ctx.fillRect(-hw, -hh, shape.width, shape.height);
        ctx.strokeRect(-hw, -hh, shape.width, shape.height);
      } else if (shape.shapeType === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(0.1, hw), Math.max(0.1, hh), 0, 0, Math.PI * 2);
        if (shape.fill) ctx.fill();
        ctx.stroke();
      } else if (shape.shapeType === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(0, -hh);
        ctx.lineTo(hw, hh);
        ctx.lineTo(-hw, hh);
        ctx.closePath();
        if (shape.fill) ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    } else if (obj.type === 'line') {
      const line = obj as LineObject;
      ctx.save();
      ctx.globalAlpha = line.opacity;
      ctx.lineWidth = line.strokeWidth;
      ctx.strokeStyle = line.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(line.startX, line.startY);
      ctx.lineTo(line.endX, line.endY);
      ctx.stroke();

      ctx.restore();
    } else if (obj.type === 'arrow') {
      const arrow = obj as ArrowObject;
      ctx.save();
      ctx.globalAlpha = arrow.opacity;
      ctx.lineWidth = arrow.strokeWidth;
      ctx.strokeStyle = arrow.color;
      ctx.fillStyle = arrow.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(arrow.startX, arrow.startY);
      ctx.lineTo(arrow.endX, arrow.endY);
      ctx.stroke();

      const angle = Math.atan2(arrow.endY - arrow.startY, arrow.endX - arrow.startX);
      const headLen = Math.max(12, arrow.strokeWidth * 3.5);
      const headAngle = Math.PI / 6;

      const leftX = arrow.endX - headLen * Math.cos(angle - headAngle);
      const leftY = arrow.endY - headLen * Math.sin(angle - headAngle);
      const rightX = arrow.endX - headLen * Math.cos(angle + headAngle);
      const rightY = arrow.endY - headLen * Math.sin(angle + headAngle);

      ctx.beginPath();
      ctx.moveTo(arrow.endX, arrow.endY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    } else if (obj.type === 'text') {
      const textObj = obj as TextObject;
      if (!textObj.text) return;

      ctx.save();
      ctx.globalAlpha = textObj.opacity;
      ctx.fillStyle = textObj.color;

      const centerX = textObj.x + textObj.width / 2;
      const centerY = textObj.y + textObj.height / 2;
      ctx.translate(centerX, centerY);
      if (textObj.rotation) {
        ctx.rotate(textObj.rotation);
      }

      const hw = textObj.width / 2;
      const hh = textObj.height / 2;

      ctx.font = `${textObj.fontSize}px ${textObj.fontFamily || 'Arial'}`;
      ctx.textAlign = textObj.textAlign || 'left';
      ctx.textBaseline = 'top';

      const lines = textObj.text.split('\n');
      const lineHeight = textObj.fontSize * 1.25;

      let drawX = -hw;
      if (textObj.textAlign === 'center') drawX = 0;
      if (textObj.textAlign === 'right') drawX = hw;

      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], drawX, -hh + i * lineHeight);
      }

      ctx.restore();
    } else if (obj.type === 'equation') {
      EquationRenderer.renderEquationToCanvas(ctx, obj as EquationObject);
    }
  }

  /**
   * Internal helper converting a single BoardObject into an SVG XML snippet.
   */
  private static convertObjectToSVG(obj: BoardObject): string {
    const rotDeg = obj.rotation ? ((obj.rotation * 180) / Math.PI).toFixed(2) : '0';
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const transform = obj.rotation ? `transform="rotate(${rotDeg} ${cx} ${cy})"` : '';

    if (obj.type === 'freehand') {
      const freehand = obj as FreehandObject;
      if (freehand.points.length === 0) return '';

      const baseW = freehand.initialWidth || freehand.width || 1;
      const baseH = freehand.initialHeight || freehand.height || 1;
      const scaleX = freehand.width / baseW;
      const scaleY = freehand.height / baseH;

      let pathD = '';
      if (freehand.points.length === 1) {
        const p = freehand.points[0];
        pathD = `M ${p.x} ${p.y} m -${freehand.strokeWidth / 2}, 0 a ${freehand.strokeWidth / 2},${freehand.strokeWidth / 2} 0 1,0 ${freehand.strokeWidth},0 a ${freehand.strokeWidth / 2},${freehand.strokeWidth / 2} 0 1,0 -${freehand.strokeWidth},0`;
      } else if (freehand.points.length === 2) {
        pathD = `M ${freehand.points[0].x} ${freehand.points[0].y} L ${freehand.points[1].x} ${freehand.points[1].y}`;
      } else {
        pathD = `M ${freehand.points[0].x} ${freehand.points[0].y}`;
        for (let i = 1; i < freehand.points.length - 1; i++) {
          const midX = (freehand.points[i].x + freehand.points[i + 1].x) / 2;
          const midY = (freehand.points[i].y + freehand.points[i + 1].y) / 2;
          pathD += ` Q ${freehand.points[i].x} ${freehand.points[i].y}, ${midX} ${midY}`;
        }
        const last = freehand.points.length - 1;
        pathD += ` L ${freehand.points[last].x} ${freehand.points[last].y}`;
      }

      // Group transformation applying object position, rotation, and scaling
      const groupTransform = `transform="translate(${freehand.x}, ${freehand.y}) rotate(${rotDeg} ${freehand.width / 2} ${freehand.height / 2}) scale(${scaleX}, ${scaleY})"`;

      return `<g ${groupTransform} opacity="${freehand.opacity}">
        <path d="${pathD}" fill="none" stroke="${this.escapeXml(freehand.color)}" stroke-width="${freehand.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
      </g>`;
    } else if (obj.type === 'shape') {
      const shape = obj as ShapeObject;
      const fill = shape.fill ? (shape.fillColor || shape.color) : 'none';

      if (shape.shapeType === 'rectangle') {
        return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${this.escapeXml(fill)}" stroke="${this.escapeXml(shape.color)}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}" ${transform} />`;
      } else if (shape.shapeType === 'ellipse') {
        const rx = shape.width / 2;
        const ry = shape.height / 2;
        return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${this.escapeXml(fill)}" stroke="${this.escapeXml(shape.color)}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}" ${transform} />`;
      } else if (shape.shapeType === 'triangle') {
        const topX = cx;
        const topY = cy - shape.height / 2;
        const rightX = cx + shape.width / 2;
        const rightY = cy + shape.height / 2;
        const leftX = cx - shape.width / 2;
        const leftY = cy + shape.height / 2;
        return `<polygon points="${topX},${topY} ${rightX},${rightY} ${leftX},${leftY}" fill="${this.escapeXml(fill)}" stroke="${this.escapeXml(shape.color)}" stroke-width="${shape.strokeWidth}" stroke-linejoin="round" opacity="${shape.opacity}" ${transform} />`;
      }
    } else if (obj.type === 'line') {
      const line = obj as LineObject;
      return `<line x1="${line.startX}" y1="${line.startY}" x2="${line.endX}" y2="${line.endY}" stroke="${this.escapeXml(line.color)}" stroke-width="${line.strokeWidth}" stroke-linecap="round" opacity="${line.opacity}" />`;
    } else if (obj.type === 'arrow') {
      const arrow = obj as ArrowObject;
      const angle = Math.atan2(arrow.endY - arrow.startY, arrow.endX - arrow.startX);
      const headLen = Math.max(12, arrow.strokeWidth * 3.5);
      const headAngle = Math.PI / 6;

      const leftX = arrow.endX - headLen * Math.cos(angle - headAngle);
      const leftY = arrow.endY - headLen * Math.sin(angle - headAngle);
      const rightX = arrow.endX - headLen * Math.cos(angle + headAngle);
      const rightY = arrow.endY - headLen * Math.sin(angle + headAngle);

      return `<g opacity="${arrow.opacity}">
        <line x1="${arrow.startX}" y1="${arrow.startY}" x2="${arrow.endX}" y2="${arrow.endY}" stroke="${this.escapeXml(arrow.color)}" stroke-width="${arrow.strokeWidth}" stroke-linecap="round" />
        <polygon points="${arrow.endX},${arrow.endY} ${leftX},${leftY} ${rightX},${rightY}" fill="${this.escapeXml(arrow.color)}" stroke="${this.escapeXml(arrow.color)}" stroke-linejoin="round" />
      </g>`;
    } else if (obj.type === 'text') {
      const textObj = obj as TextObject;
      if (!textObj.text) return '';

      const lines = textObj.text.split('\n');
      const lineHeight = textObj.fontSize * 1.25;
      const hw = textObj.width / 2;
      const hh = textObj.height / 2;

      let anchor = 'start';
      let startX = -hw;
      if (textObj.textAlign === 'center') {
        anchor = 'middle';
        startX = 0;
      } else if (textObj.textAlign === 'right') {
        anchor = 'end';
        startX = hw;
      }

      const tspans = lines
        .map((line, idx) => `<tspan x="${startX}" dy="${idx === 0 ? textObj.fontSize : lineHeight}">${this.escapeXml(line)}</tspan>`)
        .join('');

      return `<g transform="translate(${cx}, ${cy}) rotate(${rotDeg})" opacity="${textObj.opacity}">
        <text font-family="${this.escapeXml(textObj.fontFamily || 'Arial')}" font-size="${textObj.fontSize}" fill="${this.escapeXml(textObj.color)}" text-anchor="${anchor}" y="${-hh}">
          ${tspans}
        </text>
      </g>`;
    } else if (obj.type === 'equation') {
      return EquationRenderer.convertEquationToSVG(obj as EquationObject);
    }

    return '';
  }

  /**
   * XML character escaping utility.
   */
  private static escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
