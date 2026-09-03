/**
 * EquationObject.ts
 *
 * Model representing mathematical equations on the AI Smart Board.
 */

import { BoardObject } from './BoardObject';

export interface EquationObject extends BoardObject {
  type: 'equation';
  latex: string;
  color: string;
  fontSize: number;
  opacity: number;
}
