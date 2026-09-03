/**
 * CircuitComponentObject.ts
 *
 * Model representing a simplified circuit board component for AI recognition output.
 */

import { BoardObject } from './BoardObject';

export interface CircuitComponentObject extends BoardObject {
  type: 'circuit';
  label: string;
  componentType: string;
  color: string;
  opacity: number;
}
