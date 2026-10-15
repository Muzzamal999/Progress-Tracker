"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedAsset } from "@/components/ImageUploader";
import { submitReportAction } from "@/app/actions/student";

export function ReportForm({ today }: { today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedAsset[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    const hours = String(f.get("hours") ?? "").trim();
    const res = await submitReportAction({
      reportDate: f.get("date"),
      summary: f.get("summary"),
      hours: hours === "" ? null : Number(hours),
      blockers: f.get("blockers"),
      attachments: files,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Report submitted");
    setFiles([]);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="date" label="Date"><Input id="date" name="date" type="date" defaultValue={today} max={today} required /></Field>
        <Field id="hours" label="Hours worked (optional)"><Input id="hours" name="hours" type="number" min={0} max={24} step={0.5} /></Field>
      </div>
      <Field id="summary" label="What did you do today?"><Textarea id="summary" name="summary" maxLength={4000} required /></Field>
      <Field id="blockers" label="Blockers (optional)"><Textarea id="blockers" name="blockers" maxLength={2000} className="min-h-16" /></Field>
      <ImageUploader purpose="evidence" value={files} onChange={setFiles} label="Attach screenshots (optional)" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit report"}</Button>
    </form>
  );
}
