"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_MB } from "@/lib/validation";

export interface UploadedAsset {
  url: string;
  publicId: string;
}
type Purpose = "avatar" | "evidence" | "manual" | "branding";

/** Signed, direct-to-Cloudinary upload of up to `max` images. The server re-verifies every asset on save. */
export async function uploadImage(file: File, purpose: Purpose): Promise<UploadedAsset> {
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
  if (!res.ok) throw new Error("Image upload failed");
  const json = (await res.json()) as { secure_url: string; public_id: string };
  return { url: json.secure_url, publicId: json.public_id };
}

export function ImageUploader({
  purpose,
  value,
  onChange,
  max = 6,
  label = "Add images",
  disabled,
}: {
  purpose: Purpose;
  value: UploadedAsset[];
  onChange: (v: UploadedAsset[]) => void;
  max?: number;
  label?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = max - value.length;
    const picked = Array.from(files).slice(0, room);
    for (const f of picked) {
      if (!ALLOWED_IMAGE_TYPES.includes(f.type)) return setError("Only JPG, PNG or WebP images are allowed");
      if (f.size > MAX_IMAGE_MB * 1024 * 1024) return setError(`Each image must be ${MAX_IMAGE_MB} MB or smaller`);
    }
    setBusy(true);
    try {
      const uploaded: UploadedAsset[] = [];
      for (const f of picked) uploaded.push(await uploadImage(f, purpose));
      onChange([...value, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {value.map((a) => (
            <li key={a.publicId} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="Uploaded evidence" className="h-20 w-20 rounded-lg border border-border object-cover" />
              <button
                type="button"
                aria-label="Remove image"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x.publicId !== a.publicId))}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <>
          <input ref={input} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} multiple={max > 1} className="sr-only" id={`up-${purpose}`} onChange={(e) => onFiles(e.target.files)} disabled={busy || disabled} />
          <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} {busy ? "Uploading..." : label}
          </Button>
        </>
      )}
      <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to {MAX_IMAGE_MB} MB each{max > 1 ? `, max ${max}` : ""}.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
