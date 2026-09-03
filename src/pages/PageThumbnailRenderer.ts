/**
 * PageThumbnailRenderer.ts
 *
 * Renders thumbnail previews of BoardPages using offscreen HTML5 canvases.
 */

import { BoardObject } from '../models/BoardObject';
import { BoardRenderer } from '../canvas/BoardRenderer';
import { BoardExporter } from '../export/BoardExporter';

export class PageThumbnailRenderer {
  /**
   * Generates a data URL image representing the visual content of a BoardPage.
   */
  public static renderPageThumbnail(
    page: { objects?: readonly BoardObject[] },
    width: number = 140,
    height: number = 90
  ): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '';
    }

    // Fill clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (!page.objects || page.objects.length === 0) {
      // Draw subtle empty page grid or watermark
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, width - 20, height - 20);
      return canvas.toDataURL('image/png');
    }

    const bounds = BoardExporter.calculateBoardBounds(page.objects, 24);
    const boundsWidth = Math.max(100, bounds.width);
    const boundsHeight = Math.max(80, bounds.height);

    const scaleX = (width - 16) / boundsWidth;
    const scaleY = (height - 16) / boundsHeight;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - boundsWidth * scale) / 2 - bounds.minX * scale;
    const offsetY = (height - boundsHeight * scale) / 2 - bounds.minY * scale;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const renderer = new BoardRenderer(canvas, ctx, 1);
    renderer.renderObjects(page.objects);

    ctx.restore();

    return canvas.toDataURL('image/png');
  }
}
