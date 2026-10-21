"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedAsset } from "@/components/ImageUploader";
import { WindowBanner, liveState, lockedReason, pickWindow, useServerNow, type MyWindow } from "@/components/student/SubmissionWindow";
import { submitReportAction } from "@/app/actions/student";

interface Linkable {
  id: string;
  title: string;
}

function CheckList({ legend, items, selected, onToggle, empty }: { legend: string; items: Linkable[]; selected: string[]; onToggle: (id: string) => void; empty: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
          {items.map((i) => (
            <li key={i.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-secondary">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={selected.includes(i.id)} onChange={() => onToggle(i.id)} />
                <span className="min-w-0 break-words">{i.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

export function ReportForm({ today, windows = [], projects = [], tasks = [] }: { today: string; windows?: MyWindow[]; projects?: Linkable[]; tasks?: Linkable[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedAsset[]>([]);
  const [subIds, setSubIds] = useState<string[]>([]);
  const [taskIds, setTaskIds] = useState<string[]>([]);

  const w = pickWindow(windows, "daily_report");
  const now = useServerNow(w?.server_now);
  const lockedMsg = lockedReason(w, liveState(w, now));
  const locked = lockedMsg !== null;
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) => set((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return setError(lockedMsg);
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
      submissionIds: subIds,
      taskIds,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Report submitted");
    setFiles([]);
    setSubIds([]);
    setTaskIds([]);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate aria-busy={busy}>
      {windows.length > 0 && <WindowBanner w={w} label="Daily report" />}
      <fieldset disabled={locked || busy} className="min-w-0 space-y-4 border-0 p-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="date" label="Date" hint="Karachi time (PKT)"><Input id="date" name="date" type="date" defaultValue={today} max={today} required /></Field>
          <Field id="hours" label="Hours worked (optional)"><Input id="hours" name="hours" type="number" min={0} max={24} step={0.5} /></Field>
        </div>
        <Field id="summary" label="What did you do today?"><Textarea id="summary" name="summary" maxLength={4000} required /></Field>
        <CheckList legend="Projects you worked on (optional)" items={projects} selected={subIds} onToggle={toggle(setSubIds)} empty="Submit a project first and it will be listed here." />
        <CheckList legend="Tasks you worked on (optional)" items={tasks} selected={taskIds} onToggle={toggle(setTaskIds)} empty="No tasks are assigned to your batch yet." />
        <Field id="blockers" label="Blockers (optional)"><Textarea id="blockers" name="blockers" maxLength={2000} className="min-h-16" /></Field>
        <ImageUploader purpose="evidence" value={files} onChange={setFiles} label="Attach screenshots (optional)" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || locked}>{locked ? "Submissions locked" : busy ? "Submitting..." : "Submit report"}</Button>
      </fieldset>
    </form>
  );
}
