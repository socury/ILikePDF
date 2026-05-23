"use client";

import { useEffect, useState } from "react";
import { extractTextItems, type TextItem } from "@/lib/extractText";
import { useEditor } from "@/lib/store";

type Props = {
  pdfBytes: ArrayBuffer;
  pageIndex: number;
  width: number;
  height: number;
  enabled: boolean;
};

/**
 * Invisible overlay that detects existing PDF text regions.
 * Hover → subtle outline. Click → replace (whiteout + new editable text box).
 */
export default function TextLayer({ pdfBytes, pageIndex, width, height, enabled }: Props) {
  const [items, setItems] = useState<TextItem[]>([]);
  const scale = useEditor((s) => s.scale);

  useEffect(() => {
    let cancelled = false;
    extractTextItems(pdfBytes, pageIndex, scale).then((arr) => {
      if (!cancelled) setItems(arr);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, pageIndex, scale]);

  if (!enabled) return null;

  const onPick = (it: TextItem) => {
    const api = (window as any).__overlayApi;
    api?.replaceText?.({
      x: it.x,
      y: it.y,
      width: Math.max(it.width, 40),
      height: Math.max(it.height, 16),
      text: it.str,
      fontSize: it.fontSize,
    });
  };

  return (
    <div
      className="absolute inset-0"
      style={{ width, height, pointerEvents: "none" }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onPick(it)}
          title={`수정: "${it.str}"`}
          className="absolute group"
          style={{
            left: it.x,
            top: it.y,
            width: Math.max(it.width, 6),
            height: Math.max(it.height, 12),
            pointerEvents: "auto",
            background: "transparent",
            border: "1px solid transparent",
            cursor: "text",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(59,108,255,0.10)";
            (e.currentTarget as HTMLElement).style.border = "1px solid rgba(59,108,255,0.6)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.border = "1px solid transparent";
          }}
        />
      ))}
    </div>
  );
}
