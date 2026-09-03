/**
 * BoardObject.ts
 *
 * Defines the core BoardObject interface and BoardObjectType union.
 * Serves as the fundamental unit of data in the Board Object Model.
 */

export type BoardObjectType =
  | 'freehand'
  | 'text'
  | 'shape'
  | 'line'
  | 'arrow'
  | 'equation'
  | 'graph'
  | 'circuit'
  | 'wire'
  | 'logic_gate'
  | 'image'
  | 'simulation'
  | 'code';

export interface BoardObject {
  id: string;
  type: BoardObjectType;

  x: number;
  y: number;

  width: number;
  height: number;

  rotation: number;

  visible: boolean;
  locked: boolean;

  createdAt: number;
  updatedAt: number;
}
