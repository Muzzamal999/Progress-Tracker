"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PdfDoc } from "@/lib/workflow-types";

/** Cloudinary renders any PDF page as an image: .../upload/pg_N,w_W/<id>.jpg */
function pageUrl(pdf: PdfDoc, page: number, width: number) {
  return pdf.url.replace("/upload/", `/upload/pg_${page},w_${width},q_auto,f_jpg/`).replace(/\.pdf$/i, ".jpg");
}
const download = (pdf: PdfDoc) => pdf.url.replace("/upload/", "/upload/fl_attachment/");
const PAGE_STEP = 10;

/**
 * Document card: first-page cover, page count, and a "Read online" reader that lists the pages one under
 * another (rendered by Cloudinary, loaded lazily) plus Open / Download buttons for the original PDF.
 */
export function PdfViewer({ pdf, label = "PDF document" }: { pdf: PdfDoc; label?: string }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_STEP);
  const pages = Math.max(1, pdf.pages || 1);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex flex-wrap items-center gap-4 p-3 sm:p-4">
        <div className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md border border-border bg-secondary shadow-sm">
          <FileText className="absolute inset-0 m-auto h-7 w-7 text-muted-foreground/50" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pageUrl(pdf, 1, 240)} alt="" loading="lazy" className="relative h-full w-full object-cover object-top" onError={(e) => (e.currentTarget.style.display = "none")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate font-semibold">{pdf.name}</p>
          <p className="text-xs text-muted-foreground">{pages} {pages === 1 ? "page" : "pages"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? <ChevronUp /> : <ChevronDown />} {open ? "Close reader" : "Read online"}
            </Button>
            <Button asChild size="sm" variant="outline"><a href={pdf.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open</a></Button>
            <Button asChild size="sm" variant="outline"><a href={download(pdf)}><Download /> Download</a></Button>
          </div>
        </div>
      </div>
      {open && (
        <div className="max-h-[75vh] space-y-4 overflow-y-auto border-t border-border bg-secondary/40 p-3 sm:p-5">
          {Array.from({ length: Math.min(pages, shown) }, (_, i) => i + 1).map((n) => (
            <figure key={n} className="mx-auto max-w-3xl overflow-hidden rounded-lg bg-white shadow-(--shadow-card)">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pageUrl(pdf, n, 1100)} alt={`${pdf.name}, page ${n} of ${pages}`} loading="lazy" className="block min-h-48 w-full" />
              <figcaption className="border-t border-border bg-card py-1 text-center text-xs text-muted-foreground">Page {n} of {pages}</figcaption>
            </figure>
          ))}
          {shown < pages && (
            <div className="text-center">
              <Button type="button" variant="outline" size="sm" onClick={() => setShown((s) => s + PAGE_STEP)}>Show more pages ({pages - shown} left)</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
