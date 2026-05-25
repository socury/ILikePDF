"use client";

import { useEffect, useRef, useState } from "react";
import PdfCanvas from "./PdfCanvas";
import OverlayCanvas from "./OverlayCanvas";
import TextLayer from "./TextLayer";
import Toolbar from "./Toolbar";
import PageSidebar from "./PageSidebar";
import { useEditor } from "@/lib/store";
import { exportPdf } from "@/lib/pdfExport";
import { saveProject } from "@/lib/storage";
import type { EditOp } from "@/lib/types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  /** Already-decoded PDF bytes (loaded by the caller). */
  pdfBytes: ArrayBuffer;
  /** Display file name (also used as project name on first save). */
  fileName: string;
  /** Stable IndexedDB project id. New for fresh uploads, reused on resume. */
  projectId: string;
  /** Initial ops + page order from storage. Empty arrays for new projects. */
  initialOps: EditOp[];
  initialPageOrder: number[];
  onClose: () => void;
};

export default function Editor({
  pdfBytes,
  fileName,
  projectId,
  initialOps,
  initialPageOrder,
  onClose,
}: Props) {
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
    pdfWidth: number;
    pdfHeight: number;
  } | null>(null);
  const [textPickEnabled, setTextPickEnabled] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const { currentPage, setCurrentPage, numPages, ops, pageOrder, undo, redo, loadState } =
    useEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  // Hydrate the editor store from the saved project once per projectId.
  useEffect(() => {
    loadState({ ops: initialOps, pageOrder: initialPageOrder });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Debounced autosave: write ops/pageOrder/numPages to IndexedDB whenever they change.
  // The PDF blob is written only once at project creation (handled in page.tsx),
  // so subsequent saves are cheap.
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!projectId) return;
    const snapshot = JSON.stringify({ ops, pageOrder, numPages });
    if (snapshot === lastSavedRef.current) return;
    setSaveStatus("saving");
    const t = setTimeout(async () => {
      try {
        await saveProject({
          id: projectId,
          ops,
          pageOrder,
          numPages,
          name: fileName,
        });
        lastSavedRef.current = snapshot;
        setSaveStatus("saved");
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[autosave] failed", err);
        setSaveStatus("error");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [ops, pageOrder, numPages, projectId, fileName]);

  // Keyboard shortcuts: ⌘/Ctrl + Z (undo), ⌘/Ctrl + Shift + Z or Ctrl + Y (redo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      const editingFabricText = (window as any).__overlayApi?.isEditingText?.();
      if (editingFabricText) return;

      e.preventDefault();
      const isRedo = key === "y" || (key === "z" && e.shiftKey);
      if (isRedo) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Wheel paging
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

  // Display position → original page index
  const originalPageIndex =
    pageOrder.length && currentPage >= 1
      ? pageOrder[currentPage - 1]
      : currentPage - 1;

  const onExport = async () => {
    if (!pdfBytes) return;
    const bytes = await exportPdf(
      pdfBytes.slice(0),
      ops,
      (op, pageHeight) => {
        const x = op.x;
        const w = op.width;
        const h = op.height;
        const y = pageHeight - op.y - h;
        const fontSize = op.type === "text" ? op.fontSize : 0;
        return { x, y, w, h, fontSize };
      },
      pageOrder,
    );
    const blob = new Blob([bytes as any], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.pdf$/i, "") + "-edited.pdf";
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
        saveStatus={saveStatus}
      />
      <div className="flex flex-1 min-h-0">
        <PageSidebar pdfBytes={pdfBytes} />

        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-100 flex justify-center items-start p-8"
        >
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
        </div>
      </div>
    </div>
  );
}
