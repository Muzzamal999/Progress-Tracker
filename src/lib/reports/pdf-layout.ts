/**
 * A small A4 report layout engine on top of pdf-lib: header/logo, headings, stat cards, wrapped tables
 * that repeat their header on every page, and "Page X of Y" + generation timestamp footers.
 * No I/O here (the logo bytes are passed in), so it is unit-testable.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatPkt } from "../time";

export const A4 = { w: 595.28, h: 841.89 } as const;
const MARGIN = 40;
const FOOTER_H = 34;
const HEADER_H = 26; // compact running header on pages after the first

export const COLORS = {
  ink: rgb(0.11, 0.13, 0.2),
  muted: rgb(0.4, 0.43, 0.5),
  line: rgb(0.85, 0.87, 0.91),
  band: rgb(0.95, 0.96, 0.98),
  good: rgb(0.08, 0.5, 0.25),
  warn: rgb(0.7, 0.42, 0.02),
  bad: rgb(0.72, 0.13, 0.13),
  info: rgb(0.1, 0.35, 0.7),
};

export interface Cell {
  text: string;
  color?: RGB;
  bold?: boolean;
}
export type CellInput = string | Cell;
export interface Column {
  header: string;
  /** relative width; columns are scaled to fill the page */
  width: number;
  align?: "left" | "right" | "center";
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return rgb(0.31, 0.27, 0.9);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export interface BuilderOptions {
  orgName: string;
  tagline?: string | null;
  accent: string;
  logoPng?: Uint8Array | null;
  title: string;
  subtitleLines: string[];
  documentTitle: string;
}

export class PdfBuilder {
  private page!: PDFPage;
  private y = 0;
  private pageNo = 0;
  private constructor(
    readonly doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
    private logo: PDFImage | null,
    private o: BuilderOptions,
    private accent: RGB,
    private charset: Set<number>,
  ) {}

  static async create(o: BuilderOptions): Promise<PdfBuilder> {
    const doc = await PDFDocument.create();
    doc.setTitle(o.documentTitle);
    doc.setAuthor(o.orgName);
    doc.setCreator("Student Journey Atlas");
    doc.setProducer("Student Journey Atlas (pdf-lib)");
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let logo: PDFImage | null = null;
    if (o.logoPng) {
      try {
        logo = await doc.embedPng(o.logoPng);
      } catch {
        logo = null; // a bad logo must never break the report
      }
    }
    const b = new PdfBuilder(doc, regular, bold, logo, o, hexToRgb(o.accent), new Set(regular.getCharacterSet()));
    b.newPage(true);
    return b;
  }

