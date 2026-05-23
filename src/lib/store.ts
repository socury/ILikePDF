import { create } from "zustand";
import type { EditOp } from "./types";

type Store = {
  ops: EditOp[];
  history: EditOp[][];
  future: EditOp[][];
  selectedId: string | null;
  currentPage: number;
  numPages: number;
  scale: number;

  setNumPages: (n: number) => void;
  setCurrentPage: (n: number) => void;
  setScale: (s: number) => void;
  setSelected: (id: string | null) => void;

  addOp: (op: EditOp) => void;
  updateOp: (id: string, patch: Partial<EditOp>) => void;
  removeOp: (id: string) => void;

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

  setNumPages: (n) => set({ numPages: n }),
  setCurrentPage: (n) => set({ currentPage: n }),
  setScale: (s) => set({ scale: s }),
  setSelected: (id) => set({ selectedId: id }),

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

  undo: () =>
    set((s) => {
      if (!s.history.length) return s;
      const prev = s.history[s.history.length - 1];
      return {
        ops: prev,
        history: s.history.slice(0, -1),
        future: [s.ops, ...s.future],
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
      };
    }),
}));
