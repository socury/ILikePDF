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
 * Also exposes the rendered size so the overlay canvas can match.
 */
export default function PdfCanvas({ pdfBytes, pageIndex, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = useEditor((s) => s.scale);
  const setNumPages = useEditor((s) => s.setNumPages);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      // Worker file is copied to /public — served at site root
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice(0) });
      const doc = await loadingTask.promise;
      if (cancelled) return;
      setNumPages(doc.numPages);

      const page = await doc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      await page.render({ canvasContext: ctx, viewport } as any).promise;
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
    };
  }, [pdfBytes, pageIndex, scale, setNumPages, onReady]);

  return <canvas ref={canvasRef} className="shadow-md bg-white" />;
}
