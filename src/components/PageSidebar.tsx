"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import PageThumbnail from "./PageThumbnail";
import { useEditor } from "@/lib/store";

type Props = { pdfBytes: ArrayBuffer };

/**
 * Sidebar showing one mini-preview per page.
 * Supports HTML5 drag-and-drop to reorder pages and a collapse toggle.
 */
export default function PageSidebar({ pdfBytes }: Props) {
  const { pageOrder, currentPage, setCurrentPage, reorderPage } = useEditor();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 border-r border-gray-200 bg-white flex flex-col items-center pt-3">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded hover:bg-gray-100 text-gray-600"
          title="페이지 패널 열기"
        >
          <PanelLeftOpen size={18} />
        </button>
        <div className="mt-3 text-[11px] text-gray-400 [writing-mode:vertical-rl] rotate-180">
          {pageOrder.length}개 페이지
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-80 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 bg-white">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          페이지 {pageOrder.length}개
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          title="페이지 패널 접기"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-5 px-4 space-y-5">
        {pageOrder.map((originalIdx, displayIdx) => {
          const isActive = currentPage === displayIdx + 1;
          const isDragging = dragFrom === displayIdx;
          const showDropLine = dropAt === displayIdx && dragFrom !== null && dragFrom !== displayIdx;

          return (
            <div key={`${originalIdx}-${displayIdx}`} className="relative">
              {showDropLine && (dropAt as number) <= (dragFrom as number) && (
                <div className="absolute -top-2.5 left-0 right-0 h-1 bg-brand-500 rounded-full z-10 shadow-md shadow-brand-500/40" />
              )}
              <div
                draggable
                onDragStart={(e) => {
                  setDragFrom(displayIdx);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropAt !== displayIdx) setDropAt(displayIdx);
                }}
                onDragLeave={() => {
                  if (dropAt === displayIdx) setDropAt(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null && dragFrom !== displayIdx) {
                    reorderPage(dragFrom, displayIdx);
                  }
                  setDragFrom(null);
                  setDropAt(null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDropAt(null);
                }}
                onClick={() => setCurrentPage(displayIdx + 1)}
                className={`group relative cursor-grab active:cursor-grabbing rounded-xl bg-white p-3 border transition-all ${
                  isActive
                    ? "border-brand-500 ring-2 ring-brand-500/30 shadow-md"
                    : "border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5"
                } ${isDragging ? "opacity-30 scale-95" : ""}`}
                title={`드래그해서 페이지 순서 변경 (원본 페이지 ${originalIdx + 1})`}
              >
                {/* page number badge — top-left corner */}
                <div
                  className={`absolute -top-2 -left-2 min-w-[28px] h-7 px-2 rounded-full flex items-center justify-center text-xs font-bold shadow-sm z-10 ${
                    isActive ? "bg-brand-500 text-white" : "bg-gray-700 text-white"
                  }`}
                >
                  {displayIdx + 1}
                </div>

                <div className="flex justify-center">
                  <PageThumbnail pdfBytes={pdfBytes} originalPageIndex={originalIdx} targetWidth={260} />
                </div>

                {/* footer with display→original info */}
                <div
                  className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[11px] ${
                    isActive ? "border-brand-100 text-brand-700" : "border-gray-100 text-gray-400"
                  }`}
                >
                  <span className="font-medium">페이지 {displayIdx + 1}</span>
                  {originalIdx !== displayIdx && (
                    <span className="tabular-nums">원본 {originalIdx + 1}</span>
                  )}
                </div>
              </div>
              {showDropLine && (dropAt as number) > (dragFrom as number) && (
                <div className="absolute -bottom-2.5 left-0 right-0 h-1 bg-brand-500 rounded-full z-10 shadow-md shadow-brand-500/40" />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
