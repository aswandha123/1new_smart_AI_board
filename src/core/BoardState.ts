/**
 * BoardState.ts
 *
 * The single source of truth for all board objects in the AI Smart Board.
 * Manages object lifecycle, addition, removal, queries, and change notifications.
 */

import { BoardObject } from '../models/BoardObject';

export type BoardStateChangeListener = (objects: readonly BoardObject[]) => void;

export class BoardState {
  private objects: BoardObject[] = [];
  private listeners: BoardStateChangeListener[] = [];

  constructor(initialObjects: BoardObject[] = []) {
    this.objects = [...initialObjects];
  }

  /**
   * Adds a new board object to the state.
   *
   * @param object - The BoardObject to add
   */
  public addObject(object: BoardObject): void {
    this.objects.push(object);
    this.notifyListeners();
  }

  /**
   * Removes an object by its unique ID.
   *
   * @param id - The unique ID of the object to remove
   * @returns true if found and removed, false otherwise
   */
  public removeObject(id: string): boolean {
    const initialLength = this.objects.length;
    this.objects = this.objects.filter((obj) => obj.id !== id);
    const removed = this.objects.length < initialLength;
    if (removed) {
      this.notifyListeners();
    }
    return removed;
  }

  /**
   * Retrieves an object by ID.
   *
   * @param id - The unique ID
   * @returns The BoardObject if found, undefined otherwise
   */
  public getObject(id: string): BoardObject | undefined {
    return this.objects.find((obj) => obj.id === id);
  }

  /**
   * Returns a safe shallow copy of all board objects.
   */
  public getObjects(): readonly BoardObject[] {
    return [...this.objects];
  }

  /**
   * Replaces all objects in state (used by Undo/Redo operations).
   *
   * @param objects - Array of BoardObjects to set
   */
  public setObjects(objects: BoardObject[]): void {
    this.objects = [...objects];
    this.notifyListeners();
  }

  /**
   * Clears all objects from the board.
   */
  public clear(): void {
    this.objects = [];
    this.notifyListeners();
  }

  /**
   * Subscribes a listener to state changes.
   */
  public onChange(listener: BoardStateChangeListener): void {
    this.listeners.push(listener);
  }

  private notifyListeners(): void {
    const readonlyList = this.getObjects();
    for (const listener of this.listeners) {
      listener(readonlyList);
    }
  }
}
