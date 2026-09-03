/**
 * PdfPageAnnotations.ts
 *
 * Data model representing all BoardObjects created on a specific PDF page.
 */

import { BoardObject } from './BoardObject';

export interface PdfPageAnnotations {
  pdfDocumentId: string;
  pageNumber: number;
  objects: BoardObject[];
}
