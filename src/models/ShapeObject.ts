/**
 * ShapeObject.ts
 *
 * Model representing 2D geometric shapes (Rectangle, Ellipse, Triangle) on the AI Smart Board.
 */

import { BoardObject } from './BoardObject';

export type ShapeType = 'rectangle' | 'ellipse' | 'triangle';

export interface ShapeObject extends BoardObject {
  type: 'shape';
  shapeType: ShapeType;
  color: string;
  strokeWidth: number;
  opacity: number;
  fill?: boolean;
  fillColor?: string;
}
