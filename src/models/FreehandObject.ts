/**
 * FreehandObject.ts
 *
 * Defines the FreehandObject interface representing drawn pen, pencil, and highlighter strokes.
 */

import { BoardObject } from './BoardObject';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface FreehandObject extends BoardObject {
  type: 'freehand';

  points: Point[];

  tool: 'pen' | 'pencil' | 'highlighter';

  color: string;

  strokeWidth: number;

  opacity: number;

  initialWidth?: number;
  initialHeight?: number;
}
