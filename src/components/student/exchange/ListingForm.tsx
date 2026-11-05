"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { PdfUploader, type UploadedPdf } from "@/components/PdfUploader";
import { saveListingAction } from "@/app/actions/exchange";
import type { ExchangeLink, ExchangeListingRow } from "@/lib/workflow-types";

export function ListingForm({ exchangeId, listing }: { exchangeId: string; listing: ExchangeListingRow | null }) {
  const router = useRouter();
  const [projectName, setProjectName] = useState(listing?.project_name ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [links, setLinks] = useState<ExchangeLink[]>(listing?.links ?? []);
  const [pdf, setPdf] = useState<UploadedPdf | null>(listing?.pdf ? { url: listing.pdf.url, publicId: listing.pdf.public_id, name: listing.pdf.name, pages: listing.pdf.pages, bytes: listing.pdf.bytes } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLink(i: number, patch: Partial<ExchangeLink>) {
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveListingAction({
      exchangeId, projectName, description, links: links.filter((l) => l.label.trim() && l.url.trim()),
      pdf: pdf ? { url: pdf.url, publicId: pdf.publicId, name: pdf.name } : null,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(listing ? "Listing updated" : "Listing posted — acceptors can now find it");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
      <p className="text-sm text-muted-foreground">This is what acceptors see. Your name is never shown to them — only your project name and what you share here.</p>
      <Field id="pn" label="Project name"><Input id="pn" value={projectName} onChange={(e) => setProjectName(e.target.value)} required maxLength={160} /></Field>
      <Field id="pd" label="Description"><Textarea id="pd" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} className="min-h-28" /></Field>

      <div className="space-y-2">
        <p className="text-sm font-medium">Links (Figma, repo, docs, drive...)</p>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <Input value={l.label} onChange={(e) => updateLink(i, { label: e.target.value })} placeholder="Label (e.g. Figma)" maxLength={40} className="w-36" />
            <Input value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} placeholder="https://" className="flex-1" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => setLinks((ls) => ls.filter((_, idx) => idx !== i))}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        {links.length < 8 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinks((ls) => [...ls, { label: "", url: "" }])}><Plus /> Add a link</Button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Attachment (optional PDF)</p>
        <PdfUploader purpose="exchangepdf" value={pdf} onChange={setPdf} label="Attach a PDF" />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || !projectName.trim()}>{busy ? "Saving..." : listing ? "Save changes" : "Post listing"}</Button>
    </form>
  );
}
