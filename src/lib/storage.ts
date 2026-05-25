/**
 * IndexedDB-backed persistence for projects.
 *
 * Schema (single object store):
 *   projects {
 *     id          string  (uuid, key)
 *     name        string  (editable)
 *     originalFileName string
 *     createdAt   number  (ms)
 *     updatedAt   number  (ms)
 *     pdfBlob     Blob    (the original PDF — written once on create)
 *     ops         EditOp[]
 *     pageOrder   number[]
 *     numPages    number
 *   }
 *   index "updatedAt" → for "recent first" listing.
 *
 * The save() function merges a partial record onto whatever's there, so
 * autosave can pass just { id, ops, pageOrder } without re-writing the
 * (potentially many-MB) pdfBlob every keystroke.
 */
import type { EditOp } from "./types";

const DB_NAME = "ilikepdf";
const DB_VERSION = 1;
const STORE = "projects";

export interface ProjectRecord {
  id: string;
  name: string;
  originalFileName: string;
  createdAt: number;
  updatedAt: number;
  pdfBlob: Blob;
  ops: EditOp[];
  pageOrder: number[];
  numPages: number;
}

export type ProjectSummary = Omit<ProjectRecord, "pdfBlob" | "ops" | "pageOrder">;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Merge-save: shallow-merges the partial onto the existing record. */
export async function saveProject(
  partial: Partial<ProjectRecord> & { id: string },
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(partial.id);
    getReq.onsuccess = () => {
      const existing = (getReq.result as ProjectRecord | undefined) ?? {};
      const merged = {
        ...existing,
        ...partial,
        updatedAt: Date.now(),
      } as ProjectRecord;
      const putReq = store.put(merged);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function loadProject(id: string): Promise<ProjectRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as ProjectRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Lightweight metadata list, sorted by updatedAt desc. Excludes the PDF blob and ops. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("updatedAt");
    const results: ProjectSummary[] = [];
    idx.openCursor(null, "prev").onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) {
        resolve(results);
        return;
      }
      const r = cursor.value as ProjectRecord;
      results.push({
        id: r.id,
        name: r.name,
        originalFileName: r.originalFileName,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        numPages: r.numPages,
      });
      cursor.continue();
    };
    idx.openCursor(null, "prev").onerror = (e) => reject(e);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function renameProject(id: string, name: string): Promise<void> {
  return saveProject({ id, name });
}
