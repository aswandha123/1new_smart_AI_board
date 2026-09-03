/**
 * ClipboardManager.ts
 *
 * In-memory clipboard manager for copying and pasting single or multiple BoardObjects.
 * Provides deep cloning to ensure copied objects are completely isolated from source objects.
 */

import { BoardObject } from '../models/BoardObject';

export type ClipboardChangeListener = (hasItem: boolean) => void;

export class ClipboardManager {
  private items: BoardObject[] = [];
  private listeners: ClipboardChangeListener[] = [];

  /**
   * Stores deep clones of the given BoardObject(s) in memory.
   *
   * @param objects - A single BoardObject or array of BoardObjects to copy
   */
  public copy(objects: BoardObject | BoardObject[]): void {
    const list = Array.isArray(objects) ? objects : [objects];
    this.items = list.map((obj) => this.deepClone(obj));
    this.notifyListeners();
  }

  /**
   * Checks whether the clipboard currently holds any objects.
   */
  public hasObject(): boolean {
    return this.items.length > 0;
  }

  /**
   * Alias for hasObject()
   */
  public hasObjects(): boolean {
    return this.items.length > 0;
  }

  /**
   * Returns fresh deep clones of all copied objects.
   */
  public getObjects(): BoardObject[] {
    return this.items.map((item) => this.deepClone(item));
  }

  /**
   * Returns a fresh deep clone of the first copied object, or null if clipboard is empty.
   */
  public getObject(): BoardObject | null {
    if (this.items.length === 0) return null;
    return this.deepClone(this.items[0]);
  }

  /**
   * Clears the clipboard.
   */
  public clear(): void {
    if (this.items.length > 0) {
      this.items = [];
      this.notifyListeners();
    }
  }

  /**
   * Subscribes a listener to clipboard state changes.
   */
  public onChange(listener: ClipboardChangeListener): void {
    this.listeners.push(listener);
    listener(this.hasObject());
  }

  private notifyListeners(): void {
    const has = this.hasObject();
    for (const listener of this.listeners) {
      listener(has);
    }
  }

  /**
   * Safely deep clones a BoardObject using structuredClone if available,
   * with fallback to JSON serialization.
   */
  private deepClone<T extends BoardObject>(obj: T): T {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(obj);
      } catch {
        // Fallback below
      }
    }
    return JSON.parse(JSON.stringify(obj)) as T;
  }
}
