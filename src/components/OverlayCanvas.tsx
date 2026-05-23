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
 * Coordinates are in screen pixels (the same as PdfCanvas at current scale).
 * We convert to PDF points at export time.
 */
export default function OverlayCanvas({ width, height, pageIndex }: Props) {
  const elRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const ops = useEditor((s) => s.ops);
  const addOp = useEditor((s) => s.addOp);
  const updateOp = useEditor((s) => s.updateOp);
  const setSelected = useEditor((s) => s.setSelected);

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
        addFabricObject(fabric, canvas, op);
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
        updateOp(id, {
          x: o.left,
          y: o.top,
          width: o.width * o.scaleX,
          height: o.height * o.scaleY,
          ...(o.type === "textbox" ? { text: o.text, fontSize: o.fontSize } : {}),
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

  // Expose helpers via window for the toolbar (simple cross-component bridge)
  useEffect(() => {
    (window as any).__overlayApi = {
      addText: async () => {
        const fabric: any = await import("fabric");
        const id = crypto.randomUUID();
        const text = new fabric.Textbox("텍스트 입력", {
          left: 60,
          top: 60,
          width: 200,
          fontSize: 18,
          fill: "#111111",
          data: { id, type: "text" },
        });
        fabricRef.current?.add(text);
        fabricRef.current?.setActiveObject(text);
        addOp({
          id,
          type: "text",
          pageIndex,
          x: 60,
          y: 60,
          width: 200,
          height: 24,
          text: "텍스트 입력",
          fontSize: 18,
          color: "#111111",
        });
      },
      addWhiteout: async () => {
        const fabric: any = await import("fabric");
        const id = crypto.randomUUID();
        const rect = new fabric.Rect({
          left: 80,
          top: 80,
          width: 160,
          height: 30,
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
          x: 80,
          y: 80,
          width: 160,
          height: 30,
          color: "#ffffff",
        });
      },
      addImage: async (dataUrl: string) => {
        const fabric: any = await import("fabric");
        const img = await fabric.FabricImage.fromURL(dataUrl);
        const id = crypto.randomUUID();
        img.set({ left: 100, top: 100, data: { id, type: "image" } });
        const maxW = 240;
        if (img.width > maxW) img.scale(maxW / img.width);
        fabricRef.current?.add(img);
        fabricRef.current?.setActiveObject(img);
        addOp({
          id,
          type: "image",
          pageIndex,
          x: 100,
          y: 100,
          width: img.getScaledWidth(),
          height: img.getScaledHeight(),
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
  }, [addOp, pageIndex]);

  return <canvas ref={elRef} className="absolute inset-0 pointer-events-auto" />;
}

function addFabricObject(fabric: any, canvas: any, op: EditOp) {
  if (op.type === "text") {
    const o = new fabric.Textbox(op.text, {
      left: op.x,
      top: op.y,
      width: op.width,
      fontSize: op.fontSize,
      fill: op.color,
      data: { id: op.id, type: "text" },
    });
    canvas.add(o);
  } else if (op.type === "whiteout") {
    const o = new fabric.Rect({
      left: op.x,
      top: op.y,
      width: op.width,
      height: op.height,
      fill: op.color,
      stroke: "#cccccc",
      strokeDashArray: [4, 4],
      data: { id: op.id, type: "whiteout" },
    });
    canvas.add(o);
  } else if (op.type === "image") {
    fabric.FabricImage.fromURL(op.dataUrl).then((img: any) => {
      img.set({
        left: op.x,
        top: op.y,
        scaleX: op.width / img.width,
        scaleY: op.height / img.height,
        data: { id: op.id, type: "image" },
      });
      canvas.add(img);
    });
  }
}
