import { create } from "zustand";
import type { EditOp } from "./types";

type Store = {
  ops: EditOp[];
  history: EditOp[][];
  future: EditOp[][];
  selectedId: string | null;
  currentPage: number; // 1-based display position
  numPages: number;
  scale: number;
  /** Maps display position → original 0-based page index. Default identity. */
  pageOrder: number[];
  /** Increments on undo/redo so views can rebuild from ops (user-driven edits don't bump this). */
  historyVersion: number;

  setNumPages: (n: number) => void;
  setCurrentPage: (n: number) => void;
  setScale: (s: number) => void;
  setSelected: (id: string | null) => void;
  reorderPage: (from: number, to: number) => void; // display indices, 0-based

  addOp: (op: EditOp) => void;
  updateOp: (id: string, patch: Partial<EditOp>) => void;
  removeOp: (id: string) => void;

  /** Replace the entire editor state at once (used when loading a saved project). */
  loadState: (s: { ops: EditOp[]; pageOrder: number[] }) => void;

  undo: () => void;
  redo: () => void;
};

function pushHistory(state: Store): Pick<Store, "history" | "future"> {
  return { history: [...state.history, state.ops], future: [] };
}

export const useEditor = create<Store>((set) => ({
  ops: [],
  history: [],
  future: [],
  selectedId: null,
  currentPage: 1,
  numPages: 0,
  scale: 1.25,
  pageOrder: [],
  historyVersion: 0,

  setNumPages: (n) =>
    set((s) => ({
      numPages: n,
      // Initialize identity order on first load / when page count changes
      pageOrder: s.pageOrder.length === n ? s.pageOrder : Array.from({ length: n }, (_, i) => i),
    })),
  setCurrentPage: (n) => set({ currentPage: n }),
  setScale: (s) => set({ scale: s }),
  setSelected: (id) => set({ selectedId: id }),

  reorderPage: (from, to) =>
    set((s) => {
      if (from === to) return s;
      const order = [...s.pageOrder];
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      // Keep currentPage pointing at the same page after move
      let newCurrent = s.currentPage;
      const curIdx0 = s.currentPage - 1;
      if (curIdx0 === from) newCurrent = to + 1;
      else if (from < curIdx0 && to >= curIdx0) newCurrent = s.currentPage - 1;
      else if (from > curIdx0 && to <= curIdx0) newCurrent = s.currentPage + 1;
      return { pageOrder: order, currentPage: newCurrent };
    }),

  addOp: (op) =>
    set((s) => ({ ...pushHistory(s), ops: [...s.ops, op], selectedId: op.id })),

  updateOp: (id, patch) =>
    set((s) => ({
      ...pushHistory(s),
      ops: s.ops.map((o) => (o.id === id ? ({ ...o, ...patch } as EditOp) : o)),
    })),

  removeOp: (id) =>
    set((s) => ({
      ...pushHistory(s),
      ops: s.ops.filter((o) => o.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  loadState: ({ ops, pageOrder }) =>
    set({
      ops,
      pageOrder,
      history: [],
      future: [],
      historyVersion: 0,
      selectedId: null,
      currentPage: 1,
    }),

  undo: () =>
    set((s) => {
      if (!s.history.length) return s;
      const prev = s.history[s.history.length - 1];
      return {
        ops: prev,
        history: s.history.slice(0, -1),
        future: [s.ops, ...s.future],
        historyVersion: s.historyVersion + 1,
        selectedId: null,
      };
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return s;
      const next = s.future[0];
      return {
        ops: next,
        history: [...s.history, s.ops],
        future: s.future.slice(1),
        historyVersion: s.historyVersion + 1,
        selectedId: null,
      };
    }),
}));
