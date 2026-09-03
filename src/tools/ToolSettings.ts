/**
 * ToolSettings.ts
 *
 * Defines the configuration settings for each drawing tool.
 */

import { DrawingTool } from './DrawingTool';

export interface ToolSettings {
  tool: DrawingTool;
  color: string;
  width: number;
  opacity: number;
}
