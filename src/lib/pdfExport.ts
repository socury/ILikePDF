import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { EditOp } from "./types";

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

async function loadKoreanFont(): Promise<ArrayBuffer | null> {
  // Try to load a Korean font from a CDN. If it fails (offline), caller will fallback.
  try {
    const url =
      "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-kr@5.0.18/files/noto-sans-kr-korean-400-normal.woff";
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Export the edited PDF.
 * @param sourceBytes original PDF bytes
 * @param ops edit operations
 * @param toPdfCoord converts editor (top-left, screen px) to PDF coords (bottom-left, points) per page
 */
export async function exportPdf(
  sourceBytes: ArrayBuffer,
  ops: EditOp[],
  toPdfCoord: (op: EditOp, pageHeight: number) => { x: number; y: number; w: number; h: number },
  pageOrder?: number[], // optional: display→original mapping. If omitted, identity.
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(sourceBytes);
  pdf.registerFontkit(fontkit);

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  let korean = helv;
  const koreanBytes = await loadKoreanFont();
  if (koreanBytes) {
    try {
      korean = await pdf.embedFont(koreanBytes, { subset: true });
    } catch {
      korean = helv;
    }
  }

  const pages = pdf.getPages();

  for (const op of ops) {
    const page = pages[op.pageIndex];
    if (!page) continue;
    const { height: ph } = page.getSize();
    const c = toPdfCoord(op, ph);

    if (op.type === "whiteout") {
      page.drawRectangle({
        x: c.x,
        y: c.y,
        width: c.w,
        height: c.h,
        color: hexToRgb(op.color || "#ffffff"),
        borderWidth: 0,
      });
    } else if (op.type === "text") {
      const hasKorean = /[ㄱ-힝]/.test(op.text);
      const font = hasKorean ? korean : helv;
      page.drawText(op.text, {
        x: c.x,
        y: c.y + (c.h - op.fontSize), // anchor near top of box
        size: op.fontSize,
        font,
        color: hexToRgb(op.color),
        maxWidth: c.w,
      });
    } else if (op.type === "image") {
      const isPng = op.dataUrl.startsWith("data:image/png");
      const bytes = await fetch(op.dataUrl).then((r) => r.arrayBuffer());
      const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      page.drawImage(img, { x: c.x, y: c.y, width: c.w, height: c.h });
    }
  }

  // If page order was changed, build a new document with pages copied in the desired order.
  const identity =
    !pageOrder ||
    pageOrder.length !== pages.length ||
    pageOrder.every((v, i) => v === i);
  if (identity) {
    return await pdf.save();
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(pdf, pageOrder);
  copied.forEach((p) => out.addPage(p));
  return await out.save();
}
