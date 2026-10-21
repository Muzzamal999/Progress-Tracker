/**
 * Deadline model shared by the admin UI, the student UI and the PDF reports.
 * The database function public._deadline_window() is the ENFORCER; resolveWindow() below is its
 * read-only twin used to explain and report (and is covered by tests that pin the same rules).
 */
export const DEADLINE_KINDS = ["project", "task", "daily_report", "lab_report"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];
export const KIND_LABEL: Record<DeadlineKind, string> = {
  project: "Projects",
  task: "Tasks",
  daily_report: "Daily reports",
  lab_report: "Lab reports",
};
export const KIND_HELP: Record<DeadlineKind, string> = {
  project: "Stand-alone project submissions (not linked to a task).",
  task: "Submissions linked to a task. Pick one task for a task-specific deadline, or leave blank for all tasks.",
  daily_report: "The daily progress report.",
  lab_report: "The lab-report PDF that every project submission must include (also gates project submissions).",
};

export const SCOPE_TYPES = ["all", "class", "batch", "student"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];
export const SCOPE_LABEL: Record<ScopeType, string> = { all: "All students", class: "Class", batch: "Batch", student: "Individual student" };

export type WindowState = "scheduled" | "open" | "closed";
export type RuleStatus = WindowState | "disabled";
export type DefaultPolicy = "open" | "closed";

export interface DeadlineRule {
  id: string;
  kind: DeadlineKind;
  title: string;
  scope_type: ScopeType;
  class_id: string | null;
  batch_id: string | null;
  student_id: string | null;
  task_id: string | null;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}
export interface DeadlineExtension {
  id: string;
  deadline_id: string;
  student_id: string;
  extended_until: string;
  reason: string | null;
  created_at: string;
}
export interface StudentPlacement {
  id: string;
  batch_id: string | null;
  class_id: string | null;
}

/** Status of a rule as the admin sees it. Disabled = switched off, i.e. not enforced. */
export function ruleStatus(rule: Pick<DeadlineRule, "opens_at" | "closes_at" | "is_active">, at: Date | number = new Date()): RuleStatus {
  if (!rule.is_active) return "disabled";
  return windowState(rule.opens_at, rule.closes_at, at);
}

/** opens_at <= t < closes_at (the closing instant itself is already closed). */
export function windowState(opens: string | number | Date, closes: string | number | Date, at: Date | number = new Date()): WindowState {
  const t = +at;
  if (t < +new Date(opens)) return "scheduled";
  if (t < +new Date(closes)) return "open";
  return "closed";
}

export interface ResolvedWindow {
  deadlineId: string | null;
  opensAt: string | null;
  closesAt: string | null;
  state: WindowState;
  scopeType: ScopeType | null;
  extended: boolean;
  configured: boolean;
}

const SPECIFICITY: Record<ScopeType, number> = { student: 4, batch: 3, class: 2, all: 1 };

/** Mirrors public._deadline_window: which window governs this student for this kind (and task) at `at`. */
export function resolveWindow(
  rules: DeadlineRule[],
  extensions: DeadlineExtension[],
  student: StudentPlacement,
  kind: DeadlineKind,
  taskId: string | null,
  defaultPolicy: DefaultPolicy,
  at: Date | number = new Date(),
): ResolvedWindow {
  const t = +at;
  const cand = rules
    .filter((d) => d.is_active && d.kind === kind && (d.task_id === null || d.task_id === taskId))
    .filter(
      (d) =>
        d.scope_type === "all" ||
        (d.scope_type === "student" && d.student_id === student.id) ||
        (d.scope_type === "batch" && d.batch_id !== null && d.batch_id === student.batch_id) ||
        (d.scope_type === "class" && d.class_id !== null && d.class_id === student.class_id),
    )
    .map((d) => {
      const ext = extensions.find((e) => e.deadline_id === d.id && e.student_id === student.id);
      const effClose = Math.max(+new Date(d.closes_at), ext ? +new Date(ext.extended_until) : 0);
      const extended = !!ext && +new Date(ext.extended_until) > +new Date(d.closes_at);
      const st: WindowState = t < +new Date(d.opens_at) ? "scheduled" : t < effClose ? "open" : "closed";
      return { d, effClose, extended, st };
    });
  if (cand.length === 0) {
    return { deadlineId: null, opensAt: null, closesAt: null, state: defaultPolicy, scopeType: null, extended: false, configured: false };
  }
  const rank = (st: WindowState) => (st === "open" ? 0 : st === "scheduled" ? 1 : 2);
  cand.sort(
    (a, b) =>
      Number(b.d.task_id !== null) - Number(a.d.task_id !== null) ||
      SPECIFICITY[b.d.scope_type] - SPECIFICITY[a.d.scope_type] ||
      rank(a.st) - rank(b.st) ||
      (a.st === "scheduled" && b.st === "scheduled" ? +new Date(a.d.opens_at) - +new Date(b.d.opens_at) : 0) ||
      b.effClose - a.effClose,
  );
  const p = cand[0];
  return {
    deadlineId: p.d.id,
    opensAt: p.d.opens_at,
    closesAt: new Date(p.effClose).toISOString(),
    state: p.st,
    scopeType: p.d.scope_type,
    extended: p.extended,
    configured: true,
  };
}

export type Compliance = "on_time" | "late" | "missed" | "pending" | "no_deadline";
export const COMPLIANCE_LABEL: Record<Compliance, string> = {
  on_time: "On time",
  late: "Late",
  missed: "Missed",
  pending: "Window open",
  no_deadline: "No deadline",
};

/**
 * Deadline compliance for one expected submission.
 * submittedAt = null means nothing was submitted. `w` is the window that governs that student.
 */
export function compliance(w: ResolvedWindow, submittedAt: string | null, at: Date | number = new Date()): Compliance {
  if (!w.configured) return "no_deadline";
  const closes = +new Date(w.closesAt as string);
  const opens = +new Date(w.opensAt as string);
  if (submittedAt) {
    const s = +new Date(submittedAt);
    return s >= opens && s < closes ? "on_time" : "late";
  }
  return +at >= closes ? "missed" : "pending";
}

export function ruleScopeLabel(
  rule: Pick<DeadlineRule, "scope_type" | "class_id" | "batch_id" | "student_id">,
  names: { classes: Map<string, string>; batches: Map<string, string>; students: Map<string, string> },
): string {
  switch (rule.scope_type) {
    case "all":
      return "All students";
    case "class":
      return `Class: ${names.classes.get(rule.class_id ?? "") ?? "unknown"}`;
    case "batch":
      return `Batch: ${names.batches.get(rule.batch_id ?? "") ?? "unknown"}`;
    case "student":
      return `Student: ${names.students.get(rule.student_id ?? "") ?? "unknown"}`;
  }
}

export const STATUS_STYLE: Record<RuleStatus, string> = {
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  open: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  closed: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  disabled: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30",
};
