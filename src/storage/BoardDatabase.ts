/**
 * BoardDatabase.ts
 *
 * Lightweight, native IndexedDB wrapper for storing and retrieving
 * structured ClassNote and multi-page BoardState records for the AI Smart Board.
 */

import { BoardObject } from '../models/BoardObject';
import { BoardPage } from '../models/BoardPage';
import { PdfPageAnnotations } from '../models/PdfPageAnnotations';
import { StoredPdfDocument } from '../models/StoredPdfDocument';

export interface StoredBoard {
  id: string;
  name: string;
  pages: BoardPage[];
  currentPageId?: string;
  pdfDocumentIds?: string[];
  activePdfDocumentId?: string;
  activePdfPageNumber?: number;
  objects?: BoardObject[]; // Backward compatibility with legacy single-page records
  createdAt: number;
  updatedAt: number;
}

export interface StoredBoardSummary {
  id: string;
  name: string;
  pageCount: number;
  objectCount: number;
  createdAt: number;
  updatedAt: number;
}

export class BoardDatabase {
  private static readonly DB_NAME = 'AI_Smart_Board_DB';
  private static readonly DB_VERSION = 4;
  private static readonly STORE_BOARDS = 'boards';
  private static readonly STORE_META = 'meta';
  private static readonly STORE_PDF_ANNOTATIONS = 'pdf_annotations';
  private static readonly STORE_PDF_DOCUMENTS = 'pdf_documents';

  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initializes and returns the active IndexedDB connection.
   */
  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = window.indexedDB.open(
        BoardDatabase.DB_NAME,
        BoardDatabase.DB_VERSION
      );

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create 'boards' store for document records
        if (!db.objectStoreNames.contains(BoardDatabase.STORE_BOARDS)) {
          const boardsStore = db.createObjectStore(BoardDatabase.STORE_BOARDS, {
            keyPath: 'id',
          });
          boardsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Create 'meta' store for application-level state
        if (!db.objectStoreNames.contains(BoardDatabase.STORE_META)) {
          db.createObjectStore(BoardDatabase.STORE_META, { keyPath: 'key' });
        }

        // Create 'pdf_annotations' store for PDF page annotations
        if (!db.objectStoreNames.contains(BoardDatabase.STORE_PDF_ANNOTATIONS)) {
          const pdfStore = db.createObjectStore(BoardDatabase.STORE_PDF_ANNOTATIONS, {
            keyPath: 'id',
          });
          pdfStore.createIndex('pdfDocumentId', 'pdfDocumentId', { unique: false });
        }

        // Create 'pdf_documents' store for binary PDF Blobs and metadata
        if (!db.objectStoreNames.contains(BoardDatabase.STORE_PDF_DOCUMENTS)) {
          const pdfDocStore = db.createObjectStore(BoardDatabase.STORE_PDF_DOCUMENTS, {
            keyPath: 'id',
          });
          pdfDocStore.createIndex('classNoteId', 'classNoteId', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };
    });

