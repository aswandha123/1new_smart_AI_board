/**
 * PdfPage.ts
 *
 * Model representing metadata and dimensions of a single PDF page.
 */

export interface PdfPage {
  pageNumber: number;
  width: number;
  height: number;
  aspectRatio: number;
}
