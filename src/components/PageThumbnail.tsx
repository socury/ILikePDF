"use client";

import { useEffect, useRef } from "react";

type Props = {
  pdfBytes: ArrayBuffer;
  originalPageIndex: number; // 0-based original index
  targetWidth?: number;
};

/**
 * Tiny PDF page preview rendered with PDF.js at low scale.
 * Cancels any in-flight render before starting a new one — React StrictMode
 * (and rapid prop changes) would otherwise trigger PDF.js's "same canvas during
 * multiple render() operations" error.
 */
export default function PageThumbnail({ pdfBytes, originalPageIndex, targetWidth = 96 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      // Cancel any previous render before starting a new one
      try {
        renderTaskRef.current?.cancel?.();
      } catch {}

      const doc = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;
      if (cancelled) return;
      const page = await doc.getPage(originalPageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = targetWidth / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = ref.current;
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
        // RenderingCancelledException is expected on cleanup
        if (err?.name !== "RenderingCancelledException") throw err;
      }
    })();
    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel?.();
      } catch {}
    };
  }, [pdfBytes, originalPageIndex, targetWidth]);

  return <canvas ref={ref} className="bg-white shadow-sm rounded" />;
}
