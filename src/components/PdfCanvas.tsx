"use client";

import { useEffect, useRef } from "react";
import { useEditor } from "@/lib/store";

type Props = {
  pdfBytes: ArrayBuffer;
  pageIndex: number; // 0-based
  onReady?: (info: { width: number; height: number; pdfWidth: number; pdfHeight: number }) => void;
};

/**
 * Renders a single PDF page onto a canvas using pdfjs-dist.
 * Cancels any in-flight render before starting a new one to avoid
 * PDF.js's "multiple render() operations on the same canvas" error.
 */
export default function PdfCanvas({ pdfBytes, pageIndex, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const scale = useEditor((s) => s.scale);
  const setNumPages = useEditor((s) => s.setNumPages);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      // Cancel any prior render task on the same canvas
      try {
        renderTaskRef.current?.cancel?.();
      } catch {}

      const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice(0) });
      const doc = await loadingTask.promise;
      if (cancelled) return;
      setNumPages(doc.numPages);

      const page = await doc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const task = page.render({ canvasContext: ctx, viewport } as any);
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") throw err;
        return; // canceled — don't fire onReady
      }
      const base = page.getViewport({ scale: 1 });
      onReady?.({
        width: viewport.width,
        height: viewport.height,
        pdfWidth: base.width,
        pdfHeight: base.height,
      });
    })();
    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel?.();
      } catch {}
    };
  }, [pdfBytes, pageIndex, scale, setNumPages, onReady]);

  return <canvas ref={canvasRef} className="shadow-md bg-white" />;
}
