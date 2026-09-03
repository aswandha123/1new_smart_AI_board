/**
 * ArrowObject.ts
 *
 * Model representing directional arrows on the AI Smart Board.
 */

import { BoardObject } from './BoardObject';

export interface ArrowObject extends BoardObject {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  strokeWidth: number;
  opacity: number;
  arrowHeadSize?: number;
}