  /** Make text safe for the standard fonts (WinAnsi): strip accents where possible, '?' otherwise. */
  clean(input: string): string {
    let out = "";
    for (const ch of (input ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ")) {
      const cp = ch.codePointAt(0) as number;
      if (ch === "\n" || this.charset.has(cp)) {
        out += ch;
        continue;
      }
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += base && [...base].every((c) => this.charset.has(c.codePointAt(0) as number)) ? base : "?";
    }
    return out;
  }

  private get contentW() {
    return A4.w - MARGIN * 2;
  }
  private get bottom() {
    return MARGIN + FOOTER_H;
  }

  private newPage(first = false) {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pageNo++;
    this.y = A4.h - MARGIN;
    if (first) this.firstHeader();
    else this.runningHeader();
  }

  private firstHeader() {
    const p = this.page;
    let textX = MARGIN;
    let top = this.y;
    if (this.logo) {
      const scale = Math.min(46 / this.logo.height, 120 / this.logo.width);
      const w = this.logo.width * scale;
      const h = this.logo.height * scale;
      p.drawImage(this.logo, { x: MARGIN, y: top - h, width: w, height: h });
      textX = MARGIN + w + 12;
    }
    p.drawText(this.clean(this.o.orgName), { x: textX, y: top - 16, size: 16, font: this.bold, color: this.accent, maxWidth: A4.w - MARGIN - textX });
    if (this.o.tagline) p.drawText(this.clean(this.o.tagline), { x: textX, y: top - 31, size: 9, font: this.regular, color: COLORS.muted, maxWidth: A4.w - MARGIN - textX });
    top -= 54;
    p.drawLine({ start: { x: MARGIN, y: top }, end: { x: A4.w - MARGIN, y: top }, thickness: 1.5, color: this.accent });
    top -= 24;
    p.drawText(this.clean(this.o.title), { x: MARGIN, y: top, size: 18, font: this.bold, color: COLORS.ink, maxWidth: this.contentW });
    top -= 8;
    for (const line of this.o.subtitleLines) {
      top -= 14;
      p.drawText(this.clean(line), { x: MARGIN, y: top, size: 10, font: this.regular, color: COLORS.muted, maxWidth: this.contentW });
    }
    this.y = top - 18;
  }

  private runningHeader() {
    const p = this.page;
    p.drawText(this.clean(this.o.orgName), { x: MARGIN, y: this.y - 10, size: 9, font: this.bold, color: this.accent });
    const t = this.clean(this.o.title);
    const w = this.regular.widthOfTextAtSize(t, 9);
    p.drawText(t, { x: A4.w - MARGIN - Math.min(w, this.contentW / 2), y: this.y - 10, size: 9, font: this.regular, color: COLORS.muted, maxWidth: this.contentW / 2 });
    p.drawLine({ start: { x: MARGIN, y: this.y - 16 }, end: { x: A4.w - MARGIN, y: this.y - 16 }, thickness: 0.6, color: COLORS.line });
    this.y -= HEADER_H + 8;
  }

  ensure(h: number) {
    if (this.y - h < this.bottom) this.newPage();
  }
  space(h: number) {
    this.y -= h;
  }

  heading(text: string, size = 12) {
    this.ensure(size + 70); // keep a heading together with the content that follows it
    this.y -= 6;
    this.page.drawText(this.clean(text), { x: MARGIN, y: this.y - size, size, font: this.bold, color: COLORS.ink });
    this.y -= size + 4;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4.w - MARGIN, y: this.y }, thickness: 0.6, color: COLORS.line });
    this.y -= 8;
  }

  /** Wrapped paragraph; returns nothing, flows across pages. */
  paragraph(text: string, opts: { size?: number; color?: RGB; bold?: boolean; indent?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.regular;
    const indent = opts.indent ?? 0;
    for (const line of this.wrap(text, font, size, this.contentW - indent)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color: opts.color ?? COLORS.ink });
      this.y -= size + 3.5;
    }
  }

  /** Row of label/value stat cards (4 per row). */
  stats(items: { label: string; value: string | number; color?: RGB }[]) {
    const perRow = 4;
    const gap = 8;
    const w = (this.contentW - gap * (perRow - 1)) / perRow;
    const h = 44;
    for (let i = 0; i < items.length; i += perRow) {
      this.ensure(h + 8);
      items.slice(i, i + perRow).forEach((it, j) => {
        const x = MARGIN + j * (w + gap);
        this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, color: COLORS.band, borderColor: COLORS.line, borderWidth: 0.6 });
        this.page.drawText(this.clean(String(it.value)), { x: x + 8, y: this.y - 22, size: 16, font: this.bold, color: it.color ?? COLORS.ink, maxWidth: w - 12 });
        this.page.drawText(this.clean(it.label), { x: x + 8, y: this.y - 36, size: 7.5, font: this.regular, color: COLORS.muted, maxWidth: w - 12 });
      });
      this.y -= h + 8;
    }
  }

  /** Two-column "label: value" block. */
  facts(rows: [string, string][]) {
    for (const [k, v] of rows) {
      const lines = this.wrap(v || "-", this.regular, 9.5, this.contentW - 110);
      this.ensure(lines.length * 12 + 2);
      this.page.drawText(this.clean(k), { x: MARGIN, y: this.y - 9.5, size: 9, font: this.bold, color: COLORS.muted });
      lines.forEach((ln, i) => this.page.drawText(ln, { x: MARGIN + 110, y: this.y - 9.5 - i * 12, size: 9.5, font: this.regular, color: COLORS.ink }));
      this.y -= lines.length * 12 + 2;
    }
  }

  /** A table whose header repeats on every page. Rows never split across pages. */
  table(columns: Column[], rows: CellInput[][], opts: { size?: number; emptyText?: string; maxLines?: number } = {}) {
    const size = opts.size ?? 8.5;
    const lh = size + 3;
    const maxLines = opts.maxLines ?? 10;
    const total = columns.reduce((n, c) => n + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.contentW);
    const pad = 4;

    const drawHeader = () => {
      this.ensure(lh + 14);
      this.page.drawRectangle({ x: MARGIN, y: this.y - lh - 4, width: this.contentW, height: lh + 4, color: this.accent });
      let x = MARGIN;
      columns.forEach((c, i) => {
        this.page.drawText(this.clean(c.header), { x: this.alignX(c.header, this.bold, size, x, widths[i], c.align, pad), y: this.y - lh + 1, size, font: this.bold, color: rgb(1, 1, 1), maxWidth: widths[i] - pad * 2 });
        x += widths[i];
      });
      this.y -= lh + 4;
    };

    if (rows.length === 0) {
      this.paragraph(opts.emptyText ?? "No records.", { color: COLORS.muted, size: 9 });
      this.space(4);
      return;
    }
    drawHeader();
    rows.forEach((row, ri) => {
      const cells = row.map((c) => (typeof c === "string" ? { text: c } : c));
      const wrapped = cells.map((c, i) => this.capLines(this.wrap(c.text || "-", c.bold ? this.bold : this.regular, size, widths[i] - pad * 2), maxLines));
      const lines = Math.max(...wrapped.map((w) => w.length), 1);
      const h = lines * lh + 6;
      if (this.y - h < this.bottom) {
        this.newPage();
        drawHeader();
      }
      if (ri % 2 === 1) this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: this.contentW, height: h, color: rgb(0.975, 0.98, 0.99) });
      let x = MARGIN;
      cells.forEach((c, i) => {
        const font = c.bold ? this.bold : this.regular;
        wrapped[i].forEach((ln, li) =>
          this.page.drawText(ln, { x: this.alignX(ln, font, size, x, widths[i], columns[i].align, pad), y: this.y - lh * (li + 1) + 2, size, font, color: c.color ?? COLORS.ink }),
        );
        x += widths[i];
      });
      this.page.drawLine({ start: { x: MARGIN, y: this.y - h }, end: { x: MARGIN + this.contentW, y: this.y - h }, thickness: 0.4, color: COLORS.line });
      this.y -= h;
    });
    this.space(8);
  }

  private alignX(text: string, font: PDFFont, size: number, x: number, w: number, align: Column["align"], pad: number) {
    const tw = font.widthOfTextAtSize(this.clean(text), size);
    if (align === "right") return x + w - pad - Math.min(tw, w - pad * 2);
    if (align === "center") return x + (w - Math.min(tw, w - pad * 2)) / 2;
    return x + pad;
  }

  private capLines(lines: string[], max: number) {
    if (lines.length <= max) return lines;
    const cut = lines.slice(0, max);
    cut[max - 1] = cut[max - 1].replace(/.{0,3}$/, "...");
    return cut;
  }

  /** Word-wrap `text` to `width` points; very long words are broken. */
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of this.clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          let n = w.length;
          while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
          if (line) {
            out.push(line);
            line = "";
          }
          out.push(w.slice(0, n));
          w = w.slice(n);
        }
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else {
          out.push(line);
          line = w;
        }
      }
      out.push(line);
    }
    return out.length ? out : [""];
  }

  /** Adds "Page X of Y", the generation timestamp and organisation to every page, then serialises. */
  async finish(generatedAt: Date, note?: string): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    const stamp = `Generated ${formatPkt(generatedAt)}`;
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: MARGIN, y: MARGIN + 22 }, end: { x: A4.w - MARGIN, y: MARGIN + 22 }, thickness: 0.5, color: COLORS.line });
      p.drawText(this.clean(`${this.o.orgName} - ${stamp}`), { x: MARGIN, y: MARGIN + 8, size: 7.5, font: this.regular, color: COLORS.muted, maxWidth: this.contentW - 90 });
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(label, { x: A4.w - MARGIN - this.regular.widthOfTextAtSize(label, 8), y: MARGIN + 8, size: 8, font: this.regular, color: COLORS.muted });
      if (note && i === pages.length - 1) p.drawText(this.clean(note), { x: MARGIN, y: MARGIN + 28, size: 7, font: this.regular, color: COLORS.muted, maxWidth: this.contentW });
    });
    return this.doc.save();
  }
}
