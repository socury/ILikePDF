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

/**
 * Load the bundled Korean-capable font (Pretendard Regular OTF).
 * Self-hosted in /public/fonts so we don't depend on a third-party CDN
 * (which silently returned subsetted fonts and caused missing glyphs).
 */
async function loadKoreanFont(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch("/fonts/Pretendard-Regular.otf");
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Detect Korean (Hangul Jamo + Hangul Syllables). */
function hasKoreanChars(s: string): boolean {
  return /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯]/.test(s);
}

/**
 * Coord object returned by the caller. All values in PDF points,
 * already converted from screen pixels.
 */
type PdfCoord = {
  x: number;
  y: number; // bottom-left origin
  w: number;
  h: number;
  fontSize: number; // in PDF points (already converted from screen px)
};

export async function exportPdf(
  sourceBytes: ArrayBuffer,
  ops: EditOp[],
  toPdfCoord: (op: EditOp, pageHeight: number) => PdfCoord,
  pageOrder?: number[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(sourceBytes);
  pdf.registerFontkit(fontkit);

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  // Pretendard covers Latin + Hangul + common symbols. Use it for ALL text so
  // mixed Korean/English renders consistently and we don't fight the
  // Helvetica/Hangul encoding split.
  let unifont = helv;
  const koreanBytes = await loadKoreanFont();
  if (koreanBytes) {
    try {
      unifont = await pdf.embedFont(koreanBytes, { subset: true });
    } catch {
      unifont = helv;
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
      // Always use the unified font (Pretendard if loaded, Helvetica fallback).
      // For Helvetica fallback with Korean text, strip non-WinAnsi chars so we
      // don't abort the entire export.
      const safeText =
        unifont === helv && hasKoreanChars(op.text)
          ? op.text.replace(/[^\x00-\xff]/g, "?")
          : op.text;
      try {
        page.drawText(safeText, {
          x: c.x,
          y: c.y + Math.max(0, c.h - c.fontSize),
          size: c.fontSize,
          font: unifont,
          color: hexToRgb(op.color),
          maxWidth: c.w,
          lineHeight: c.fontSize * 1.2,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[exportPdf] drawText failed for op", op.id, err);
      }
    } else if (op.type === "image") {
      const isPng = op.dataUrl.startsWith("data:image/png");
      const bytes = await fetch(op.dataUrl).then((r) => r.arrayBuffer());
      const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      page.drawImage(img, { x: c.x, y: c.y, width: c.w, height: c.h });
    }
  }

  const identity =
    !pageOrder ||
    pageOrder.length !== pages.length ||
    pageOrder.every((v, i) => v === i);
  if (identity) return await pdf.save();

  const out = await PDFDocument.create();
  const copied = await out.copyPages(pdf, pageOrder);
  copied.forEach((p) => out.addPage(p));
  return await out.save();
}
