/**
 * ClassNote.ts
 *
 * Model representing an entire multi-page class note document with optional PDF references.
 */

import { BoardPage } from './BoardPage';

export interface ClassNote {
  id: string;
  name: string;
  pages: BoardPage[];
  currentPageId: string;
  pdfDocumentIds?: string[];
  activePdfDocumentId?: string;
  activePdfPageNumber?: number;
  createdAt: number;
  updatedAt: number;
}
