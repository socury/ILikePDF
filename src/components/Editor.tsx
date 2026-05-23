"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PdfCanvas from "./PdfCanvas";
import OverlayCanvas from "./OverlayCanvas";
import Toolbar from "./Toolbar";
import { useEditor } from "@/lib/store";
import { exportPdf } from "@/lib/pdfExport";

type Props = { file: File; onClose: () => void };

export default function Editor({ file, onClose }: Props) {
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
    pdfWidth: number;
    pdfHeight: number;
  } | null>(null);

  const { currentPage, setCurrentPage, numPages, ops } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    file.arrayBuffer().then(setPdfBytes);
  }, [file]);

  const pageIndex = currentPage - 1;

  const onExport = async () => {
    if (!pdfBytes || !pageSize) return;
    // Each page has its own size; we pull pageSize for the *current* page only.
    // For correctness across all pages we'd compute per-page scale. Here we assume same scale.
    const screenToPdfScaleX = pageSize.pdfWidth / pageSize.width;
    const screenToPdfScaleY = pageSize.pdfHeight / pageSize.height;
    const bytes = await exportPdf(pdfBytes.slice(0), ops, (op, pageHeight) => {
      const x = op.x * screenToPdfScaleX;
      const w = op.width * screenToPdfScaleX;
      const h = op.height * screenToPdfScaleY;
      // top-left screen → bottom-left PDF
      const y = pageHeight - op.y * screenToPdfScaleY - h;
      return { x, y, w, h };
    });
    const blob = new Blob([bytes as any], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.replace(/\.pdf$/i, "") + "-edited.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const thumbs = useMemo(
    () => Array.from({ length: numPages }, (_, i) => i + 1),
    [numPages],
  );

  return (
    <div className="h-screen flex flex-col">
      <Toolbar onExport={onExport} onClose={onClose} />
      <div className="flex flex-1 min-h-0">
        {/* page list */}
        <aside className="w-32 shrink-0 border-r border-gray-200 bg-white overflow-y-auto py-3">
          {thumbs.map((n) => (
            <button
              key={n}
              onClick={() => setCurrentPage(n)}
              className={`w-full text-sm py-2 ${
                n === currentPage ? "bg-brand-50 text-brand-700 font-semibold" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              페이지 {n}
            </button>
          ))}
        </aside>

        {/* canvas area */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 flex justify-center items-start p-8">
          {pdfBytes && (
            <div className="relative">
              <PdfCanvas pdfBytes={pdfBytes} pageIndex={pageIndex} onReady={setPageSize} />
              {pageSize && (
                <div
                  className="absolute inset-0"
                  style={{ width: pageSize.width, height: pageSize.height }}
                >
                  <OverlayCanvas width={pageSize.width} height={pageSize.height} pageIndex={pageIndex} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
