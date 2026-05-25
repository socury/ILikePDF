"use client";

import { useEffect, useRef } from "react";
import { useEditor } from "@/lib/store";
import type { EditOp } from "@/lib/types";

type Props = {
  width: number;
  height: number;
  pageIndex: number;
};

/**
 * Overlay edit layer on top of the PDF canvas, powered by Fabric.js.
 *
 * Coordinate convention:
 *   - EditOp values are stored in PDF points (scale-invariant).
 *   - Fabric/screen positions = op value × current scale.
 *   - On user edit (object:modified) we divide fabric values by scale before storing.
 * This keeps object positions correct across zoom changes.
 */
export default function OverlayCanvas({ width, height, pageIndex }: Props) {
  const elRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const ops = useEditor((s) => s.ops);
  const addOp = useEditor((s) => s.addOp);
  const updateOp = useEditor((s) => s.updateOp);
  const setSelected = useEditor((s) => s.setSelected);
  const historyVersion = useEditor((s) => s.historyVersion);
  const scale = useEditor((s) => s.scale);
  // ops snapshot for rebuild without re-running effect on every user edit
  const opsRef = useRef(ops);
  opsRef.current = ops;

  // Init once per page
  useEffect(() => {
    let disposed = false;
    (async () => {
      const fabric: any = await import("fabric");
      if (disposed) return;
      const canvas = new fabric.Canvas(elRef.current!, {
        width,
        height,
        selection: true,
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      // sync from store
      for (const op of ops.filter((o) => o.pageIndex === pageIndex)) {
        addFabricObject(fabric, canvas, op, scale);
      }

      canvas.on("selection:created", (e: any) => {
        const obj = e.selected?.[0];
        if (obj?.data?.id) setSelected(obj.data.id);
      });
      canvas.on("selection:updated", (e: any) => {
        const obj = e.selected?.[0];
        if (obj?.data?.id) setSelected(obj.data.id);
      });
      canvas.on("selection:cleared", () => setSelected(null));

      canvas.on("object:modified", (e: any) => {
        const o = e.target;
        if (!o?.data?.id) return;
        const id = o.data.id as string;
        // Divide by scale so we store in scale-invariant PDF point space.
        updateOp(id, {
          x: o.left / scale,
          y: o.top / scale,
          width: (o.width * o.scaleX) / scale,
          height: (o.height * o.scaleY) / scale,
          ...(o.type === "textbox" ? { text: o.text, fontSize: o.fontSize / scale } : {}),
        } as Partial<EditOp>);
      });
    })();
    return () => {
      disposed = true;
      fabricRef.current?.dispose?.();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, pageIndex]);

  // Rebuild fabric objects from store ops when undo/redo bumps historyVersion.
  // (User-driven edits don't change historyVersion, so this won't run on each move.)
  useEffect(() => {
    if (historyVersion === 0) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    (async () => {
      const fabric: any = await import("fabric");
      // Clear all existing fabric objects
      canvas.discardActiveObject();
      const objs = canvas.getObjects().slice();
      for (const o of objs) canvas.remove(o);
      // Re-add from current ops snapshot
      for (const op of opsRef.current.filter((o) => o.pageIndex === pageIndex)) {
        addFabricObject(fabric, canvas, op, scale);
      }
      canvas.requestRenderAll();
    })();
  }, [historyVersion, pageIndex, scale]);

  // Copy / Paste for selected objects.
  //   ⌘/Ctrl + C   → copy selected object(s)
  //   ⌘/Ctrl + V   → paste copies offset by a small delta (PDF points)
  //   ⌘/Ctrl + D   → duplicate in one step
  // Skipped when typing in inputs or when a Textbox is in edit mode (let the
  // browser do its normal text-clipboard thing).
  const clipboardRef = useRef<EditOp[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k !== "c" && k !== "v" && k !== "d") return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if ((active as any)?.isEditing) return; // text editing mode

      if (k === "c" || k === "d") {
        if (!active) return;
        // Collect selected ids (ActiveSelection wraps multiple)
        const selectedObjs: any[] =
          (active as any).type === "activeselection" && typeof (active as any).getObjects === "function"
            ? (active as any).getObjects()
            : [active];
        const ids = new Set<string>(
          selectedObjs.map((o: any) => o?.data?.id).filter(Boolean),
        );
        const snapshot = opsRef.current.filter(
          (o) => ids.has(o.id) && o.pageIndex === pageIndex,
        );
        if (!snapshot.length) return;
        e.preventDefault();
        // Deep clone so future edits to canvas don't mutate clipboard
        clipboardRef.current = snapshot.map((o) => JSON.parse(JSON.stringify(o)));
        if (k === "d") doPaste(); // duplicate = copy + paste
      } else if (k === "v") {
        if (!clipboardRef.current.length) return;
        e.preventDefault();
        doPaste();
      }
    };

    // Offset each pasted copy by ~12 PDF points so it doesn't overlap the original
    const PASTE_OFFSET = 12;
    const doPaste = async () => {
      const fabric: any = await import("fabric");
      const canvas = fabricRef.current;
      if (!canvas) return;
      const newObjs: any[] = [];
      const store = useEditor.getState();
      for (const op of clipboardRef.current) {
        const cloned: EditOp = {
          ...JSON.parse(JSON.stringify(op)),
          id: crypto.randomUUID(),
          pageIndex, // paste onto current page
          x: op.x + PASTE_OFFSET,
          y: op.y + PASTE_OFFSET,
        };
        store.addOp(cloned);
        addFabricObject(fabric, canvas, cloned, scale);
        // Find the freshly added fabric object to select it
        const justAdded = canvas.getObjects().find((o: any) => o?.data?.id === cloned.id);
        if (justAdded) newObjs.push(justAdded);
      }
      // Select the new objects (single → setActiveObject, many → ActiveSelection)
      canvas.discardActiveObject();
      if (newObjs.length === 1) {
        canvas.setActiveObject(newObjs[0]);
      } else if (newObjs.length > 1) {
        const sel = new fabric.ActiveSelection(newObjs, { canvas });
        canvas.setActiveObject(sel);
      }
      // Shift the clipboard forward so consecutive pastes "stair-step" instead
      // of stacking on the same point.
      clipboardRef.current = clipboardRef.current.map((o) => ({
        ...o,
        x: o.x + PASTE_OFFSET,
        y: o.y + PASTE_OFFSET,
      }));
      canvas.requestRenderAll();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageIndex, scale]);

  // Backspace / Delete to remove selected object(s).
  // Skip when user is editing text inside a Textbox, or focused on an input/textarea.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;

      // If a Textbox is currently in editing mode, let Backspace edit characters
      if ((active as any).isEditing) return;

      // Multi-selection: ActiveSelection contains multiple objects
      const targets: any[] =
        (active as any).type === "activeselection" && typeof (active as any).getObjects === "function"
          ? (active as any).getObjects()
          : [active];

      e.preventDefault();

      const store = useEditor.getState();
      for (const obj of targets) {
        const id = obj?.data?.id ?? (obj as any).id;
        canvas.remove(obj);
        if (id) store.removeOp(id);
      }
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Expose helpers via window for the toolbar (simple cross-component bridge)
  useEffect(() => {
    (window as any).__overlayApi = {
      isEditingText: () => {
        const obj = fabricRef.current?.getActiveObject?.();
        return !!obj?.isEditing;
      },
      addText: async () => {
        const fabric: any = await import("fabric");
        const id = crypto.randomUUID();
        // Defaults expressed in PDF points; multiply by scale for fabric/screen.
        const opVals = { x: 60, y: 60, width: 200, height: 24, fontSize: 18 };
        const text = new fabric.Textbox("텍스트 입력", {
          left: opVals.x * scale,
          top: opVals.y * scale,
          width: opVals.width * scale,
          fontSize: opVals.fontSize * scale,
          fill: "#111111",
          data: { id, type: "text" },
        });
        fabricRef.current?.add(text);
        fabricRef.current?.setActiveObject(text);
        addOp({
          id,
          type: "text",
          pageIndex,
          ...opVals,
          text: "텍스트 입력",
          color: "#111111",
        });
      },
      addWhiteout: async () => {
        const fabric: any = await import("fabric");
        const id = crypto.randomUUID();
        const opVals = { x: 80, y: 80, width: 160, height: 30 };
        const rect = new fabric.Rect({
          left: opVals.x * scale,
          top: opVals.y * scale,
          width: opVals.width * scale,
          height: opVals.height * scale,
          fill: "#ffffff",
          stroke: "#cccccc",
          strokeDashArray: [4, 4],
          data: { id, type: "whiteout" },
        });
        fabricRef.current?.add(rect);
        fabricRef.current?.setActiveObject(rect);
        addOp({
          id,
          type: "whiteout",
          pageIndex,
          ...opVals,
          color: "#ffffff",
        });
      },
      replaceText: async (rect: {
        x: number;
        y: number;
        width: number;
        height: number;
        text: string;
        fontSize: number;
      }) => {
        // rect comes from TextLayer in *screen px at current scale*.
        // Convert to PDF-point op space.
        const sx = rect.x / scale;
        const sy = rect.y / scale;
        const sw = rect.width / scale;
        const sh = rect.height / scale;
        const sfs = rect.fontSize / scale;

        const fabric: any = await import("fabric");
        // Pad whiteout slightly to fully cover ascenders/descenders (in op space).
        const padX = 1;
        const padY = 2;
        const wx = sx - padX;
        const wy = sy - padY;
        const ww = sw + padX * 2;
        const wh = sh + padY * 2;

        const whiteId = crypto.randomUUID();
        const white = new fabric.Rect({
          left: wx * scale,
          top: wy * scale,
          width: ww * scale,
          height: wh * scale,
          fill: "#ffffff",
          stroke: "transparent",
          data: { id: whiteId, type: "whiteout" },
          selectable: true,
        });
        fabricRef.current?.add(white);
        addOp({
          id: whiteId,
          type: "whiteout",
          pageIndex,
          x: wx,
          y: wy,
          width: ww,
          height: wh,
          color: "#ffffff",
        });

        const textId = crypto.randomUUID();
        const tb = new fabric.Textbox(rect.text, {
          left: sx * scale,
          top: sy * scale,
          width: Math.max(sw, 40) * scale,
          fontSize: Math.max(sfs, 10) * scale,
          fill: "#111111",
          data: { id: textId, type: "text" },
        });
        fabricRef.current?.add(tb);
        fabricRef.current?.setActiveObject(tb);
        tb.enterEditing?.();
        tb.selectAll?.();
        fabricRef.current?.requestRenderAll();

        addOp({
          id: textId,
          type: "text",
          pageIndex,
          x: sx,
          y: sy,
          width: Math.max(sw, 40),
          height: Math.max(sh, 16),
          text: rect.text,
          fontSize: Math.max(sfs, 10),
          color: "#111111",
        });
      },
      addImage: async (dataUrl: string) => {
        const fabric: any = await import("fabric");
        const img = await fabric.FabricImage.fromURL(dataUrl);
        const id = crypto.randomUUID();
        // Default screen position 100,100 → op position is 100/scale.
        img.set({ left: 100 * scale, top: 100 * scale, data: { id, type: "image" } });
        const maxScreenW = 240 * scale;
        if (img.width > maxScreenW) img.scale(maxScreenW / img.width);
        fabricRef.current?.add(img);
        fabricRef.current?.setActiveObject(img);
        addOp({
          id,
          type: "image",
          pageIndex,
          x: 100,
          y: 100,
          width: img.getScaledWidth() / scale,
          height: img.getScaledHeight() / scale,
          dataUrl,
        });
      },
      deleteSelected: () => {
        const obj = fabricRef.current?.getActiveObject();
        if (!obj?.data?.id) return;
        fabricRef.current?.remove(obj);
        useEditor.getState().removeOp(obj.data.id);
      },
    };
  }, [addOp, pageIndex, scale]);

  return <canvas ref={elRef} className="absolute inset-0 pointer-events-auto" />;
}

/** op values are in PDF points; multiply by scale to position on the fabric canvas. */
function addFabricObject(fabric: any, canvas: any, op: EditOp, scale: number) {
  if (op.type === "text") {
    const o = new fabric.Textbox(op.text, {
      left: op.x * scale,
      top: op.y * scale,
      width: op.width * scale,
      fontSize: op.fontSize * scale,
      fill: op.color,
      data: { id: op.id, type: "text" },
    });
    canvas.add(o);
  } else if (op.type === "whiteout") {
    const o = new fabric.Rect({
      left: op.x * scale,
      top: op.y * scale,
      width: op.width * scale,
      height: op.height * scale,
      fill: op.color,
      stroke: "#cccccc",
      strokeDashArray: [4, 4],
      data: { id: op.id, type: "whiteout" },
    });
    canvas.add(o);
  } else if (op.type === "image") {
    fabric.FabricImage.fromURL(op.dataUrl).then((img: any) => {
      img.set({
        left: op.x * scale,
        top: op.y * scale,
        scaleX: (op.width * scale) / img.width,
        scaleY: (op.height * scale) / img.height,
        data: { id: op.id, type: "image" },
      });
      canvas.add(img);
    });
  }
}
