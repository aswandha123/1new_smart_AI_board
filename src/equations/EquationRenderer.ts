/**
 * EquationRenderer.ts
 *
 * Client-side mathematical equation renderer utilizing KaTeX to measure,
 * rasterize, and draw LaTeX expressions onto HTML5 Canvas and vector SVG exports.
 */

import katex from 'katex';
import { EquationObject } from '../models/EquationObject';

export class EquationRenderer {
  private static imageCache: Map<string, { img: HTMLImageElement; ready: boolean }> = new Map();

  /**
   * Generates KaTeX HTML and measures exact rendered dimensions in board space.
   */
  public static measureEquation(
    latex: string,
    fontSize: number
  ): { width: number; height: number; html: string } {
    let html = '';
    try {
      html = katex.renderToString(latex || ' ', {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      html = `<span style="color:red;">${latex}</span>`;
    }

    // Measure bounding box with a temporary offscreen element
    const temp = document.createElement('div');
    temp.style.position = 'absolute';
    temp.style.visibility = 'hidden';
    temp.style.left = '-9999px';
    temp.style.top = '-9999px';
    temp.style.fontSize = `${fontSize}px`;
    temp.style.lineHeight = '1.2';
    temp.style.padding = '0';
    temp.style.margin = '0';
    temp.style.display = 'inline-block';
    temp.innerHTML = html;

    document.body.appendChild(temp);
    const rect = temp.getBoundingClientRect();
    const width = Math.max(40, Math.ceil(rect.width) + 16);
    const height = Math.max(28, Math.ceil(rect.height) + 12);
    document.body.removeChild(temp);

    return { width, height, html };
  }

  /**
   * Retrieves or creates a cached SVG image representation of the rendered equation.
   */
  public static getEquationImage(
    latex: string,
    fontSize: number,
    color: string,
    width: number,
    height: number,
    onReady?: () => void
  ): HTMLImageElement | null {
    const key = `${latex}__${fontSize}__${color}__${width}__${height}`;
    const cached = this.imageCache.get(key);

    if (cached) {
      return cached.ready ? cached.img : null;
    }

    let katexHtml = '';
    try {
      katexHtml = katex.renderToString(latex || ' ', {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      katexHtml = `<span>${latex}</span>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <style>
        .katex { font-size: ${fontSize}px !important; color: ${color} !important; line-height: 1.2 !important; }
        .katex-display { margin: 0 !important; }
      </style>
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
          ${katexHtml}
        </div>
      </foreignObject>
    </svg>`;

    const img = new Image();
    const entry = { img, ready: false };
    this.imageCache.set(key, entry);

    img.onload = () => {
      entry.ready = true;
      if (onReady) onReady();
    };

    img.onerror = () => {
      entry.ready = false;
    };

    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return null;
  }

  /**
   * Renders an EquationObject onto a CanvasRenderingContext2D.
   */
  public static renderEquationToCanvas(
    ctx: CanvasRenderingContext2D,
    eq: EquationObject,
    onReady?: () => void
  ): void {
    if (!eq.latex) return;

    ctx.save();
    ctx.globalAlpha = eq.opacity;

    const centerX = eq.x + eq.width / 2;
    const centerY = eq.y + eq.height / 2;
    ctx.translate(centerX, centerY);
    if (eq.rotation) {
      ctx.rotate(eq.rotation);
    }

    const hw = eq.width / 2;
    const hh = eq.height / 2;

    const img = this.getEquationImage(
      eq.latex,
      eq.fontSize,
      eq.color,
      eq.width,
      eq.height,
      onReady
    );

    if (img) {
      ctx.drawImage(img, -hw, -hh, eq.width, eq.height);
    } else {
      // Fallback text rendering while image loads
      ctx.fillStyle = eq.color;
      ctx.font = `italic ${eq.fontSize}px "Cambria Math", "Times New Roman", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(eq.latex, 0, 0);
    }

    ctx.restore();
  }

  /**
   * Converts an EquationObject into an SVG XML foreignObject block for vector exports.
   */
  public static convertEquationToSVG(eq: EquationObject): string {
    const rotDeg = eq.rotation ? ((eq.rotation * 180) / Math.PI).toFixed(2) : '0';
    const cx = eq.x + eq.width / 2;
    const cy = eq.y + eq.height / 2;
    const transform = eq.rotation ? `transform="rotate(${rotDeg} ${cx} ${cy})"` : '';

    let katexHtml = '';
    try {
      katexHtml = katex.renderToString(eq.latex, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      katexHtml = `<span>${eq.latex}</span>`;
    }

    return `<g ${transform} opacity="${eq.opacity}">
      <foreignObject x="${eq.x}" y="${eq.y}" width="${eq.width}" height="${eq.height}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${eq.fontSize}px;color:${eq.color};display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
          ${katexHtml}
        </div>
      </foreignObject>
    </g>`;
  }
}
