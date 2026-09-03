/**
 * HistoryManager.ts
 *
 * Manages Undo and Redo operations using BoardObject state snapshots.
 * The BoardState is the source of truth; HistoryManager records structured state transitions.
 */

import { BoardObject } from '../models/BoardObject';

export interface HistoryChangeListener {
  (canUndo: boolean, canRedo: boolean): void;
}

export class HistoryManager {
  private undoStack: BoardObject[][] = [];
  private redoStack: BoardObject[][] = [];
  private currentState: BoardObject[] = [];
  private maxHistory: number = 50;
  private listeners: HistoryChangeListener[] = [];

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  /**
   * Helper to create a deep clone of board object states.
   */
  private cloneState(objects: readonly BoardObject[]): BoardObject[] {
    return JSON.parse(JSON.stringify(objects));
  }

  /**
   * Initializes history with the initial board state.
   */
  public init(initialObjects: readonly BoardObject[] = []): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentState = this.cloneState(initialObjects);
    this.notifyListeners();
  }

  /**
   * Records a completed board action (e.g. stroke completed, eraser stroke ended, board cleared).
   *
   * @param currentObjects - Current array of BoardObjects in BoardState
   */
  public recordAction(currentObjects: readonly BoardObject[]): void {
    const newState = this.cloneState(currentObjects);

    this.undoStack.push(this.currentState);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.currentState = newState;
    // Clear redo history when a new action is committed
    this.redoStack = [];

    this.notifyListeners();
  }

  /**
   * Undoes the last action and returns the previous state to restore.
   */
  public undo(): BoardObject[] | null {
    if (this.undoStack.length === 0) {
      return null;
    }

    this.redoStack.push(this.currentState);
    const previousState = this.undoStack.pop()!;
    this.currentState = previousState;

    this.notifyListeners();
    return this.cloneState(this.currentState);
  }

  /**
   * Redoes the next action and returns the state to restore.
   */
  public redo(): BoardObject[] | null {
    if (this.redoStack.length === 0) {
      return null;
    }

    this.undoStack.push(this.currentState);
    const nextState = this.redoStack.pop()!;
    this.currentState = nextState;

    this.notifyListeners();
    return this.cloneState(this.currentState);
  }

  /**
   * Returns whether undo is available.
   */
  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Returns whether redo is available.
   */
  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Subscribes a listener to history state changes (canUndo, canRedo).
   */
  public onChange(listener: HistoryChangeListener): void {
    this.listeners.push(listener);
    listener(this.canUndo(), this.canRedo());
  }

  /**
   * Notifies all listeners of current undo/redo availability.
   */
  private notifyListeners(): void {
    const canUndoState = this.canUndo();
    const canRedoState = this.canRedo();
    for (const listener of this.listeners) {
      listener(canUndoState, canRedoState);
    }
  }
}