    return this.dbPromise;
  }

  /**
   * Saves or updates a ClassNote document record in IndexedDB.
   */
  public async saveBoard(board: StoredBoard): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_BOARDS, 'readwrite');
      const store = tx.objectStore(BoardDatabase.STORE_BOARDS);
      const request = store.put(board);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to save document: ${request.error?.message}`));
    });
  }

  /**
   * Retrieves a document record by its unique ID.
   */
  public async getBoard(id: string): Promise<StoredBoard | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_BOARDS, 'readonly');
      const store = tx.objectStore(BoardDatabase.STORE_BOARDS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error(`Failed to load document: ${request.error?.message}`));
    });
  }

  /**
   * Retrieves all document records.
   */
  public async getAllBoards(): Promise<StoredBoard[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_BOARDS, 'readonly');
      const store = tx.objectStore(BoardDatabase.STORE_BOARDS);
      const index = store.index('updatedAt');
      const request = index.getAll();

      request.onsuccess = () => {
        const results = (request.result || []) as StoredBoard[];
        results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(results);
      };
      request.onerror = () => reject(new Error(`Failed to list documents: ${request.error?.message}`));
    });
  }

  /**
   * Deletes a document record by its unique ID.
   */
  public async deleteBoard(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_BOARDS, 'readwrite');
      const store = tx.objectStore(BoardDatabase.STORE_BOARDS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to delete document: ${request.error?.message}`));
    });
  }

  /**
   * Saves arbitrary application metadata (e.g. last_opened_board_id).
   */
  public async setMeta(key: string, value: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_META, 'readwrite');
      const store = tx.objectStore(BoardDatabase.STORE_META);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to set metadata [${key}]: ${request.error?.message}`));
    });
  }

  /**
   * Retrieves application metadata by key.
   */
  public async getMeta(key: string): Promise<any | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_META, 'readonly');
      const store = tx.objectStore(BoardDatabase.STORE_META);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = () => reject(new Error(`Failed to get metadata [${key}]: ${request.error?.message}`));
    });
  }

  /**
   * Saves annotations for a specific PDF page in IndexedDB.
   */
  public async savePdfPageAnnotations(pdfDocumentId: string, pageNumber: number, objects: BoardObject[]): Promise<void> {
    const db = await this.getDB();
    const id = `${pdfDocumentId}-page-${pageNumber}`;
    const record = {
      id,
      pdfDocumentId,
      pageNumber,
      objects: JSON.parse(JSON.stringify(objects)),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_ANNOTATIONS, 'readwrite');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_ANNOTATIONS);
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to save PDF annotations [${id}]: ${request.error?.message}`));
    });
  }

  /**
   * Retrieves annotations for a specific PDF page from IndexedDB.
   */
  public async getPdfPageAnnotations(pdfDocumentId: string, pageNumber: number): Promise<BoardObject[]> {
    const db = await this.getDB();
    const id = `${pdfDocumentId}-page-${pageNumber}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_ANNOTATIONS, 'readonly');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_ANNOTATIONS);
      const request = store.get(id);

      request.onsuccess = () => {
        const res = request.result;
        resolve(res && Array.isArray(res.objects) ? res.objects : []);
      };
      request.onerror = () => reject(new Error(`Failed to load PDF annotations [${id}]: ${request.error?.message}`));
    });
  }

  /**
   * Retrieves all page annotations records for a given PDF document.
   */
  public async getAllPdfAnnotationsForDoc(pdfDocumentId: string): Promise<PdfPageAnnotations[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_ANNOTATIONS, 'readonly');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_ANNOTATIONS);
      const index = store.index('pdfDocumentId');
      const request = index.getAll(pdfDocumentId);

      request.onsuccess = () => {
        const results = request.result || [];
        const mapped: PdfPageAnnotations[] = results.map((r: any) => ({
          pdfDocumentId: r.pdfDocumentId,
          pageNumber: r.pageNumber,
          objects: Array.isArray(r.objects) ? r.objects : [],
        }));
        resolve(mapped);
      };
      request.onerror = () => reject(new Error(`Failed to list PDF annotations for doc [${pdfDocumentId}]: ${request.error?.message}`));
    });
  }

  /**
   * Saves or updates a PDF document Blob and metadata in IndexedDB.
   */
  public async savePdfDocument(doc: StoredPdfDocument): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_DOCUMENTS, 'readwrite');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_DOCUMENTS);
      const request = store.put(doc);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        const err = request.error;
        if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
          reject(new Error('Unable to save this PDF because browser storage is full.'));
        } else {
          reject(new Error(`Failed to save PDF document [${doc.id}]: ${err?.message || 'Unknown error'}`));
        }
      };
    });
  }

  /**
   * Retrieves a PDF document record by its unique ID.
   */
  public async getPdfDocument(id: string): Promise<StoredPdfDocument | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_DOCUMENTS, 'readonly');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_DOCUMENTS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error(`Failed to load PDF document [${id}]: ${request.error?.message}`));
    });
  }

  /**
   * Retrieves all PDF document records associated with a specific ClassNote.
   */
  public async getPdfDocumentsForClassNote(classNoteId: string): Promise<StoredPdfDocument[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_DOCUMENTS, 'readonly');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_DOCUMENTS);
      const index = store.index('classNoteId');
      const request = index.getAll(classNoteId);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error(`Failed to list PDF documents for note [${classNoteId}]: ${request.error?.message}`));
    });
  }

  /**
   * Deletes a PDF document record by ID from IndexedDB.
   */
  public async deletePdfDocument(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_DOCUMENTS, 'readwrite');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_DOCUMENTS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to delete PDF document [${id}]: ${request.error?.message}`));
    });
  }

  /**
   * Deletes all page annotation records associated with a PDF document ID.
   */
  public async deletePdfAnnotationsForDoc(pdfDocumentId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_ANNOTATIONS, 'readwrite');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_ANNOTATIONS);
      const index = store.index('pdfDocumentId');
      const request = index.getAllKeys(pdfDocumentId);

      request.onsuccess = () => {
        const keys = request.result || [];
        for (const key of keys) {
          store.delete(key);
        }
        resolve();
      };
      request.onerror = () => reject(new Error(`Failed to delete annotations for PDF [${pdfDocumentId}]: ${request.error?.message}`));
    });
  }

  public async deletePdfPageAnnotations(pdfDocumentId: string, pageNumber: number): Promise<void> {
    const db = await this.getDB();
    const id = `${pdfDocumentId}-page-${pageNumber}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BoardDatabase.STORE_PDF_ANNOTATIONS, 'readwrite');
      const store = tx.objectStore(BoardDatabase.STORE_PDF_ANNOTATIONS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to delete PDF annotations [${id}]: ${request.error?.message}`));
    });
  }
}
