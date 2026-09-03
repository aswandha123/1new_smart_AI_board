/**
 * LineObject.ts
 *
 * Model representing straight line segments on the AI Smart Board.
 */

import { BoardObject } from './BoardObject';

export interface LineObject extends BoardObject {
  type: 'line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  strokeWidth: number;
  opacity: number;
}
