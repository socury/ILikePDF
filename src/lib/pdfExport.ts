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
  // FULL EMBED (subset: false). pdf-lib + fontkit's CJK subsetting drops
  // random Korean glyphs in some PDFs (e.g., 잭/스/터 missing). The cost is
  // a ~2MB PDF size bump, which we accept in exchange for correctness.
  let unifont = helv;
  const koreanBytes = await loadKoreanFont();
  if (koreanBytes) {
    try {
      unifont = await pdf.embedFont(koreanBytes, { subset: false });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[exportPdf] font embed failed; Korean text will not render", err);
      unifont = helv;
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
      // Normalize to NFC so decomposed Hangul (NFD) syllables collapse to the
      // precomposed code points the font's cmap actually contains.
      const normalized = op.text.normalize("NFC");

      const cannotRender = unifont === helv && hasKoreanChars(normalized);
      if (cannotRender) {
        // eslint-disable-next-line no-console
        console.warn("[exportPdf] skipping Korean text op (font unavailable)", op.id);
        continue;
      }

      // Split by explicit newlines and draw each line manually. We avoid
      // pdf-lib's maxWidth/auto-wrap because it splits on whitespace, which
      // is wrong for Korean (no inter-syllable spaces) and can hide glyphs.
      const lines = normalized.split(/\r?\n/);
      const lineHeight = c.fontSize * 1.25;
      const topY = c.y + Math.max(0, c.h - c.fontSize);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        try {
          page.drawText(line, {
            x: c.x,
            y: topY - i * lineHeight,
            size: c.fontSize,
            font: unifont,
            color: hexToRgb(op.color),
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            "[exportPdf] drawText failed",
            { id: op.id, line, codes: [...line].map((c) => c.codePointAt(0)?.toString(16)) },
            err,
          );
        }
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
