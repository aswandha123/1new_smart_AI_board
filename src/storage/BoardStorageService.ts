/**
 * BoardStorageService.ts
 *
 * High-level business logic service coordinating ClassNote document persistence,
 * multi-page serialization, auto-saving, listing, and validation with BoardDatabase.
 */

import { BoardDatabase, StoredBoard, StoredBoardSummary } from './BoardDatabase';
import { ClassNote } from '../models/ClassNote';
import { BoardPage } from '../models/BoardPage';
import { BoardObject } from '../models/BoardObject';
import { PdfPageAnnotations } from '../models/PdfPageAnnotations';
import { PdfStorageService } from './PdfStorageService';

export class BoardStorageService {
  private db: BoardDatabase;
  private pdfStorage: PdfStorageService;
  private static readonly META_LAST_NOTE = 'last_opened_board_id';

  constructor() {
    this.db = new BoardDatabase();
    this.pdfStorage = new PdfStorageService();
  }

  /**
   * Generates a new unique Document or Page ID.
   */
  public generateId(prefix: string = 'id'): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Creates a new blank ClassNote structure.
   */
  public createNewClassNote(name: string = 'Untitled Class Note'): ClassNote {
    const now = Date.now();
    const pageId = this.generateId('page');
    return {
      id: this.generateId('note'),
      name: name.trim() || 'Untitled Class Note',
      pages: [
        {
          id: pageId,
          name: 'Page 1',
          objects: [],
          viewState: { zoom: 1, panX: 0, panY: 0 },
          createdAt: now,
          updatedAt: now,
        },
      ],
      currentPageId: pageId,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Saves the entire multi-page ClassNote to IndexedDB.
   */
  public async saveClassNote(note: ClassNote): Promise<StoredBoard> {
    const now = Date.now();
    const sanitizedPages: BoardPage[] = note.pages.map((p, idx) => {
      const validObjects = Array.isArray(p.objects)
        ? p.objects.filter((obj) => this.isValidBoardObject(obj))
        : [];

      return {
        id: p.id || this.generateId('page'),
        name: p.name?.trim() || `Page ${idx + 1}`,
        objects: JSON.parse(JSON.stringify(validObjects)),
        viewState: p.viewState ? { ...p.viewState } : { zoom: 1, panX: 0, panY: 0 },
        createdAt: p.createdAt || now,
        updatedAt: now,
      };
    });

    const storedBoard: StoredBoard = {
      id: note.id,
      name: (note.name || 'Untitled Class Note').trim(),
      pages: sanitizedPages,
      currentPageId: note.currentPageId || sanitizedPages[0]?.id,
      pdfDocumentIds: Array.isArray(note.pdfDocumentIds) ? [...note.pdfDocumentIds] : undefined,
      activePdfDocumentId: typeof note.activePdfDocumentId === 'string' ? note.activePdfDocumentId : undefined,
      activePdfPageNumber: typeof note.activePdfPageNumber === 'number' ? note.activePdfPageNumber : undefined,
      createdAt: note.createdAt || now,
      updatedAt: now,
    };

    await this.db.saveBoard(storedBoard);
    await this.setLastOpenedNoteId(note.id);
    return storedBoard;
  }

  /**
   * Loads a ClassNote by ID from IndexedDB with schema validation and legacy migration.
   */
  public async loadClassNote(id: string): Promise<ClassNote | null> {
    const rawBoard = await this.db.getBoard(id);
    if (!rawBoard) return null;

    const validated = this.validateBoard(rawBoard);
    if (!validated) return null;

    return {
      id: validated.id,
      name: validated.name,
      pages: validated.pages,
      currentPageId: validated.currentPageId || validated.pages[0]?.id || this.generateId('page'),
      pdfDocumentIds: Array.isArray(validated.pdfDocumentIds) ? [...validated.pdfDocumentIds] : undefined,
      activePdfDocumentId: typeof validated.activePdfDocumentId === 'string' ? validated.activePdfDocumentId : undefined,
      activePdfPageNumber: typeof validated.activePdfPageNumber === 'number' ? validated.activePdfPageNumber : undefined,
      createdAt: validated.createdAt,
      updatedAt: validated.updatedAt,
    };
  }

  /**
   * Returns a list of all saved documents as summaries with page and object counts.
   */
  public async listBoards(): Promise<StoredBoardSummary[]> {
    const boards = await this.db.getAllBoards();
    return boards.map((b) => {
      let pageCount = 1;
      let totalObjects = 0;

      if (Array.isArray(b.pages) && b.pages.length > 0) {
        pageCount = b.pages.length;
        totalObjects = b.pages.reduce((acc, p) => acc + (Array.isArray(p.objects) ? p.objects.length : 0), 0);
      } else if (Array.isArray(b.objects)) {
        totalObjects = b.objects.length;
      }

      return {
        id: b.id,
        name: b.name || 'Untitled Class Note',
        pageCount,
        objectCount: totalObjects,
        createdAt: b.createdAt || Date.now(),
        updatedAt: b.updatedAt || Date.now(),
      };
    });
  }

  /**
   * Deletes a document by ID from IndexedDB.
   */
  public async deleteBoard(id: string): Promise<void> {
    await this.pdfStorage.deletePdfDocumentsForClassNote(id);
    await this.db.deleteBoard(id);
    const lastOpened = await this.getLastOpenedNoteId();
    if (lastOpened === id) {
      await this.db.setMeta(BoardStorageService.META_LAST_NOTE, null);
    }
  }

  /**
   * Retrieves the ID of the last opened note document.
   */
  public async getLastOpenedNoteId(): Promise<string | null> {
    try {
      return await this.db.getMeta(BoardStorageService.META_LAST_NOTE);
    } catch {
      return null;
    }
  }

  /**
   * Stores the ID of the last opened note document.
   */
  public async setLastOpenedNoteId(id: string): Promise<void> {
    try {
      await this.db.setMeta(BoardStorageService.META_LAST_NOTE, id);
    } catch (err) {
      console.warn('[BoardStorageService] Failed to record last opened note ID:', err);
    }
  }

  /**
   * Validates and sanitizes a raw StoredBoard object, seamlessly migrating legacy single-page data.
   */
  public validateBoard(data: any): StoredBoard | null {
    if (!data || typeof data !== 'object') {
      console.warn('[BoardStorageService] Malformed document data (not an object):', data);
      return null;
    }

    if (typeof data.id !== 'string' || !data.id) {
      console.warn('[BoardStorageService] Malformed document data (missing ID):', data);
      return null;
    }

    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled Class Note';
    const createdAt = typeof data.createdAt === 'number' ? data.createdAt : Date.now();
    const updatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : Date.now();

    const pages: BoardPage[] = [];

    // Case 1: Multi-page document structure
    if (Array.isArray(data.pages) && data.pages.length > 0) {
      for (let i = 0; i < data.pages.length; i++) {
        const rawPage = data.pages[i];
        if (!rawPage || typeof rawPage !== 'object') continue;

        const validObjects: BoardObject[] = [];
        if (Array.isArray(rawPage.objects)) {
          for (const obj of rawPage.objects) {
            if (this.isValidBoardObject(obj)) {
              validObjects.push(obj);
            }
          }
        }

        pages.push({
          id: typeof rawPage.id === 'string' && rawPage.id ? rawPage.id : this.generateId('page'),
          name: typeof rawPage.name === 'string' && rawPage.name.trim() ? rawPage.name.trim() : `Page ${i + 1}`,
          objects: validObjects,
          viewState: rawPage.viewState && typeof rawPage.viewState === 'object'
            ? {
                zoom: typeof rawPage.viewState.zoom === 'number' ? rawPage.viewState.zoom : 1,
                panX: typeof rawPage.viewState.panX === 'number' ? rawPage.viewState.panX : 0,
                panY: typeof rawPage.viewState.panY === 'number' ? rawPage.viewState.panY : 0,
              }
            : { zoom: 1, panX: 0, panY: 0 },
          createdAt: typeof rawPage.createdAt === 'number' ? rawPage.createdAt : createdAt,
          updatedAt: typeof rawPage.updatedAt === 'number' ? rawPage.updatedAt : updatedAt,
        });
      }
    }

    // Case 2: Legacy single-page record migration (data.objects)
    if (pages.length === 0) {
      const validObjects: BoardObject[] = [];
      if (Array.isArray(data.objects)) {
        for (const obj of data.objects) {
          if (this.isValidBoardObject(obj)) {
            validObjects.push(obj);
          }
        }
      }

      const initialPageId = this.generateId('page');
      pages.push({
        id: initialPageId,
        name: 'Page 1',
        objects: validObjects,
        viewState: { zoom: 1, panX: 0, panY: 0 },
        createdAt,
        updatedAt,
      });
    }

    const currentPageId =
      typeof data.currentPageId === 'string' && pages.some((p) => p.id === data.currentPageId)
        ? data.currentPageId
        : pages[0].id;

    const pdfDocumentIds = Array.isArray(data.pdfDocumentIds)
      ? data.pdfDocumentIds.filter((id: any) => typeof id === 'string')
      : undefined;

    const activePdfDocumentId = typeof data.activePdfDocumentId === 'string' ? data.activePdfDocumentId : undefined;
    const activePdfPageNumber = typeof data.activePdfPageNumber === 'number' && data.activePdfPageNumber >= 1
      ? data.activePdfPageNumber
      : undefined;

    return {
      id: data.id,
      name,
      pages,
      currentPageId,
      pdfDocumentIds,
      activePdfDocumentId,
      activePdfPageNumber,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Validates individual BoardObject structure.
   */
  private isValidBoardObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if (typeof obj.id !== 'string' || !obj.id) return false;
    if (typeof obj.type !== 'string') return false;
    if (typeof obj.x !== 'number' || isNaN(obj.x)) return false;
    if (typeof obj.y !== 'number' || isNaN(obj.y)) return false;
    if (typeof obj.width !== 'number' || isNaN(obj.width)) return false;
    if (typeof obj.height !== 'number' || isNaN(obj.height)) return false;

    switch (obj.type) {
      case 'freehand':
        return Array.isArray(obj.points) && typeof obj.color === 'string';
      case 'shape':
        return typeof obj.shapeType === 'string' && typeof obj.color === 'string';
      case 'line':
      case 'arrow':
        return (
          typeof obj.startX === 'number' &&
          typeof obj.startY === 'number' &&
          typeof obj.endX === 'number' &&
          typeof obj.endY === 'number'
        );
      case 'text':
        return typeof obj.text === 'string';
      case 'equation':
        return typeof obj.latex === 'string';
      default:
        return false;
    }
  }

  /**
   * Saves annotations for a specific PDF page in IndexedDB.
   */
  public async savePdfAnnotations(
    pdfDocumentId: string,
    pageNumber: number,
    objects: readonly BoardObject[]
  ): Promise<void> {
    const validObjects = objects.filter((o) => this.isValidBoardObject(o));
    await this.db.savePdfPageAnnotations(pdfDocumentId, pageNumber, validObjects);
  }

  /**
   * Loads annotations for a specific PDF page from IndexedDB.
   */
  public async loadPdfAnnotations(
    pdfDocumentId: string,
    pageNumber: number
  ): Promise<BoardObject[]> {
    const objs = await this.db.getPdfPageAnnotations(pdfDocumentId, pageNumber);
    return objs.filter((o) => this.isValidBoardObject(o));
  }

  /**
   * Loads all page annotations for a PDF document.
   */
  public async loadAllPdfAnnotationsForDocument(
    pdfDocumentId: string
  ): Promise<PdfPageAnnotations[]> {
    return await this.db.getAllPdfAnnotationsForDoc(pdfDocumentId);
  }

  public async savePdfDocument(doc: import('../models/StoredPdfDocument').StoredPdfDocument): Promise<void> {
    await this.pdfStorage.savePdfDocument(doc);
  }

  public async getPdfDocument(id: string): Promise<import('../models/StoredPdfDocument').StoredPdfDocument | null> {
    return await this.pdfStorage.getPdfDocument(id);
  }

  public async getPdfDocumentsForClassNote(classNoteId: string): Promise<import('../models/StoredPdfDocument').StoredPdfDocument[]> {
    return await this.pdfStorage.getPdfDocumentsForClassNote(classNoteId);
  }

  public async deletePdfDocument(id: string): Promise<void> {
    await this.pdfStorage.deletePdfDocument(id);
  }

  public async deletePdfAnnotations(pdfDocumentId: string, pageNumber: number): Promise<void> {
    await this.pdfStorage.deletePdfAnnotations(pdfDocumentId, pageNumber);
  }

  public async deleteAllPdfAnnotations(pdfDocumentId: string): Promise<void> {
    await this.pdfStorage.deleteAllPdfAnnotations(pdfDocumentId);
  }
}
