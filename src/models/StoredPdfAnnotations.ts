/**
 * StoredPdfAnnotations.ts
 *
 * Data model for persistent page-specific PDF annotations stored in IndexedDB.
 */

import { BoardObject } from './BoardObject';

export interface StoredPdfAnnotations {
  id: string; // Key format: `${pdfDocumentId}-page-${pageNumber}`
  pdfDocumentId: string;
  pageNumber: number;
  objects: BoardObject[];
  updatedAt: number;
}
