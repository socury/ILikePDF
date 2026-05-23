/**
 * Extract text items from a rendered PDF page with screen-space bounding boxes.
 *
 * PDF.js gives us each text item with a transform matrix in PDF user space.
 * We multiply it by the viewport transform to get screen coordinates that align
 * exactly with what was rendered on the canvas at the current zoom level.
 */
export type TextItem = {
  id: string;
  str: string;
  x: number; // screen px, top-left
  y: number;
  width: number;
  height: number;
  fontSize: number; // approx, in screen px (== PDF size * scale)
};

export async function extractTextItems(
  pdfBytes: ArrayBuffer,
  pageIndex: number,
  scale: number,
): Promise<TextItem[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ data: pdfBytes.slice(0) }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent();

  // 1) Flatten raw items into screen-space rects
  const raw: TextItem[] = [];
  for (let i = 0; i < content.items.length; i++) {
    const it: any = content.items[i];
    if (!it.str) continue;

    const t = pdfjs.Util.transform(viewport.transform, it.transform);
    const fontSize = Math.hypot(t[2], t[3]);
    const w = (it.width || 0) * scale;
    const h = fontSize;

    // t[4], t[5] are baseline origin (bottom-left). Convert to top-left.
    const x = t[4];
    const y = t[5] - h;

    raw.push({
      id: `t-${pageIndex}-${i}`,
      str: it.str,
      x,
      y,
      width: w,
      height: h,
      fontSize,
    });
  }

  // 2) Group adjacent items on the same line into phrases.
  //    Why: PDF often splits text into glyph clusters / per-word fragments,
  //    so clicking gives single chars. Merging makes the click target = a full line.
  return mergeIntoLines(raw, pageIndex);
}

/**
 * Merge items that are on the same visual line and horizontally adjacent.
 * - Same line: vertical center difference < ~50% of font size
 * - Adjacent: horizontal gap < ~80% of font size (covers word spaces)
 */
function mergeIntoLines(items: TextItem[], pageIndex: number): TextItem[] {
  if (items.length === 0) return items;

  // Sort top→bottom, then left→right
  const sorted = [...items].sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > Math.min(a.fontSize, b.fontSize) * 0.4) return dy;
    return a.x - b.x;
  });

  const merged: TextItem[] = [];
  let cur: TextItem | null = null;

  for (const it of sorted) {
    if (!cur) {
      cur = { ...it };
      continue;
    }
    const sameLine =
      Math.abs((cur.y + cur.height / 2) - (it.y + it.height / 2)) <
      Math.min(cur.fontSize, it.fontSize) * 0.6;
    const gap = it.x - (cur.x + cur.width);
    const adjacent = gap < Math.max(cur.fontSize, it.fontSize) * 0.8;

    if (sameLine && adjacent && it.str.trim() !== "") {
      // Insert a space if there's a visible gap and current doesn't already end with whitespace
      const needsSpace =
        gap > Math.max(cur.fontSize, it.fontSize) * 0.15 &&
        !/\s$/.test(cur.str) &&
        !/^\s/.test(it.str);
      cur.str = cur.str + (needsSpace ? " " : "") + it.str;
      cur.width = it.x + it.width - cur.x;
      cur.height = Math.max(cur.height, it.height);
      cur.fontSize = Math.max(cur.fontSize, it.fontSize);
    } else {
      if (cur.str.trim()) merged.push(cur);
      cur = { ...it };
    }
  }
  if (cur && cur.str.trim()) merged.push(cur);

  // Re-id after merge
  return merged.map((m, i) => ({ ...m, id: `line-${pageIndex}-${i}` }));
}
