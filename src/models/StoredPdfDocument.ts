/**
 * StoredPdfDocument.ts
 *
 * Data model for a persistent PDF document record stored in IndexedDB.
 * Holds binary Blob content separately from ClassNote metadata.
 */

export interface StoredPdfDocument {
  id: string;
  classNoteId: string;
  name: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
  fileBlob: Blob;
  createdAt: number;
  updatedAt: number;
}
