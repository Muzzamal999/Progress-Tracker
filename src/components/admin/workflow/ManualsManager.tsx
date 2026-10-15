"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, EmptyState } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedAsset } from "@/components/ImageUploader";
import { createManualAction, deleteRowAction } from "@/app/actions/admin-workflow";
import type { BatchRow, ClassRow, ManualRow } from "@/lib/workflow-types";

export function ManualsManager({ classes, batches, manuals }: { classes: ClassRow[]; batches: BatchRow[]; manuals: ManualRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedAsset[]>([]);
  const [classId, setClassId] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    const res = await createManualAction({ classId: f.get("class"), batchId: f.get("batch") ? String(f.get("batch")) : null, title: f.get("title"), description: f.get("description"), body: f.get("body"), images });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Lab manual published");
    setImages([]);
    form.reset();
    setClassId("");
    router.refresh();
  }

  if (classes.length === 0) return <EmptyState title="Create a class first">Lab manuals belong to a class. Add one under Classes &amp; tasks.</EmptyState>;
  return (
    <div className="space-y-10">
      <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2" noValidate>
        <Field id="mc" label="Class"><NativeSelect id="mc" name="class" required value={classId} onChange={(e) => setClassId(e.target.value)}><option value="" disabled>Select class</option>{classes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
        <Field id="mb" label="Batch (optional)"><NativeSelect id="mb" name="batch" defaultValue=""><option value="">Whole class</option>{batches.filter((x) => x.class_id === classId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
        <Field id="mt" label="Title" className="sm:col-span-2"><Input id="mt" name="title" required maxLength={200} /></Field>
        <Field id="md" label="Short description (optional)" className="sm:col-span-2"><Input id="md" name="description" maxLength={1000} /></Field>
        <Field id="mx" label="Instructions" className="sm:col-span-2"><Textarea id="mx" name="body" maxLength={20000} className="min-h-40" /></Field>
        <div className="space-y-2 sm:col-span-2"><p className="text-sm font-medium">Images</p><ImageUploader purpose="manual" value={images} onChange={setImages} max={10} label="Add images" /></div>
        {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div><Button type="submit" disabled={busy}>{busy ? "Publishing..." : "Publish manual"}</Button></div>
      </form>

      {manuals.length === 0 ? <EmptyState title="No lab manuals yet">Published manuals are shown to students enrolled in the chosen class or batch.</EmptyState> : (
        <ul className="space-y-3">
          {manuals.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0">
                <p className="font-semibold">{m.title}</p>
                <p className="text-xs text-muted-foreground">{classes.find((c) => c.id === m.class_id)?.name}{m.batch_id ? ` · ${batches.find((b) => b.id === m.batch_id)?.name}` : " · whole class"} · {m.images.length} image(s)</p>
              </div>
              <Button size="sm" variant="destructive" aria-label={`Delete ${m.title}`} onClick={async () => {
                if (!confirm(`Delete "${m.title}"?`)) return;
                const res = await deleteRowAction("lab_manuals", m.id);
                if (!res.ok) toast.error(res.error); else { toast.success("Manual deleted"); router.refresh(); }
              }}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
