"use client";

import { useEffect, useRef, useState } from "react";
import { extractTextItems, type TextItem } from "@/lib/extractText";
import { useEditor } from "@/lib/store";

type Props = {
  pdfBytes: ArrayBuffer;
  pageIndex: number;
  width: number;
  height: number;
  enabled: boolean;
};

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Invisible click/drag selection layer over detected PDF text.
 *  - Click a text line  → replace that line
 *  - Click + drag       → marquee selects every line that intersects the box,
 *                         merges them in reading order, and replaces as one block
 */
export default function TextLayer({ pdfBytes, pageIndex, width, height, enabled }: Props) {
  const [items, setItems] = useState<TextItem[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const scale = useEditor((s) => s.scale);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x0: number; y0: number; moved: boolean } | null>(null);

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

  const localPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const itemAt = (x: number, y: number): TextItem | null => {
    // Pick the topmost-ish match (last in array wins for overlapping)
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (x >= it.x && x <= it.x + it.width && y >= it.y && y <= it.y + it.height) return it;
    }
    return null;
  };

  const itemsInRect = (r: Rect): TextItem[] => {
    return items.filter((it) => {
      const ix2 = it.x + it.width;
      const iy2 = it.y + it.height;
      const rx2 = r.x + r.w;
      const ry2 = r.y + r.h;
      return !(it.x > rx2 || ix2 < r.x || it.y > ry2 || iy2 < r.y);
    });
  };

  const triggerReplace = (picked: TextItem[]) => {
    if (!picked.length) return;
    // Sort by reading order: top → bottom, then left → right within a line
    const sorted = [...picked].sort((a, b) => {
      const lineGap = Math.min(a.fontSize, b.fontSize) * 0.6;
      if (Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) > lineGap) return a.y - b.y;
      return a.x - b.x;
    });

    // Group into visual lines for newline insertion
    const lines: TextItem[][] = [];
    let curLine: TextItem[] = [];
    let curY = -Infinity;
    for (const it of sorted) {
      const midY = it.y + it.height / 2;
      if (!curLine.length || Math.abs(midY - curY) <= it.fontSize * 0.6) {
        curLine.push(it);
        curY = curLine.reduce((s, x) => s + (x.y + x.height / 2), 0) / curLine.length;
      } else {
        lines.push(curLine);
        curLine = [it];
        curY = midY;
      }
    }
    if (curLine.length) lines.push(curLine);

    const text = lines.map((l) => l.map((x) => x.str).join("")).join("\n");

    const minX = Math.min(...sorted.map((s) => s.x));
    const minY = Math.min(...sorted.map((s) => s.y));
    const maxX = Math.max(...sorted.map((s) => s.x + s.width));
    const maxY = Math.max(...sorted.map((s) => s.y + s.height));
    const fontSize = Math.max(...sorted.map((s) => s.fontSize));

    (window as any).__overlayApi?.replaceText?.({
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 40),
      height: Math.max(maxY - minY, 16),
      text,
      fontSize,
    });
  };

  // --- mouse handlers (container) ---
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const p = localPoint(e.clientX, e.clientY);
    dragRef.current = { x0: p.x, y0: p.y, moved: false };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const p2 = localPoint(ev.clientX, ev.clientY);
      const dx = p2.x - dragRef.current.x0;
      const dy = p2.y - dragRef.current.y0;
      if (!dragRef.current.moved && Math.hypot(dx, dy) > 4) {
        dragRef.current.moved = true;
      }
      if (dragRef.current.moved) {
        setMarquee({
          x: Math.min(dragRef.current.x0, p2.x),
          y: Math.min(dragRef.current.y0, p2.y),
          w: Math.abs(dx),
          h: Math.abs(dy),
        });
      }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const drag = dragRef.current;
      dragRef.current = null;
      setMarquee(null);
      if (!drag) return;
      const p2 = localPoint(ev.clientX, ev.clientY);

      if (drag.moved) {
        const rect: Rect = {
          x: Math.min(drag.x0, p2.x),
          y: Math.min(drag.y0, p2.y),
          w: Math.abs(p2.x - drag.x0),
          h: Math.abs(p2.y - drag.y0),
        };
        const picked = itemsInRect(rect);
        triggerReplace(picked);
      } else {
        const hit = itemAt(p2.x, p2.y);
        if (hit) triggerReplace([hit]);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) return; // skip hover during drag
    const p = localPoint(e.clientX, e.clientY);
    const hit = itemAt(p.x, p.y);
    setHoverId(hit?.id ?? null);
  };

  const onMouseLeave = () => {
    if (!dragRef.current) setHoverId(null);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ width, height, cursor: "text" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* hover outline on individual lines */}
      {items.map((it) => {
        const active = hoverId === it.id && !marquee;
        return (
          <div
            key={it.id}
            className="absolute pointer-events-none transition-colors"
            style={{
              left: it.x,
              top: it.y,
              width: Math.max(it.width, 6),
              height: Math.max(it.height, 12),
              background: active ? "rgba(59,108,255,0.10)" : "transparent",
              border: active ? "1px solid rgba(59,108,255,0.6)" : "1px solid transparent",
            }}
          />
        );
      })}

      {/* highlight items intersected by the marquee while dragging */}
      {marquee &&
        itemsInRect(marquee).map((it) => (
          <div
            key={`sel-${it.id}`}
            className="absolute pointer-events-none"
            style={{
              left: it.x,
              top: it.y,
              width: Math.max(it.width, 6),
              height: Math.max(it.height, 12),
              background: "rgba(59,108,255,0.18)",
              border: "1px solid rgba(59,108,255,0.8)",
            }}
          />
        ))}

      {/* the marquee rectangle itself */}
      {marquee && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            background: "rgba(59,108,255,0.08)",
            border: "1px dashed rgba(59,108,255,0.7)",
          }}
        />
      )}
    </div>
  );
}
