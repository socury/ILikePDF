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
 * Load a Korean-capable font. We prefer TrueType (TTF) because pdf-lib + fontkit
 * sometimes fails to subset CFF-based OTFs silently — when that happens the
 * embed throws and we fall back to Helvetica, which can't encode Hangul.
 *
 * Order:
 *   1) NanumGothic-Regular.ttf  (TrueType, most reliable with pdf-lib)
 *   2) Pretendard-Regular.otf   (legacy, kept as fallback)
 */
async function loadKoreanFont(): Promise<ArrayBuffer | null> {
  for (const path of ["/fonts/NanumGothic-Regular.ttf", "/fonts/Pretendard-Regular.otf"]) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.arrayBuffer();
    } catch {
      /* try next */
    }
  }
  return null;
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
  // Use a unified Korean+Latin font so mixed text renders consistently.
  // Try subset first (smaller PDF); if that throws (e.g., subsetting a CFF
  // OTF fails inside fontkit), retry full embed before giving up.
  let unifont = helv;
  const koreanBytes = await loadKoreanFont();
  if (koreanBytes) {
    try {
      unifont = await pdf.embedFont(koreanBytes, { subset: true });
    } catch (err1) {
      // eslint-disable-next-line no-console
      console.warn("[exportPdf] subset font embed failed, retrying full embed", err1);
      try {
        unifont = await pdf.embedFont(koreanBytes);
      } catch (err2) {
        // eslint-disable-next-line no-console
        console.error("[exportPdf] font embed failed entirely; Korean text will not render", err2);
        unifont = helv;
      }
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn("[exportPdf] no Korean font available; Korean text will not render");
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
      // Helvetica can't encode Hangul. If we got stuck with helv as fallback
      // AND the text contains Korean, drawing would throw. Skip the op (no
      // text rendered) rather than producing rows of "?" placeholders.
      const cannotRender = unifont === helv && hasKoreanChars(op.text);
      if (cannotRender) {
        // eslint-disable-next-line no-console
        console.warn("[exportPdf] skipping Korean text op (font unavailable)", op.id);
        continue;
      }
      try {
        page.drawText(op.text, {
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
