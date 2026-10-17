"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UploadedPdf {
  url: string;
  publicId: string;
  name: string;
  pages: number;
  bytes: number;
}
type PdfPurpose = "manualpdf" | "labreport";

export const MAX_PDF_MB = 10;

/** Signed, direct-to-Cloudinary upload of one PDF. The server re-verifies the asset (format, size, pages) on save. */
export async function uploadPdf(file: File, purpose: PdfPurpose): Promise<UploadedPdf> {
  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose }),
  });
  if (!signRes.ok) throw new Error(signRes.status === 401 ? "Please sign in again" : "Could not start the upload");
  const sig = (await signRes.json()) as { timestamp: number; signature: string; apiKey: string; cloudName: string; folder: string; allowedFormats: string };
  const body = new FormData();
  body.append("file", file);
  body.append("api_key", sig.apiKey);
  body.append("timestamp", String(sig.timestamp));
  body.append("signature", sig.signature);
  body.append("folder", sig.folder);
  body.append("allowed_formats", sig.allowedFormats);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body });
  if (!res.ok) throw new Error("PDF upload failed");
  const json = (await res.json()) as { secure_url: string; public_id: string; pages?: number; bytes?: number };
  return { url: json.secure_url, publicId: json.public_id, name: file.name, pages: json.pages ?? 1, bytes: json.bytes ?? file.size };
}

const formatSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function PdfUploader({
  purpose,
  value,
  onChange,
  label = "Upload PDF",
  disabled,
}: {
  purpose: PdfPurpose;
  value: UploadedPdf | null;
  onChange: (v: UploadedPdf | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setError(null);
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setError("Only PDF files are allowed");
    if (f.size > MAX_PDF_MB * 1024 * 1024) return setError(`The PDF must be ${MAX_PDF_MB} MB or smaller`);
    setBusy(true);
    try {
      onChange(await uploadPdf(f, purpose));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400"><FileText aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{value.name}</p>
            <p className="text-xs text-muted-foreground">PDF · {value.pages} {value.pages === 1 ? "page" : "pages"} · {formatSize(value.bytes)}</p>
          </div>
          <button type="button" aria-label="Remove PDF" disabled={disabled} onClick={() => onChange(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" id={`up-${purpose}`} onChange={(e) => onFile(e.target.files)} disabled={busy || disabled} />
          <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} {busy ? "Uploading..." : label}
          </Button>
        </>
      )}
      <p className="text-xs text-muted-foreground">PDF only, up to {MAX_PDF_MB} MB.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
