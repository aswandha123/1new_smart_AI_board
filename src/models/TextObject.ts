/**
 * TextObject.ts
 *
 * Model representing multiline text elements on the AI Smart Board.
 */

import { BoardObject } from './BoardObject';

export type TextAlign = 'left' | 'center' | 'right';

export interface TextObject extends BoardObject {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  opacity: number;
  textAlign: TextAlign;
}
