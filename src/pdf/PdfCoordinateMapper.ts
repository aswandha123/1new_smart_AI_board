/**
 * PdfCoordinateMapper.ts
 *
 * Provides bidirectional coordinate transformation between screen pixel space
 * (Pointer Events) and PDF page space via ViewTransform (zoom + pan + DPR).
 */

import { ViewTransform } from '../canvas/ViewTransform';

export interface Point2D {
  x: number;
  y: number;
}

export class PdfCoordinateMapper {
  /**
   * Transforms screen pointer coordinates (relative to canvas element)
   * to PDF page coordinates.
   */
  public static screenToPdf(
    screenPoint: Point2D,
    viewTransform: ViewTransform
  ): Point2D {
    return viewTransform.screenToBoard(screenPoint.x, screenPoint.y);
  }

  /**
   * Transforms PDF page coordinates to screen pixel coordinates.
   */
  public static pdfToScreen(
    pdfPoint: Point2D,
    viewTransform: ViewTransform
  ): Point2D {
    return viewTransform.boardToScreen(pdfPoint.x, pdfPoint.y);
  }

  /**
   * Checks whether a point in PDF page coordinates lies within the bounds
   * of the active PDF page dimensions.
   */
  public static isPointInsidePdf(
    pdfPoint: Point2D,
    dimensions: { width: number; height: number }
  ): boolean {
    return (
      pdfPoint.x >= 0 &&
      pdfPoint.x <= dimensions.width &&
      pdfPoint.y >= 0 &&
      pdfPoint.y <= dimensions.height
    );
  }
}
