/**
 * ClassNoteManager.ts
 *
 * Coordinates multi-page class notes, page lifecycle (create, duplicate, delete,
 * rename, reorder, switch), per-page isolated undo/redo history, and view states.
 */

import { ClassNote } from '../models/ClassNote';
import { BoardPage, PageViewState } from '../models/BoardPage';
import { BoardObject } from '../models/BoardObject';
import { HistoryManager } from '../history/HistoryManager';

export class ClassNoteManager {
  private note: ClassNote;
  private pageHistories: Map<string, HistoryManager> = new Map();
  private listeners: (() => void)[] = [];

  constructor(initialNote?: ClassNote) {
    if (initialNote && initialNote.pages.length > 0) {
      this.note = initialNote;
    } else {
      this.note = this.createDefaultNote();
    }
  }

  /**
   * Generates a unique ID for notes, pages, or duplicated objects.
   */
  public generateId(prefix: string = 'id'): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Creates a fresh blank ClassNote structure with 1 initial page.
   */
  public createDefaultNote(name: string = 'Untitled Class Note'): ClassNote {
    const now = Date.now();
    const initialPageId = this.generateId('page');
    const initialPage: BoardPage = {
      id: initialPageId,
      name: 'Page 1',
      objects: [],
      viewState: { zoom: 1, panX: 0, panY: 0 },
      createdAt: now,
      updatedAt: now,
    };

    return {
      id: this.generateId('note'),
      name: name.trim() || 'Untitled Class Note',
      pages: [initialPage],
      currentPageId: initialPageId,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Loads a ClassNote into the manager, initializing per-page history stacks.
   */
  public setClassNote(note: ClassNote): void {
    this.note = note;
    this.pageHistories.clear();

    if (this.note.pages.length === 0) {
      const page = this.createNewPage('Page 1');
      this.note.currentPageId = page.id;
    } else if (!this.note.pages.some((p) => p.id === this.note.currentPageId)) {
      this.note.currentPageId = this.note.pages[0].id;
    }

    for (const page of this.note.pages) {
      const history = new HistoryManager();
      history.init(page.objects);
      this.pageHistories.set(page.id, history);
    }

    this.notify();
  }

  /**
   * Returns the current ClassNote document structure.
   */
  public getClassNote(): ClassNote {
    return this.note;
  }

  /**
   * Returns the active BoardPage.
   */
  public getCurrentPage(): BoardPage {
    const page = this.note.pages.find((p) => p.id === this.note.currentPageId);
    if (!page) {
      return this.note.pages[0];
    }
    return page;
  }

  /**
   * Returns the 0-based index of the currently active page.
   */
  public getCurrentPageIndex(): number {
    const idx = this.note.pages.findIndex((p) => p.id === this.note.currentPageId);
    return idx !== -1 ? idx : 0;
  }

  /**
   * Returns the total count of pages in the class note.
   */
  public getTotalPages(): number {
    return this.note.pages.length;
  }

  /**
   * Returns the list of all pages in document order.
   */
  public getPages(): readonly BoardPage[] {
    return this.note.pages;
  }

  /**
   * Retrieves a page by its ID.
   */
  public getPage(id: string): BoardPage | undefined {
    return this.note.pages.find((p) => p.id === id);
  }

  /**
   * Returns the isolated HistoryManager for a given page.
   */
  public getHistoryForPage(pageId: string, initialObjects: readonly BoardObject[] = []): HistoryManager {
    let history = this.pageHistories.get(pageId);
    if (!history) {
      history = new HistoryManager();
      history.init(initialObjects);
      this.pageHistories.set(pageId, history);
    }
    return history;
  }

  /**
   * Synchronizes current runtime BoardState objects into the active page.
   */
  public syncCurrentPageObjects(objects: readonly BoardObject[], viewState?: PageViewState): void {
    const page = this.getCurrentPage();
    page.objects = JSON.parse(JSON.stringify(objects));
    if (viewState) {
      page.viewState = { ...viewState };
    }
    page.updatedAt = Date.now();
    this.note.updatedAt = Date.now();
  }

  /**
   * Creates a new empty page immediately following the current page.
   */
  public createNewPage(name?: string, currentBoardObjects?: readonly BoardObject[], currentViewState?: PageViewState): BoardPage {
    if (currentBoardObjects) {
      this.syncCurrentPageObjects(currentBoardObjects, currentViewState);
    }

    const now = Date.now();
    const newPageId = this.generateId('page');
    const pageNum = this.note.pages.length + 1;
    const pageName = name?.trim() || `Page ${pageNum}`;

    const newPage: BoardPage = {
      id: newPageId,
      name: pageName,
      objects: [],
      viewState: { zoom: 1, panX: 0, panY: 0 },
      createdAt: now,
      updatedAt: now,
    };

    const currentIdx = this.getCurrentPageIndex();
    this.note.pages.splice(currentIdx + 1, 0, newPage);
    this.note.currentPageId = newPageId;
    this.note.updatedAt = now;

    // Initialize fresh history for the new page
    const history = new HistoryManager();
    history.init([]);
    this.pageHistories.set(newPageId, history);

    this.notify();
    return newPage;
  }

  /**
   * Duplicates the current page and all of its objects with new IDs.
   */
  public duplicateCurrentPage(currentBoardObjects: readonly BoardObject[], currentViewState?: PageViewState): BoardPage {
    this.syncCurrentPageObjects(currentBoardObjects, currentViewState);
    const srcPage = this.getCurrentPage();
    const now = Date.now();

    // Deep copy objects and generate unique IDs for every cloned object
    const clonedObjects: BoardObject[] = JSON.parse(JSON.stringify(srcPage.objects)).map((obj: BoardObject) => {
      obj.id = this.generateId('obj');
      obj.createdAt = now;
      obj.updatedAt = now;
      return obj;
    });

    const newPageId = this.generateId('page');
    const newPage: BoardPage = {
      id: newPageId,
      name: `${srcPage.name} (Copy)`,
      objects: clonedObjects,
      viewState: srcPage.viewState ? { ...srcPage.viewState } : { zoom: 1, panX: 0, panY: 0 },
      createdAt: now,
      updatedAt: now,
    };

    const currentIdx = this.getCurrentPageIndex();
    this.note.pages.splice(currentIdx + 1, 0, newPage);
    this.note.currentPageId = newPageId;
    this.note.updatedAt = now;

    const history = new HistoryManager();
    history.init(clonedObjects);
    this.pageHistories.set(newPageId, history);

    this.notify();
    return newPage;
  }

  /**
   * Deletes a page by ID (disallowed if only 1 page remains).
   */
  public deletePage(pageId: string): boolean {
    if (this.note.pages.length <= 1) {
      return false;
    }

    const idx = this.note.pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return false;

    this.note.pages.splice(idx, 1);
    this.pageHistories.delete(pageId);

    // If active page was deleted, switch to adjacent page
    if (this.note.currentPageId === pageId) {
      const nextIdx = Math.min(idx, this.note.pages.length - 1);
      this.note.currentPageId = this.note.pages[nextIdx].id;
    }

    this.note.updatedAt = Date.now();
    this.notify();
    return true;
  }

  /**
   * Renames a specific page.
   */
  public renamePage(pageId: string, newName: string): void {
    const page = this.getPage(pageId);
    if (page) {
      page.name = newName.trim() || `Page ${this.getCurrentPageIndex() + 1}`;
      page.updatedAt = Date.now();
      this.note.updatedAt = Date.now();
      this.notify();
    }
  }

  /**
   * Switches to another page by ID after synchronizing current board content.
   */
  public switchToPage(
    targetPageId: string,
    currentBoardObjects: readonly BoardObject[],
    currentViewState?: PageViewState
  ): { previousPageId: string; nextPage: BoardPage } | null {
    if (targetPageId === this.note.currentPageId) return null;

    const targetPage = this.getPage(targetPageId);
    if (!targetPage) return null;

    const previousPageId = this.note.currentPageId;
    this.syncCurrentPageObjects(currentBoardObjects, currentViewState);

    this.note.currentPageId = targetPageId;
    this.note.updatedAt = Date.now();
    this.notify();

    return {
      previousPageId,
      nextPage: targetPage,
    };
  }

  /**
   * Switches to the previous page if not already at the first page.
   */
  public prevPage(currentBoardObjects: readonly BoardObject[], currentViewState?: PageViewState): BoardPage | null {
    const currentIdx = this.getCurrentPageIndex();
    if (currentIdx <= 0) return null;

    const targetPage = this.note.pages[currentIdx - 1];
    this.switchToPage(targetPage.id, currentBoardObjects, currentViewState);
    return targetPage;
  }

  /**
   * Switches to the next page if not already at the last page.
   */
  public nextPage(currentBoardObjects: readonly BoardObject[], currentViewState?: PageViewState): BoardPage | null {
    const currentIdx = this.getCurrentPageIndex();
    if (currentIdx >= this.note.pages.length - 1) return null;

    const targetPage = this.note.pages[currentIdx + 1];
    this.switchToPage(targetPage.id, currentBoardObjects, currentViewState);
    return targetPage;
  }

  /**
   * Subscribes to page structure and active page changes.
   */
  public onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[ClassNoteManager] Error in change listener:', err);
      }
    }
  }
}
