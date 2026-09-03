/**
 * PdfViewerService.ts
 *
 * Encapsulates PDF.js loading, worker initialization, page lifecycle,
 * high-resolution offscreen rasterization, and navigation for the Smart Board.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { PdfDocument } from '../models/PdfDocument';
import { PdfPage } from '../models/PdfPage';

// Configure PDF.js worker using unpkg / CDN fallback or bundled worker for robust browser support
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
} catch (e) {
  console.warn('[PdfViewerService] Fallback worker configuration:', e);
}

export class PdfViewerService {
  private pdfProxy: pdfjsLib.PDFDocumentProxy | null = null;
  private currentDoc: PdfDocument | null = null;
  private currentPageNum: number = 1;
  private renderedCanvas: HTMLCanvasElement | null = null;
  private pageDimensions: { width: number; height: number } | null = null;
  private renderTask: any = null;

  /**
   * Loads a PDF file from an ArrayBuffer.
   */
  public async loadPdf(data: ArrayBuffer, fileName: string, existingId?: string, existingCurrentPage?: number): Promise<PdfDocument> {
    this.closePdf();

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(data),
        cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
        cMapPacked: true,
      });

      this.pdfProxy = await loadingTask.promise;
      this.currentPageNum = existingCurrentPage && existingCurrentPage >= 1 ? existingCurrentPage : 1;

      const id = existingId || `pdf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const name = fileName.replace(/\.[^/.]+$/, '').trim() || 'Document';

      this.currentDoc = {
        id,
        name,
        fileName,
        pageCount: this.pdfProxy.numPages,
        currentPage: this.currentPageNum,
        arrayBuffer: data,
        createdAt: Date.now(),
      };

      // Pre-render the starting page
      await this.renderPage(this.currentPageNum);

      return this.currentDoc;
    } catch (err: any) {
      this.closePdf();
      if (err?.name === 'PasswordException') {
        throw new Error('This PDF is password protected.');
      }
      if (err?.name === 'InvalidPDFException') {
        throw new Error('Invalid or corrupted PDF file.');
      }
      throw new Error(`Unable to open PDF: ${err?.message || 'Unknown error'}`);
    }
  }

  /**
   * Retrieves page metadata and unscaled dimensions.
   */
  public async getPageInfo(pageNumber: number): Promise<PdfPage> {
    if (!this.pdfProxy) {
      throw new Error('No PDF document loaded.');
    }

    const page = await this.pdfProxy.getPage(pageNumber);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    return {
      pageNumber,
      width: unscaledViewport.width,
      height: unscaledViewport.height,
      aspectRatio: unscaledViewport.width / Math.max(1, unscaledViewport.height),
    };
  }

  /**
   * Renders a specific PDF page to an offscreen high-DPI canvas buffer.
   */
  public async renderPage(pageNumber: number, renderDpr: number = 2.0): Promise<HTMLCanvasElement> {
    if (!this.pdfProxy) {
      throw new Error('No PDF document loaded.');
    }

    const targetPage = Math.max(1, Math.min(this.pdfProxy.numPages, pageNumber));

    // Cancel any in-progress render task to avoid race conditions
    if (this.renderTask) {
      try {
        this.renderTask.cancel();
      } catch {
        // Ignore cancellation error
      }
      this.renderTask = null;
    }

    const page = await this.pdfProxy.getPage(targetPage);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    this.pageDimensions = {
      width: unscaledViewport.width,
      height: unscaledViewport.height,
    };

    const viewport = page.getViewport({ scale: renderDpr });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for PDF rendering.');
    }

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport,
    };

    this.renderTask = page.render(renderContext as any);
    await this.renderTask.promise;
    this.renderTask = null;

    this.renderedCanvas = canvas;
    this.currentPageNum = targetPage;

    if (this.currentDoc) {
      this.currentDoc.currentPage = targetPage;
    }

    return this.renderedCanvas;
  }

  /**
   * Returns the current rendered PDF page canvas.
   */
  public getRenderedCanvas(): HTMLCanvasElement | null {
    return this.renderedCanvas;
  }

  /**
   * Returns the active document's current page dimensions in PDF board units.
   */
  public getPageDimensions(): { width: number; height: number } | null {
    return this.pageDimensions;
  }

  /**
   * Returns the currently active document metadata.
   */
  public getCurrentDocument(): PdfDocument | null {
    return this.currentDoc;
  }

  /**
   * Returns current active page number (1-based).
   */
  public getCurrentPageNumber(): number {
    return this.currentPageNum;
  }

  /**
   * Returns total page count of loaded PDF.
   */
  public getPageCount(): number {
    return this.pdfProxy ? this.pdfProxy.numPages : 0;
  }

  /**
   * Returns whether a PDF is currently open.
   */
  public hasPdf(): boolean {
    return this.pdfProxy !== null && this.renderedCanvas !== null;
  }

  /**
   * Closes the active PDF document and frees memory.
   */
  public closePdf(): void {
    if (this.renderTask) {
      try {
        this.renderTask.cancel();
      } catch {
        // Ignore
      }
      this.renderTask = null;
    }

    if (this.pdfProxy) {
      try {
        this.pdfProxy.destroy();
      } catch {
        // Ignore
      }
      this.pdfProxy = null;
    }

    this.currentDoc = null;
    this.renderedCanvas = null;
    this.pageDimensions = null;
    this.currentPageNum = 1;
  }
}
