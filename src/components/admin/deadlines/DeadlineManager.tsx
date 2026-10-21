"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, History, Pencil, Plus, Power, RotateCcw, Search, Timer, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, EmptyState } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useServerNow } from "@/components/student/SubmissionWindow";
import {
  deleteDeadlineAction, grantExtensionAction, reopenDeadlineAction, revokeExtensionAction, saveDeadlineAction, savePolicyAction, setDeadlineActiveAction,
} from "@/app/actions/admin-deadlines";
import {
  DEADLINE_KINDS, KIND_HELP, KIND_LABEL, SCOPE_LABEL, SCOPE_TYPES, STATUS_STYLE, ruleScopeLabel, ruleStatus,
  type DeadlineKind, type DeadlineRule, type DefaultPolicy, type RuleStatus, type ScopeType,
} from "@/lib/deadlines";
import { addDays, formatPkt, pktDate, toPktInputs } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface Option { id: string; label: string }
export interface ExtensionRow { id: string; deadline_id: string; student_id: string; student_name: string; extended_until: string; reason: string | null }
export interface AuditRow { id: number; actor_email: string | null; action: string; entity: string; summary: string | null; details: { reason?: string }; created_at: string }

interface Props {
  rules: DeadlineRule[];
  extensions: ExtensionRow[];
  options: { classes: Option[]; batches: Option[]; tasks: Option[]; students: Option[] };
  audit: AuditRow[];
  policy: { defaultPolicy: DefaultPolicy; reportingDays: number[] };
  serverNow: string;
  initialKind: DeadlineKind | "all";
  initialStatus: RuleStatus | "all";
}

type Editor = { mode: "create" } | { mode: "edit"; rule: DeadlineRule } | { mode: "reopen"; rule: DeadlineRule } | { mode: "extend"; rule: DeadlineRule };
type Confirm = { type: "delete" | "deactivate"; rule: DeadlineRule } | null;

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;
const ACTION_LABEL: Record<string, string> = {
  "deadline.created": "Deadline created", "deadline.updated": "Deadline changed", "deadline.deleted": "Deadline deleted", "deadline.reopened": "Reopened",
  "deadline_extension.created": "Extension granted", "deadline.extension_granted": "Extension granted", "deadline_extension.updated": "Extension changed",
  "deadline.extension_revoked": "Extension revoked", "deadline_extension.deleted": "Extension removed", "policy.updated": "Policy changed",
};

function StatusBadge({ status }: { status: RuleStatus }) {
  const label = status === "disabled" ? "Disabled" : status[0].toUpperCase() + status.slice(1);
  return <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>{label}</span>;
}

