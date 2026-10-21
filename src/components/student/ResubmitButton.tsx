"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProjectForm, type ProjectDraft } from "./ProjectForm";
import type { MyWindow } from "./SubmissionWindow";

export function ResubmitButton({ draft, tasks, windows }: { draft: ProjectDraft; tasks: { id: string; title: string }[]; windows?: MyWindow[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Fix and resubmit</Button>;
  return (
    <div className="mt-3 w-full rounded-xl border border-border bg-background p-4">
      <ProjectForm draft={draft} tasks={tasks} windows={windows} onDone={() => setOpen(false)} />
    </div>
  );
}
