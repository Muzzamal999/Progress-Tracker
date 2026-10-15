"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, EmptyState } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import { deleteRowAction, saveBatchAction, saveClassAction, saveTaskAction } from "@/app/actions/admin-workflow";
import type { BatchRow, ClassRow, TaskRow } from "@/lib/workflow-types";
import type { ActionResult } from "@/app/actions/students";

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<ActionResult>, ok: string, after?: () => void) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(ok);
    after?.();
    router.refresh();
  }
  return { run, error, busy };
}

function Row({ title, sub, active, onToggle, onDelete, busy }: { title: string; sub?: string; active: boolean; onToggle: () => void; onDelete: () => void; busy: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onToggle} aria-pressed={active}>{active ? "Active" : "Inactive"}</Button>
        <Button size="sm" variant="destructive" disabled={busy} aria-label={`Delete ${title}`} onClick={() => confirm(`Delete "${title}"? This also removes everything inside it.`) && onDelete()}><Trash2 /></Button>
      </div>
    </li>
  );
}

export function AcademicsManager({ classes, batches, tasks }: { classes: ClassRow[]; batches: BatchRow[]; tasks: TaskRow[] }) {
  const c = useRun();
  const b = useRun();
  const t = useRun();
  const [taskClass, setTaskClass] = useState(classes[0]?.id ?? "");
  const className = (id: string) => classes.find((x) => x.id === id)?.name ?? "";
  const batchesOfTaskClass = batches.filter((x) => x.class_id === taskClass);

  return (
    <div className="space-y-12">
      <section aria-labelledby="c-h" className="space-y-4">
        <h2 id="c-h" className="text-xl font-bold">Classes</h2>
        <form
          className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            c.run(() => saveClassAction({ name: f.get("name"), description: f.get("description"), isActive: true }), "Class created", () => form.reset());
          }}
        >
          <Field id="cn" label="Class name"><Input id="cn" name="name" required maxLength={120} /></Field>
          <Field id="cd" label="Description (optional)"><Input id="cd" name="description" maxLength={1000} /></Field>
          <Button type="submit" disabled={c.busy}>Add class</Button>
        </form>
        {c.error && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
        {classes.length === 0 ? <EmptyState title="No classes yet">Create your first class, then add a batch so students can enrol.</EmptyState> : (
          <ul className="space-y-2">
            {classes.map((x) => (
              <Row key={x.id} title={x.name} sub={x.description ?? undefined} active={x.is_active} busy={c.busy}
                onToggle={() => c.run(() => saveClassAction({ id: x.id, name: x.name, description: x.description ?? "", isActive: !x.is_active }), "Class updated")}
                onDelete={() => c.run(() => deleteRowAction("classes", x.id), "Class deleted")} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="b-h" className="space-y-4">
        <h2 id="b-h" className="text-xl font-bold">Batches</h2>
        <p className="text-sm text-muted-foreground">Students enrol in an active batch of an active class. Enrolment is required before they can submit work.</p>
        <form
          className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_9rem_9rem_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            b.run(() => saveBatchAction({ classId: f.get("class"), name: f.get("name"), startsOn: f.get("start"), endsOn: f.get("end"), isActive: true }), "Batch created", () => form.reset());
          }}
        >
          <Field id="bc" label="Class"><NativeSelect id="bc" name="class" required defaultValue=""><option value="" disabled>Select class</option>{classes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
          <Field id="bn" label="Batch name"><Input id="bn" name="name" required maxLength={120} /></Field>
          <Field id="bs" label="Starts"><Input id="bs" name="start" type="date" /></Field>
          <Field id="be" label="Ends"><Input id="be" name="end" type="date" /></Field>
          <Button type="submit" disabled={b.busy || classes.length === 0}>Add batch</Button>
        </form>
        {b.error && <p role="alert" className="text-sm text-destructive">{b.error}</p>}
        <ul className="space-y-2">
          {batches.map((x) => (
            <Row key={x.id} title={x.name} sub={className(x.class_id)} active={x.is_active} busy={b.busy}
              onToggle={() => b.run(() => saveBatchAction({ id: x.id, classId: x.class_id, name: x.name, startsOn: x.starts_on ?? "", endsOn: x.ends_on ?? "", isActive: !x.is_active }), "Batch updated")}
              onDelete={() => b.run(() => deleteRowAction("batches", x.id), "Batch deleted")} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="t-h" className="space-y-4">
        <h2 id="t-h" className="text-xl font-bold">Tasks</h2>
        <form
          className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            t.run(() => saveTaskAction({ classId: f.get("class"), batchId: f.get("batch") ? String(f.get("batch")) : null, title: f.get("title"), description: f.get("description"), dueDate: f.get("due"), isActive: true }), "Task created", () => form.reset());
          }}
        >
          <Field id="tc" label="Class"><NativeSelect id="tc" name="class" required value={taskClass} onChange={(e) => setTaskClass(e.target.value)}><option value="" disabled>Select class</option>{classes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
          <Field id="tb" label="Batch (optional)"><NativeSelect id="tb" name="batch" defaultValue=""><option value="">Whole class</option>{batchesOfTaskClass.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
          <Field id="tt" label="Title"><Input id="tt" name="title" required maxLength={200} /></Field>
          <Field id="td" label="Due date (optional)"><Input id="td" name="due" type="date" /></Field>
          <Field id="tx" label="Description" className="sm:col-span-2"><Textarea id="tx" name="description" maxLength={4000} className="min-h-16" /></Field>
          <div><Button type="submit" disabled={t.busy || classes.length === 0}>Add task</Button></div>
        </form>
        {t.error && <p role="alert" className="text-sm text-destructive">{t.error}</p>}
        <ul className="space-y-2">
          {tasks.map((x) => (
            <Row key={x.id} title={x.title} sub={`${className(x.class_id)}${x.batch_id ? " · " + (batches.find((y) => y.id === x.batch_id)?.name ?? "") : " · whole class"}${x.due_date ? " · due " + x.due_date : ""}`} active={x.is_active} busy={t.busy}
              onToggle={() => t.run(() => saveTaskAction({ id: x.id, classId: x.class_id, batchId: x.batch_id, title: x.title, description: x.description ?? "", dueDate: x.due_date ?? "", isActive: !x.is_active }), "Task updated")}
              onDelete={() => t.run(() => deleteRowAction("tasks", x.id), "Task deleted")} />
          ))}
        </ul>
      </section>
    </div>
  );
}
