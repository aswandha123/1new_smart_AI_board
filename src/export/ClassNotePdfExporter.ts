/**
 * ClassNotePdfExporter.ts
 *
 * Client-side multi-page PDF exporter for AI Smart Board class notes.
 * Iterates through all pages, renders each page's BoardObjects onto an offscreen
 * high-resolution canvas with proper bounding box scaling, orientation, and margins,
 * and compiles them into a single downloadable PDF document using jsPDF.
 */

import { jsPDF } from 'jspdf';
import { ClassNote } from '../models/ClassNote';
import { BoardState } from '../core/BoardState';
import { BoardObject } from '../models/BoardObject';
import { BoardRenderer } from '../canvas/BoardRenderer';
import { BoardExporter } from './BoardExporter';

export interface PdfExportProgressCallback {
  (current: number, total: number, pageName: string): void;
}

export class ClassNotePdfExporter {
  /**
   * Exports an entire ClassNote to a single multi-page PDF document.
   *
   * @param note - The ClassNote document containing all pages.
   * @param activeBoardState - The live runtime BoardState (for active unsaved changes).
   * @param onProgress - Optional callback notifying progress across pages.
   */
  public static async exportClassNoteToPdf(
    note: ClassNote,
    activeBoardState?: BoardState,
    onProgress?: PdfExportProgressCallback
  ): Promise<void> {
    if (!note || !note.pages || note.pages.length === 0) {
      throw new Error('Class note has no pages to export.');
    }

    const totalPages = note.pages.length;
    let pdfDoc: jsPDF | null = null;

    // A4 dimensions in points (72 pt per inch)
    const A4_PORTRAIT_W = 595.28;
    const A4_PORTRAIT_H = 841.89;

    for (let i = 0; i < totalPages; i++) {
      const page = note.pages[i];
      const pageNumber = i + 1;

      if (onProgress) {
        onProgress(pageNumber, totalPages, page.name);
      }

      // Use active BoardState objects for the current page so unsaved changes are included
      const rawObjects: readonly BoardObject[] =
        activeBoardState && page.id === note.currentPageId
          ? activeBoardState.getObjects()
          : page.objects || [];

      const visibleObjects = rawObjects.filter((o) => o.visible !== false);

      // Determine orientation and layout based on content bounding box
      let isLandscape = false;
      let bounds = { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 };

      if (visibleObjects.length > 0) {
        bounds = BoardExporter.calculateBoardBounds(visibleObjects, 48);
        isLandscape = bounds.width > bounds.height * 1.05;
      } else {
        // Default blank page orientation
        isLandscape = true;
      }

      const orientation = isLandscape ? 'landscape' : 'portrait';
      const pdfPageW = isLandscape ? A4_PORTRAIT_H : A4_PORTRAIT_W;
      const pdfPageH = isLandscape ? A4_PORTRAIT_W : A4_PORTRAIT_H;

      // High-DPI canvas buffer for crisp mathematical symbols, text, and vector strokes
      const exportDpr = 2.5;
      const canvasW = Math.round(pdfPageW * exportDpr);
      const canvasH = Math.round(pdfPageH * exportDpr);

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error(`Failed to create 2D context for page ${pageNumber}.`);
      }

      // 1. Fill clean white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // 2. Render BoardObjects if page is not empty
      if (visibleObjects.length > 0) {
        const margin = 36 * exportDpr;
        const availableW = canvasW - margin * 2;
        const availableH = canvasH - margin * 2;

        const scale = Math.min(availableW / bounds.width, availableH / bounds.height);
        const offsetX = margin + (availableW - bounds.width * scale) / 2 - bounds.minX * scale;
        const offsetY = margin + (availableH - bounds.height * scale) / 2 - bounds.minY * scale;

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        const renderer = new BoardRenderer(canvas, ctx, exportDpr);
        renderer.renderObjects(visibleObjects);

        ctx.restore();
      }

      // 3. Small async yield to allow any KaTeX equation rendering tasks to flush
      await new Promise((resolve) => setTimeout(resolve, 30));

      const pageImgData = canvas.toDataURL('image/jpeg', 0.95);

      // 4. Append to PDF document
      if (i === 0) {
        pdfDoc = new jsPDF({
          orientation,
          unit: 'pt',
          format: 'a4',
          compress: true,
        });
      } else if (pdfDoc) {
        pdfDoc.addPage('a4', orientation);
      }

      if (pdfDoc) {
        pdfDoc.addImage(pageImgData, 'JPEG', 0, 0, pdfPageW, pdfPageH, undefined, 'FAST');
      }
    }

    if (!pdfDoc) {
      throw new Error('Failed to initialize PDF document.');
    }

    // 5. Generate sanitized filename and trigger browser download
    const rawName = (note.name || 'Smart-Board-Class-Note').trim();
    const sanitizedName = rawName.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ');
    const filename = `${sanitizedName || 'Smart-Board-Class-Note'}.pdf`;

    pdfDoc.save(filename);
    console.log(`[ClassNotePdfExporter] Successfully exported ${totalPages} page(s) to "${filename}".`);
  }
}
