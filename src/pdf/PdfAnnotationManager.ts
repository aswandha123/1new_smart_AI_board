/**
 * PdfAnnotationManager.ts
 *
 * Dedicated state management service for managing BoardObjects associated
 * with specific PDF document pages. Maintains in-memory page collections,
 * supports CRUD operations per PDF page, and integrates with BoardStorageService.
 */

import { BoardObject } from '../models/BoardObject';
import { PdfPageAnnotations } from '../models/PdfPageAnnotations';

export class PdfAnnotationManager {
  private annotationsMap: Map<string, BoardObject[]> = new Map();
  private activePdfDocumentId: string | null = null;
  private activePageNumber: number = 1;

  /**
   * Helper to construct unique lookup key for a PDF document page.
   */
  private makeKey(pdfDocumentId: string, pageNumber: number): string {
    return `${pdfDocumentId}-page-${pageNumber}`;
  }

  /**
   * Sets the active PDF document ID and current page number.
   */
  public setActivePage(pdfDocumentId: string, pageNumber: number): void {
    this.activePdfDocumentId = pdfDocumentId;
    this.activePageNumber = pageNumber;
    const key = this.makeKey(pdfDocumentId, pageNumber);
    if (!this.annotationsMap.has(key)) {
      this.annotationsMap.set(key, []);
    }
  }

  /**
   * Returns active PDF document ID or null.
   */
  public getActivePdfDocumentId(): string | null {
    return this.activePdfDocumentId;
  }

  /**
   * Returns active page number.
   */
  public getActivePageNumber(): number {
    return this.activePageNumber;
  }

  /**
   * Retrieves all BoardObjects associated with a specific PDF page.
   */
  public getPageAnnotations(pdfDocumentId: string, pageNumber: number): BoardObject[] {
    const key = this.makeKey(pdfDocumentId, pageNumber);
    const objs = this.annotationsMap.get(key);
    return objs ? [...objs] : [];
  }

  /**
   * Retrieves annotations for the currently active PDF page.
   */
  public getActivePageAnnotations(): BoardObject[] {
    if (!this.activePdfDocumentId) return [];
    return this.getPageAnnotations(this.activePdfDocumentId, this.activePageNumber);
  }

  /**
   * Replaces all annotations for a specific PDF page.
   */
  public setPageAnnotations(
    pdfDocumentId: string,
    pageNumber: number,
    objects: readonly BoardObject[]
  ): void {
    const key = this.makeKey(pdfDocumentId, pageNumber);
    this.annotationsMap.set(key, [...objects]);
  }

  /**
   * Updates active PDF page annotations.
   */
  public setActivePageAnnotations(objects: readonly BoardObject[]): void {
    if (!this.activePdfDocumentId) return;
    this.setPageAnnotations(this.activePdfDocumentId, this.activePageNumber, objects);
  }

  /**
   * Adds a new annotation BoardObject to a specific PDF page.
   */
  public addAnnotation(pdfDocumentId: string, pageNumber: number, object: BoardObject): void {
    const key = this.makeKey(pdfDocumentId, pageNumber);
    const list = this.annotationsMap.get(key) || [];
    list.push(object);
    this.annotationsMap.set(key, list);
  }

  /**
   * Updates an existing annotation by ID on a specific PDF page.
   */
  public updateAnnotation(pdfDocumentId: string, pageNumber: number, object: BoardObject): void {
    const key = this.makeKey(pdfDocumentId, pageNumber);
    const list = this.annotationsMap.get(key) || [];
    const idx = list.findIndex((o) => o.id === object.id);
    if (idx !== -1) {
      list[idx] = object;
      this.annotationsMap.set(key, list);
    }
  }

  /**
   * Deletes an annotation by ID from a specific PDF page.
   */
  public deleteAnnotation(pdfDocumentId: string, pageNumber: number, id: string): void {
    const key = this.makeKey(pdfDocumentId, pageNumber);
    const list = this.annotationsMap.get(key) || [];
    this.annotationsMap.set(
      key,
      list.filter((obj) => obj.id !== id)
    );
  }

  /**
   * Clears all annotations ONLY for the specified PDF page.
   */
  public clearPageAnnotations(pdfDocumentId: string, pageNumber: number): void {
    const key = this.makeKey(pdfDocumentId, pageNumber);
    this.annotationsMap.set(key, []);
  }

  /**
   * Clears annotations for the currently active PDF page.
   */
  public clearActivePageAnnotations(): void {
    if (!this.activePdfDocumentId) return;
    this.clearPageAnnotations(this.activePdfDocumentId, this.activePageNumber);
  }

  /**
   * Returns whether a specific PDF page has any annotations.
   */
  public hasPageAnnotations(pdfDocumentId: string, pageNumber: number): boolean {
    const list = this.getPageAnnotations(pdfDocumentId, pageNumber);
    return list.length > 0;
  }

  /**
   * Returns list of page numbers that have annotations for a PDF document.
   */
  public getAnnotatedPageNumbers(pdfDocumentId: string): number[] {
    const result: number[] = [];
    const prefix = `${pdfDocumentId}-page-`;
    for (const [key, objs] of this.annotationsMap.entries()) {
      if (key.startsWith(prefix) && objs.length > 0) {
        const pageNumStr = key.substring(prefix.length);
        const pageNum = parseInt(pageNumStr, 10);
        if (!isNaN(pageNum)) {
          result.push(pageNum);
        }
      }
    }
    return result.sort((a, b) => a - b);
  }

  /**
   * Resets all in-memory annotations for all PDF documents.
   */
  public clearAll(): void {
    this.annotationsMap.clear();
    this.activePdfDocumentId = null;
    this.activePageNumber = 1;
  }

  /**
   * Exports document page annotations structure array for serialization.
   */
  public exportDocumentAnnotations(pdfDocumentId: string): PdfPageAnnotations[] {
    const result: PdfPageAnnotations[] = [];
    const prefix = `${pdfDocumentId}-page-`;
    for (const [key, objs] of this.annotationsMap.entries()) {
      if (key.startsWith(prefix)) {
        const pageNum = parseInt(key.substring(prefix.length), 10);
        if (!isNaN(pageNum)) {
          result.push({
            pdfDocumentId,
            pageNumber: pageNum,
            objects: [...objs],
          });
        }
      }
    }
    return result;
  }

  /**
   * Imports document page annotations structure array.
   */
  public importDocumentAnnotations(annotations: PdfPageAnnotations[]): void {
    for (const item of annotations) {
      if (item && item.pdfDocumentId && typeof item.pageNumber === 'number' && Array.isArray(item.objects)) {
        this.setPageAnnotations(item.pdfDocumentId, item.pageNumber, item.objects);
      }
    }
  }
}