export function DeadlineManager({ rules, extensions, options, audit, policy, serverNow, initialKind, initialStatus }: Props) {
  const router = useRouter();
  const now = useServerNow(serverNow, 15_000);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<DeadlineKind | "all">(initialKind);
  const [status, setStatus] = useState<RuleStatus | "all">(initialStatus);
  const [busy, setBusy] = useState(false);

  const names = useMemo(
    () => ({
      classes: new Map(options.classes.map((o) => [o.id, o.label])),
      batches: new Map(options.batches.map((o) => [o.id, o.label])),
      students: new Map(options.students.map((o) => [o.id, o.label])),
    }),
    [options],
  );
  const taskName = useMemo(() => new Map(options.tasks.map((o) => [o.id, o.label])), [options.tasks]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rules
      .map((r) => ({ r, status: ruleStatus(r, now), scope: ruleScopeLabel(r, names) }))
      .filter((x) => (kind === "all" || x.r.kind === kind) && (status === "all" || x.status === status))
      .filter((x) => !term || `${x.r.title} ${x.scope} ${KIND_LABEL[x.r.kind]} ${x.r.note ?? ""}`.toLowerCase().includes(term));
  }, [rules, now, names, q, kind, status]);

  const config = DEADLINE_KINDS.map((k) => {
    const ks = rules.filter((r) => r.kind === k && r.is_active);
    return { kind: k, active: ks.length, open: ks.filter((r) => ruleStatus(r, now) === "open").length };
  });

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Submission deadlines</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Control when students can submit projects, tasks, daily reports and lab reports. The database enforces every window, so students cannot bypass it. All times are Asia/Karachi (PKT).
          </p>
        </div>
        <Button onClick={() => setEditor({ mode: "create" })}><Plus /> New deadline</Button>
      </header>

      <PolicyCard policy={policy} config={config} busy={busy} onSave={(p) => run(() => savePolicyAction(p), "Policy saved")} />

      {editor && (
        <EditorPanel
          key={editor.mode + ("rule" in editor ? editor.rule.id : "new")}
          editor={editor}
          now={now}
          options={options}
          extensions={extensions}
          busy={busy}
          onClose={() => setEditor(null)}
          onRun={run}
          onRevoke={(id) => run(() => revokeExtensionAction(id), "Extension revoked")}
        />
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_12rem_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search deadlines" placeholder="Search by title, audience or note..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <NativeSelect aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value as DeadlineKind | "all")}>
            <option value="all">All types</option>
            {DEADLINE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as RuleStatus | "all")}>
            <option value="all">All statuses</option>
            {(["scheduled", "open", "closed", "disabled"] as const).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </NativeSelect>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={rules.length === 0 ? "No deadlines configured yet" : "No deadlines match your filters"}>
          {rules.length === 0 ? `Until you add one, the default policy applies: submissions are ${policy.defaultPolicy === "open" ? "open at all times" : "closed"}.` : undefined}
        </EmptyState>
      ) : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">Submission deadlines</caption>
            <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-medium">Type</th>
                <th scope="col" className="p-3 font-medium">Audience</th>
                <th scope="col" className="p-3 font-medium">Opens</th>
                <th scope="col" className="p-3 font-medium">Closes</th>
                <th scope="col" className="p-3 font-medium">Status</th>
                <th scope="col" className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, status: st, scope }) => {
                const exts = extensions.filter((e) => e.deadline_id === r.id);
                return (
                  <tr key={r.id} className="border-b border-border/40 align-top last:border-0">
                    <td className="p-3">
                      <p className="font-medium">{KIND_LABEL[r.kind]}</p>
                      {r.title && <p className="text-xs text-muted-foreground">{r.title}</p>}
                      {r.task_id && <p className="text-xs text-muted-foreground">Task: {taskName.get(r.task_id) ?? "unknown"}</p>}
                    </td>
                    <td className="p-3">{scope}{exts.length > 0 && <p className="text-xs text-muted-foreground">{exts.length} extension{exts.length === 1 ? "" : "s"}</p>}</td>
                    <td className="whitespace-nowrap p-3">{formatPkt(r.opens_at)}</td>
                    <td className="whitespace-nowrap p-3">{formatPkt(r.closes_at)}</td>
                    <td className="p-3"><StatusBadge status={st} /></td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "edit", rule: r })}><Pencil /> Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "reopen", rule: r })}><RotateCcw /> Reopen</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "extend", rule: r })}><UserPlus /> Extend</Button>
                        {r.is_active ? (
                          <Button size="sm" variant="outline" onClick={() => setConfirm({ type: "deactivate", rule: r })}><Power /> Deactivate</Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setDeadlineActiveAction(r.id, true), "Deadline activated")}><Power /> Activate</Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => setConfirm({ type: "delete", rule: r })}><Trash2 /> Delete</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <section aria-labelledby="audit-h" className="space-y-3">
        <h2 id="audit-h" className="flex items-center gap-2 text-xl font-bold"><History className="h-5 w-5" aria-hidden="true" /> Change history</h2>
        {audit.length === 0 ? (
          <EmptyState title="No changes recorded yet">Every create, edit, deactivation, reopening and extension is logged here with who did it and why.</EmptyState>
        ) : (
          <Card className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Deadline change history</caption>
              <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th scope="col" className="p-3 font-medium">When</th><th scope="col" className="p-3 font-medium">Who</th><th scope="col" className="p-3 font-medium">What</th><th scope="col" className="p-3 font-medium">Details</th></tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-border/40 align-top last:border-0">
                    <td className="whitespace-nowrap p-3">{formatPkt(a.created_at)}</td>
                    <td className="p-3">{a.actor_email ?? "system"}</td>
                    <td className="p-3 font-medium">{ACTION_LABEL[a.action] ?? a.action}</td>
                    <td className="p-3 text-muted-foreground">{a.summary}{a.details?.reason ? <span className="block text-foreground">Reason: {a.details.reason}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.type === "delete" ? "Delete this deadline?" : "Deactivate this deadline?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === "delete"
                ? "The rule and its extensions are removed permanently (the change stays in the history). Students covered only by this rule fall back to the default policy."
                : `The rule stops being enforced. Students covered by it fall back to the default policy (${policy.defaultPolicy === "open" ? "submissions open" : "submissions closed"}) unless another deadline applies.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={confirm?.type === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={async (e) => {
                e.preventDefault();
                if (!confirm) return;
                const ok = await run(() => (confirm.type === "delete" ? deleteDeadlineAction(confirm.rule.id) : setDeadlineActiveAction(confirm.rule.id, false)), confirm.type === "delete" ? "Deadline deleted" : "Deadline deactivated");
                if (ok) setConfirm(null);
              }}
            >
              {busy ? "Working..." : confirm?.type === "delete" ? "Delete" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------------------------------------------ policy + configuration status
function PolicyCard({ policy, config, busy, onSave }: { policy: Props["policy"]; config: { kind: DeadlineKind; active: number; open: number }[]; busy: boolean; onSave: (p: { defaultPolicy: DefaultPolicy; reportingDays: number[] }) => void }) {
  const [def, setDef] = useState<DefaultPolicy>(policy.defaultPolicy);
  const [days, setDays] = useState<number[]>(policy.reportingDays);
  const dirty = def !== policy.defaultPolicy || [...days].sort().join() !== [...policy.reportingDays].sort().join();
  return (
    <Card>
      <CardContent className="grid gap-6 p-5 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Timer className="h-5 w-5" aria-hidden="true" /> Configuration status</h2>
          <p className="mt-1 text-sm text-muted-foreground">Where no active deadline applies to a student, the default policy decides: <strong className="text-foreground">{def === "open" ? "submissions are open" : "submissions are closed"}</strong>.</p>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-sm">
            {config.map((c) => (
              <li key={c.kind} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium">{KIND_LABEL[c.kind]}</span>
                {c.active === 0 ? (
                  <span className="text-muted-foreground">Not configured: default policy ({policy.defaultPolicy}) applies</span>
                ) : (
                  <span>{c.active} active rule{c.active === 1 ? "" : "s"}, {c.open} open now</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ defaultPolicy: def, reportingDays: days });
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Default policy when no deadline is configured</legend>
            {(["open", "closed"] as const).map((v) => (
              <label key={v} className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="radio" name="policy" className="mt-1 accent-[var(--primary)]" checked={def === v} onChange={() => setDef(v)} />
                <span><strong>{v === "open" ? "Open" : "Closed"}</strong> - {v === "open" ? "students can submit until you set a deadline (current behaviour)." : "students cannot submit anything until you open a window."}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Days a daily report is expected</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(([n, label]) => (
                <label key={n} className={cn("cursor-pointer rounded-md border px-3 py-1.5 text-sm", days.includes(n) ? "border-primary bg-primary/10 font-medium" : "border-border")}>
                  <input type="checkbox" className="sr-only" checked={days.includes(n)} onChange={() => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]))} />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Used to work out who has not submitted a report. Students may still submit on other days.</p>
          </fieldset>
          <Button type="submit" disabled={busy || !dirty || days.length === 0}>Save policy</Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ editor (create / edit / reopen / extend)
function EditorPanel({ editor, now, options, extensions, busy, onClose, onRun, onRevoke }: {
  editor: Editor;
  now: number;
  options: Props["options"];
  extensions: ExtensionRow[];
  busy: boolean;
  onClose: () => void;
  onRun: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) => Promise<boolean>;
  onRevoke: (id: string) => void;
}) {
  const rule = "rule" in editor ? editor.rule : null;
  const todayPkt = pktDate(now);
  const o = rule ? toPktInputs(rule.opens_at) : { date: todayPkt, time: "00:00" };
  const c = rule ? toPktInputs(rule.closes_at) : { date: addDays(todayPkt, 1), time: "23:59" };

  const [kind, setKind] = useState<DeadlineKind>(rule?.kind ?? "project");
  const [title, setTitle] = useState(rule?.title ?? "");
  const [scope, setScope] = useState<ScopeType>(rule?.scope_type ?? "all");
  const [classId, setClassId] = useState(rule?.class_id ?? "");
  const [batchId, setBatchId] = useState(rule?.batch_id ?? "");
  const [studentId, setStudentId] = useState(rule?.student_id ?? "");
  const [taskId, setTaskId] = useState(rule?.task_id ?? "");
  const [opensDate, setOpensDate] = useState(o.date);
  const [opensTime, setOpensTime] = useState(o.time);
  const [closesDate, setClosesDate] = useState(c.date);
  const [closesTime, setClosesTime] = useState(c.time);
  const [active, setActive] = useState(rule?.is_active ?? true);
  const [note, setNote] = useState(rule?.note ?? "");
  const [reason, setReason] = useState("");
  const [extStudent, setExtStudent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const heading = { create: "New deadline", edit: "Edit deadline", reopen: "Reopen submissions", extend: "Extend for individual students" }[editor.mode];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let call: () => Promise<{ ok: true } | { ok: false; error: string }>;
    let msg: string;
    if (editor.mode === "reopen") {
      if (reason.trim().length < 3) return setError("Give a short reason: it is recorded in the history");
      call = () => reopenDeadlineAction({ id: editor.rule.id, closesDate, closesTime, reason });
      msg = "Submissions reopened";
    } else if (editor.mode === "extend") {
      if (!extStudent) return setError("Choose a student");
      call = () => grantExtensionAction({ deadlineId: editor.rule.id, studentId: extStudent, untilDate: closesDate, untilTime: closesTime, reason });
      msg = "Extension granted";
    } else {
      call = () => saveDeadlineAction({
        id: rule?.id, kind, title, scopeType: scope, classId: scope === "class" ? classId : null, batchId: scope === "batch" ? batchId : null,
        studentId: scope === "student" ? studentId : null, taskId: kind === "task" && taskId ? taskId : null,
        opensDate, opensTime, closesDate, closesTime, isActive: active, note,
      });
      msg = rule ? "Deadline updated" : "Deadline created";
    }
    const ok = await onRun(async () => {
      const res = await call();
      if (!res.ok) setError(res.error);
      return res;
    }, msg);
    if (ok) onClose();
  }

  const restricted = editor.mode === "reopen" || editor.mode === "extend";
  const dateTime = (label: string, d: string, setD: (v: string) => void, t: string, setT: (v: string) => void, idp: string, min?: string) => (
    <div className="grid grid-cols-2 gap-3">
      <Field id={`${idp}-d`} label={`${label} date`}><Input id={`${idp}-d`} type="date" value={d} min={min} onChange={(e) => setD(e.target.value)} required /></Field>
      <Field id={`${idp}-t`} label={`${label} time`}><Input id={`${idp}-t`} type="time" value={t} onChange={(e) => setT(e.target.value)} required /></Field>
    </div>
  );

  return (
    <Card className="border-primary/40">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarClock className="h-5 w-5" aria-hidden="true" /> {heading}</h2>
            {rule && <p className="text-sm text-muted-foreground">{KIND_LABEL[rule.kind]} · currently {formatPkt(rule.opens_at)} → {formatPkt(rule.closes_at)}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close editor"><X /></Button>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {!restricted && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="kind" label="Submission type" hint={KIND_HELP[kind]}>
                  <NativeSelect id="kind" value={kind} onChange={(e) => setKind(e.target.value as DeadlineKind)}>
                    {DEADLINE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </NativeSelect>
                </Field>
                <Field id="title" label="Label (optional)"><Input id="title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 3 projects" /></Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="scope" label="Audience">
                  <NativeSelect id="scope" value={scope} onChange={(e) => setScope(e.target.value as ScopeType)}>
                    {SCOPE_TYPES.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                  </NativeSelect>
                </Field>
                {scope === "class" && <Field id="class" label="Class"><NativeSelect id="class" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choose a class</option>{options.classes.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</NativeSelect></Field>}
                {scope === "batch" && <Field id="batch" label="Batch"><NativeSelect id="batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}><option value="">Choose a batch</option>{options.batches.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</NativeSelect></Field>}
                {scope === "student" && <Field id="student" label="Student"><NativeSelect id="student" value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose a student</option>{options.students.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</NativeSelect></Field>}
              </div>
              {kind === "task" && (
                <Field id="task" label="Task (optional)" hint="Leave on “All tasks” for a general task deadline, or pick one task to give it its own deadline.">
                  <NativeSelect id="task" value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">All tasks</option>{options.tasks.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</NativeSelect>
                </Field>
              )}
            </>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {!restricted && dateTime("Start", opensDate, setOpensDate, opensTime, setOpensTime, "open")}
            {dateTime(editor.mode === "extend" ? "Extend until" : restricted ? "New closing" : "Closing", closesDate, setClosesDate, closesTime, setClosesTime, "close", restricted ? todayPkt : undefined)}
          </div>
          <p className="text-xs text-muted-foreground">Times are entered in Asia/Karachi (PKT). Students can submit from the start time until just before the closing time.</p>
          {restricted && (
            <Field id="reason" label={editor.mode === "reopen" ? "Reason (recorded in the history)" : "Reason (optional)"}>
              <Textarea id="reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} className="min-h-16" />
            </Field>
          )}
          {editor.mode === "reopen" && <p className="rounded-lg bg-secondary p-3 text-sm">Reopening activates the deadline, starts it now if it had not started, and moves the closing time. It applies to everyone covered by it.</p>}
          {editor.mode === "extend" && (
            <>
              <Field id="ext-student" label="Student"><NativeSelect id="ext-student" value={extStudent} onChange={(e) => setExtStudent(e.target.value)}><option value="">Choose a student</option>{options.students.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</NativeSelect></Field>
              {rule && extensions.filter((x) => x.deadline_id === rule.id).length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">Existing extensions</p>
                  <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                    {extensions.filter((x) => x.deadline_id === rule.id).map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span>{x.student_name} until {formatPkt(x.extended_until)}{x.reason ? ` · ${x.reason}` : ""}</span>
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onRevoke(x.id)}>Revoke</Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {!restricted && (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active (a deactivated deadline is shown as Disabled and is not enforced)
              </label>
              <Field id="note" label="Internal note (optional)"><Input id="note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
            </>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : editor.mode === "reopen" ? "Reopen submissions" : editor.mode === "extend" ? "Grant extension" : rule ? "Save changes" : "Create deadline"}</Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
