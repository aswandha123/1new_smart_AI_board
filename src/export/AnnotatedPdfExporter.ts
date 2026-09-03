/**
 * AnnotatedPdfExporter.ts
 *
 * Exports a stored PDF document with per-page annotations into a new annotated PDF.
 * Uses existing PDF.js rendering and BoardRenderer to composite annotations over
 * original PDF page bitmaps. The output is generated with jsPDF.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import { BoardObject } from '../models/BoardObject';
import { BoardRenderer } from '../canvas/BoardRenderer';

export interface AnnotatedPdfExportProgressCallback {
  (current: number, total: number): void;
}

export class AnnotatedPdfExporter {
  private static readonly EXPORT_DPR = 2;

  public static async exportAnnotatedPdf(
    pdfData: ArrayBuffer,
    pdfFileName: string,
    pdfAnnotations: Map<number, BoardObject[]>,
    onProgress?: AnnotatedPdfExportProgressCallback
  ): Promise<void> {
    if (!pdfData || !pdfFileName) {
      throw new Error('Missing PDF data or filename.');
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData),
      cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
    });

    let pdfProxy: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      pdfProxy = await loadingTask.promise;
    } catch (err: any) {
      throw new Error(`Unable to load PDF: ${err?.message || 'Unknown error'}`);
    }

    const totalPages = pdfProxy.numPages;
    if (totalPages === 0) {
      throw new Error('PDF contains no pages.');
    }

    const filename = AnnotatedPdfExporter.getAnnotatedFilename(pdfFileName);
    let pdfDoc: jsPDF | null = null;

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      if (onProgress) {
        onProgress(pageNumber, totalPages);
      }

      const page = await pdfProxy.getPage(pageNumber);
      const pageViewport = page.getViewport({ scale: 1.0 });
      const exportScale = AnnotatedPdfExporter.EXPORT_DPR;
      const exportViewport = page.getViewport({ scale: exportScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(exportViewport.width);
      canvas.height = Math.round(exportViewport.height);

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Unable to create canvas for PDF export.');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport: exportViewport,
      } as any;

      try {
        const renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err: any) {
        throw new Error(`PDF page ${pageNumber} rendering failed: ${err?.message || 'Unknown error'}`);
      }

      const annotations = pdfAnnotations.get(pageNumber) || [];
      const visibleAnnotations = annotations.filter((obj) => obj.visible !== false);

      if (visibleAnnotations.length > 0) {
        AnnotatedPdfExporter.renderAnnotationsToCanvas(ctx, visibleAnnotations, exportScale);
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pageWidthPt = (pageViewport.width * 72.0) / 96.0;
      const pageHeightPt = (pageViewport.height * 72.0) / 96.0;
      const isLandscape = pageViewport.width > pageViewport.height;
      const orientation = isLandscape ? 'landscape' : 'portrait';

      if (pageNumber === 1) {
        pdfDoc = new jsPDF({ orientation, unit: 'pt', format: [pageWidthPt, pageHeightPt], compress: true });
      } else if (pdfDoc) {
        pdfDoc.addPage([pageWidthPt, pageHeightPt], orientation);
      }

      if (pdfDoc) {
        pdfDoc.addImage(imgData, 'JPEG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST');
      }

      // Release canvas memory by removing references
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    if (!pdfDoc) {
      throw new Error('Failed to initialize annotated PDF document.');
    }

    pdfDoc.save(filename);
  }

  private static getAnnotatedFilename(originalName: string): string {
    const sanitized = originalName.replace(/[/\\:*?"<>|]/g, '-').trim();
    const basename = sanitized.replace(/\.pdf$/i, '') || 'document';
    return `${basename}-annotated.pdf`;
  }

  private static renderAnnotationsToCanvas(
    ctx: CanvasRenderingContext2D,
    annotations: BoardObject[],
    exportScale: number
  ): void {
    ctx.save();
    ctx.scale(exportScale, exportScale);
    const renderer = new BoardRenderer(document.createElement('canvas'), ctx, exportScale);
    const renderableAnnotations = annotations.filter((obj) => obj.visible !== false);
    renderer.renderObjects(renderableAnnotations);
    ctx.restore();
  }
}
