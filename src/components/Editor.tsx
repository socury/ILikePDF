"use client";

import { useEffect, useRef, useState } from "react";
import PdfCanvas from "./PdfCanvas";
import OverlayCanvas from "./OverlayCanvas";
import TextLayer from "./TextLayer";
import Toolbar from "./Toolbar";
import PageSidebar from "./PageSidebar";
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
  const [textPickEnabled, setTextPickEnabled] = useState(false);

  const { currentPage, setCurrentPage, numPages, ops, pageOrder } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    file.arrayBuffer().then(setPdfBytes);
  }, [file]);

  // Wheel paging (unchanged behavior)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastFlipAt = 0;
    const COOLDOWN_MS = 350;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (!numPages) return;

      const now = Date.now();
      if (now - lastFlipAt < COOLDOWN_MS) return;

      const goingDown = e.deltaY > 0;
      const goingUp = e.deltaY < 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const atTop = el.scrollTop <= 0;

      if (goingDown && atBottom && currentPage < numPages) {
        e.preventDefault();
        lastFlipAt = now;
        setCurrentPage(currentPage + 1);
        requestAnimationFrame(() => {
          el.scrollTop = 0;
        });
      } else if (goingUp && atTop && currentPage > 1) {
        e.preventDefault();
        lastFlipAt = now;
        setCurrentPage(currentPage - 1);
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [currentPage, numPages, setCurrentPage]);

  // Convert display position → original page index used by canvas/ops
  const originalPageIndex =
    pageOrder.length && currentPage >= 1
      ? pageOrder[currentPage - 1]
      : currentPage - 1;

  const onExport = async () => {
    if (!pdfBytes || !pageSize) return;
    const screenToPdfScaleX = pageSize.pdfWidth / pageSize.width;
    const screenToPdfScaleY = pageSize.pdfHeight / pageSize.height;
    const bytes = await exportPdf(
      pdfBytes.slice(0),
      ops,
      (op, pageHeight) => {
        const x = op.x * screenToPdfScaleX;
        const w = op.width * screenToPdfScaleX;
        const h = op.height * screenToPdfScaleY;
        const y = pageHeight - op.y * screenToPdfScaleY - h;
        return { x, y, w, h };
      },
      pageOrder,
    );
    const blob = new Blob([bytes as any], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.replace(/\.pdf$/i, "") + "-edited.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col">
      <Toolbar
        onExport={onExport}
        onClose={onClose}
        textPickEnabled={textPickEnabled}
        onToggleTextPick={() => setTextPickEnabled((v) => !v)}
      />
      <div className="flex flex-1 min-h-0">
        {pdfBytes && <PageSidebar pdfBytes={pdfBytes} />}

        {/* canvas area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-100 flex justify-center items-start p-8"
        >
          {pdfBytes && (
            <div className="relative">
              <PdfCanvas pdfBytes={pdfBytes} pageIndex={originalPageIndex} onReady={setPageSize} />
              {pageSize && (
                <>
                  <div
                    className="absolute inset-0"
                    style={{ width: pageSize.width, height: pageSize.height }}
                  >
                    <OverlayCanvas
                      width={pageSize.width}
                      height={pageSize.height}
                      pageIndex={originalPageIndex}
                    />
                  </div>
                  <TextLayer
                    pdfBytes={pdfBytes}
                    pageIndex={originalPageIndex}
                    width={pageSize.width}
                    height={pageSize.height}
                    enabled={textPickEnabled}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
