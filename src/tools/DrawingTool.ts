/**
 * DrawingTool.ts
 *
 * Defines the supported drawing and creation tools for the AI Smart Board.
 */

export type ShapeType = 'rectangle' | 'ellipse' | 'triangle';

export type DrawingTool =
  | 'pen'
  | 'pencil'
  | 'highlighter'
  | 'eraser'
  | 'select'
  | 'lasso'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'equation';
