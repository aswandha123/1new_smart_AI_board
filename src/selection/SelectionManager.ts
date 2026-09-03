/**
 * SelectionManager.ts
 *
 * Manages transient selection state for the AI Smart Board.
 * Keeps selection completely separate from BoardState.
 * Supports both single-object selection and multi-object selection.
 */

export type SelectionChangeListener = (selectedIds: readonly string[]) => void;

export class SelectionManager {
  private selectedIds: Set<string> = new Set();
  private listeners: SelectionChangeListener[] = [];

  /**
   * Replaces the current selection with a single object ID, or clears selection if id is null.
   *
   * @param id - The ID of the BoardObject to select, or null to deselect.
   */
  public select(id: string | null): void {
    if (id === null) {
      this.clearSelection();
      return;
    }

    if (this.selectedIds.size === 1 && this.selectedIds.has(id)) {
      return;
    }

    this.selectedIds.clear();
    this.selectedIds.add(id);
    this.notifyListeners();
  }

  /**
   * Sets the selection to the specified array of object IDs.
   *
   * @param ids - Array of object IDs to select
   */
  public setSelectedIds(ids: string[]): void {
    this.selectedIds = new Set(ids);
    this.notifyListeners();
  }

  /**
   * Adds an object ID to the current selection.
   *
   * @param id - Object ID to add
   */
  public addToSelection(id: string): void {
    if (!this.selectedIds.has(id)) {
      this.selectedIds.add(id);
      this.notifyListeners();
    }
  }

  /**
   * Removes an object ID from the current selection.
   *
   * @param id - Object ID to remove
   */
  public removeFromSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      this.notifyListeners();
    }
  }

  /**
   * Toggles selection state of an object ID (adds if absent, removes if present).
   *
   * @param id - Object ID to toggle
   */
  public toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.notifyListeners();
  }

  /**
   * Clears the current selection.
   */
  public clearSelection(): void {
    if (this.selectedIds.size > 0) {
      this.selectedIds.clear();
      this.notifyListeners();
    }
  }

  /**
   * Alias for clearSelection()
   */
  public deselect(): void {
    this.clearSelection();
  }

  /**
   * Alias for clearSelection()
   */
  public clear(): void {
    this.clearSelection();
  }

  /**
   * Returns all currently selected object IDs.
   */
  public getSelectedIds(): readonly string[] {
    return Array.from(this.selectedIds);
  }

  /**
   * Convenience getter: Returns the first selected object ID, or null if nothing is selected.
   */
  public getSelectedId(): string | null {
    if (this.selectedIds.size === 0) return null;
    return this.selectedIds.values().next().value || null;
  }

  /**
   * Checks whether at least one object is currently selected.
   */
  public hasSelection(): boolean {
    return this.selectedIds.size > 0;
  }

  /**
   * Returns the count of currently selected objects.
   */
  public getCount(): number {
    return this.selectedIds.size;
  }

  /**
   * Checks whether a specific object ID is selected.
   *
   * @param id - Object ID to test
   */
  public isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  /**
   * Subscribes a listener to selection state changes.
   *
   * @param listener - Callback invoked when selection changes
   */
  public onChange(listener: SelectionChangeListener): void {
    this.listeners.push(listener);
    listener(this.getSelectedIds());
  }

  private notifyListeners(): void {
    const list = this.getSelectedIds();
    for (const listener of this.listeners) {
      listener(list);
    }
  }
}
