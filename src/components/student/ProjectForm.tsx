"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedAsset } from "@/components/ImageUploader";
import { PdfUploader, type UploadedPdf } from "@/components/PdfUploader";
import { submitProjectAction } from "@/app/actions/student";
import { splitCommaList } from "@/lib/student-utils";
import { WindowBanner, liveState, lockedReason, pickWindow, useServerNow, type MyWindow } from "@/components/student/SubmissionWindow";
import { PROJECT_TYPES, type ProjectType } from "@/lib/types";

export interface ProjectDraft {
  id?: string;
  title: string;
  description: string;
  type: ProjectType;
  stack: string[];
  link: string;
  taskId: string | null;
}

export function ProjectForm({ tasks, draft, onDone, windows = [] }: { tasks: { id: string; title: string }[]; draft?: ProjectDraft; onDone?: () => void; windows?: MyWindow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedAsset[]>([]);
  const [labReport, setLabReport] = useState<UploadedPdf | null>(null);
  const [taskId, setTaskId] = useState<string>(draft?.taskId ?? "");

  // A project is governed by the task window (when a task is chosen) or the project window, AND by the lab-report window.
  const main = pickWindow(windows, taskId ? "task" : "project", taskId || null);
  const lab = pickWindow(windows, "lab_report");
  const now = useServerNow((main ?? lab)?.server_now);
  const mainState = liveState(main, now);
  const labState = liveState(lab, now);
  const lockedMsg = lockedReason(main, mainState) ?? lockedReason(lab, labState);
  const locked = lockedMsg !== null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return setError(lockedMsg);
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    const res = await submitProjectAction({
      id: draft?.id,
      title: f.get("title"),
      description: f.get("description"),
      type: f.get("type"),
      stack: splitCommaList(String(f.get("stack") ?? "")),
      link: String(f.get("link") ?? ""),
      taskId: f.get("task") ? String(f.get("task")) : null,
      attachments: files,
      labReport,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(draft?.id ? "Project resubmitted for review" : "Project submitted for review");
    setFiles([]);
    setLabReport(null);
    form.reset();
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate aria-busy={busy}>
      {windows.length > 0 && <WindowBanner w={mainState === "open" && labState !== "open" ? lab : main} label={mainState === "open" && labState !== "open" ? "Lab report window" : taskId ? "Task deadline" : "Project deadline"} />}
      <fieldset disabled={locked || busy} className="min-w-0 space-y-4 border-0 p-0">
      <Field id="title" label="Project title"><Input id="title" name="title" defaultValue={draft?.title} maxLength={120} required /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="type" label="Type">
          <NativeSelect id="type" name="type" defaultValue={draft?.type ?? "mini"}>
            {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </NativeSelect>
        </Field>
        <Field id="task" label="Related task (optional)">
          <NativeSelect id="task" name="task" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!!draft?.id}>
            <option value="">None</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="link" label="Link (repository or live demo)" hint="Optional. Each link can only be used once."><Input id="link" name="link" type="url" defaultValue={draft?.link} placeholder="https://" /></Field>
      <Field id="stack" label="Tech stack" hint="Comma separated"><Input id="stack" name="stack" defaultValue={draft?.stack.join(", ")} /></Field>
      <Field id="description" label="What did you build?"><Textarea id="description" name="description" defaultValue={draft?.description} maxLength={4000} /></Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Evidence (required)</p>
        <ImageUploader purpose="evidence" value={files} onChange={setFiles} label="Add screenshots" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Lab report (required)</p>
        <PdfUploader purpose="labreport" value={labReport} onChange={setLabReport} label="Attach lab report (PDF)" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || locked}>{locked ? "Submissions locked" : busy ? "Submitting..." : draft?.id ? "Resubmit for review" : "Submit for review"}</Button>
      </fieldset>
    </form>
  );
}
