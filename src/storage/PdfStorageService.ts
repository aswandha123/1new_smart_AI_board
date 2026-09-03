/**
 * PdfStorageService.ts
 *
 * High-level helper for persistent PDF document and annotation storage.
 * Wraps BoardDatabase calls and keeps raw IndexedDB access contained in the
 * database layer.
 */

import { BoardDatabase } from './BoardDatabase';
import { StoredPdfDocument } from '../models/StoredPdfDocument';
import { BoardObject } from '../models/BoardObject';

export class PdfStorageService {
  private db: BoardDatabase;

  constructor() {
    this.db = new BoardDatabase();
  }

  public async savePdfDocument(doc: StoredPdfDocument): Promise<void> {
    await this.db.savePdfDocument(doc);
  }

  public async getPdfDocument(id: string): Promise<StoredPdfDocument | null> {
    return await this.db.getPdfDocument(id);
  }

  public async getPdfDocumentsForClassNote(classNoteId: string): Promise<StoredPdfDocument[]> {
    return await this.db.getPdfDocumentsForClassNote(classNoteId);
  }

  public async deletePdfDocument(id: string): Promise<void> {
    await this.db.deletePdfDocument(id);
  }

  public async savePdfAnnotations(pdfDocumentId: string, pageNumber: number, objects: BoardObject[]): Promise<void> {
    await this.db.savePdfPageAnnotations(pdfDocumentId, pageNumber, objects);
  }

  public async getPdfAnnotations(pdfDocumentId: string, pageNumber: number): Promise<BoardObject[]> {
    return await this.db.getPdfPageAnnotations(pdfDocumentId, pageNumber);
  }

  public async deletePdfAnnotations(pdfDocumentId: string, pageNumber: number): Promise<void> {
    await this.db.deletePdfPageAnnotations(pdfDocumentId, pageNumber);
  }

  public async deleteAllPdfAnnotations(pdfDocumentId: string): Promise<void> {
    await this.db.deletePdfAnnotationsForDoc(pdfDocumentId);
  }

  public async deletePdfDocumentsForClassNote(classNoteId: string): Promise<void> {
    const docs = await this.getPdfDocumentsForClassNote(classNoteId);
    for (const doc of docs) {
      await this.deleteAllPdfAnnotations(doc.id);
      await this.deletePdfDocument(doc.id);
    }
  }
}
