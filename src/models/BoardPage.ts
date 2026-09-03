/**
 * BoardPage.ts
 *
 * Model representing a single page within a multi-page ClassNote.
 */

import { BoardObject } from './BoardObject';

export interface PageViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface BoardPage {
  id: string;
  name: string;
  objects: BoardObject[];
  viewState?: PageViewState;
  createdAt: number;
  updatedAt: number;
}
