/**
 * PdfDocument.ts
 *
 * Model representing an active PDF document in the Smart Board session.
 */

export interface PdfDocument {
  id: string;
  name: string;
  fileName: string;
  pageCount: number;
  currentPage: number;
  arrayBuffer?: ArrayBuffer;
  createdAt: number;
}
