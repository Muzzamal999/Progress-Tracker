import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeadlineExtension, DeadlineRule, DefaultPolicy } from "../deadlines";
import { DEFAULT_ORG, type BadgeProgress, type OrgSettings } from "../workflow-types";
import { pktDayRange } from "../time";
import type { ProgressInfo, RepRow, ReportInput, RosterStudent, Scope, Status, SubRow, TaskInfo } from "./model";

const PAGE = 1000; // Supabase returns at most 1000 rows per request

/** Reads every row of a query by paging through it. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

interface StudentQueryRow {
  id: string;
  legacy_id: string | null;
  name: string;
  user_id: string | null;
  profile_completed_at: string | null;
  badge: string | null;
  batch_id: string | null;
  batches: { name: string; starts_on: string | null; ends_on: string | null; is_active: boolean; class_id: string; classes: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] | null } | null;
  student_private: { email: string | null } | { email: string | null }[] | null;
}
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

function toRoster(r: StudentQueryRow): RosterStudent {
  const b = r.batches;
  const c = one(b?.classes);
  return {
    id: r.id,
    code: r.legacy_id ?? r.id.slice(0, 8).toUpperCase(),
    name: r.name,
    email: one(r.student_private)?.email ?? null,
    user_id: r.user_id,
    profile_completed_at: r.profile_completed_at,
    badge: r.badge,
    class_id: b?.class_id ?? null,
    class_name: c?.name ?? null,
    batch_id: r.batch_id,
    batch_name: b?.name ?? null,
    batch_starts_on: b?.starts_on ?? null,
    batch_ends_on: b?.ends_on ?? null,
    enrolled_active: !!b && b.is_active && !!c?.is_active,
  };
}

const STUDENT_SELECT =
  "id, legacy_id, name, user_id, profile_completed_at, badge, batch_id, batches(name, starts_on, ends_on, is_active, class_id, classes(name, is_active)), student_private(email)";

export async function loadOrg(supabase: SupabaseClient): Promise<OrgSettings & { submission_default_policy: DefaultPolicy; reporting_days: number[] }> {
  const { data } = await supabase.from("organization_settings").select("*").maybeSingle();
  return {
    ...DEFAULT_ORG,
    ...(data ?? {}),
    submission_default_policy: (data?.submission_default_policy as DefaultPolicy) ?? "open",
    reporting_days: ((data?.reporting_days as number[] | undefined) ?? [1, 2, 3, 4, 5]).map(Number),
  };
}

interface LoadOptions {
  from: string; // Karachi dates, inclusive
  to: string;
  /** admin: all students + admin_progress_summary + deadline rules. student: only their own data. */
  mode: "admin" | "student";
  studentId?: string; // required for mode "student"
}

/** Everything a report needs, read through the CALLER'S session, so RLS decides what they may see. */
export async function loadReportInput(supabase: SupabaseClient, o: LoadOptions): Promise<{ input: ReportInput; org: OrgSettings }> {
  const end = pktDayRange(o.to).end;
  const org = await loadOrg(supabase);
  const students = await fetchAll<StudentQueryRow>((a, b) => {
    let q = supabase.from("students").select(STUDENT_SELECT).order("name").range(a, b);
    if (o.mode === "student") q = q.eq("id", o.studentId as string);
    return q as unknown as PromiseLike<{ data: StudentQueryRow[] | null; error: { message: string } | null }>;
  });
  const roster = students.map(toRoster);

  const [subs, reps, tasks] = await Promise.all([
    fetchAll<Omit<SubRow, "has_lab_report"> & { lab_report: unknown }>((a, b) => {
      let q = supabase.from("submissions").select("id, student_id, task_id, title, description, type, status, submitted_at, reviewed_at, feedback, lab_report").lt("submitted_at", end).order("submitted_at").range(a, b);
      if (o.mode === "student") q = q.eq("student_id", o.studentId as string);
      return q as unknown as PromiseLike<{ data: (Omit<SubRow, "has_lab_report"> & { lab_report: unknown })[] | null; error: { message: string } | null }>;
    }),
    fetchAll<RepQueryRow>((a, b) => {
      let q = supabase.from("daily_reports").select("id, student_id, report_date, summary, hours_spent, status, submitted_at, daily_report_items(submission_id, task_id)").gte("report_date", o.from).lte("report_date", o.to).order("report_date").range(a, b);
      if (o.mode === "student") q = q.eq("student_id", o.studentId as string);
      return q as unknown as PromiseLike<{ data: RepQueryRow[] | null; error: { message: string } | null }>;
    }),
    fetchAll<TaskInfo>((a, b) => supabase.from("tasks").select("id, class_id, batch_id, title, is_active").range(a, b) as unknown as PromiseLike<{ data: TaskInfo[] | null; error: { message: string } | null }>),
  ]);

  const submissions: SubRow[] = subs.map(({ lab_report, ...s }) => ({ ...s, has_lab_report: !!lab_report }));
  const reports: RepRow[] = reps.map((r) => ({
    id: r.id,
    student_id: r.student_id,
    report_date: r.report_date,
    summary: r.summary,
    hours_spent: r.hours_spent == null ? null : Number(r.hours_spent),
    status: r.status,
    submitted_at: r.submitted_at,
    linked_submission_ids: (r.daily_report_items ?? []).flatMap((i) => (i.submission_id ? [i.submission_id] : [])),
    linked_task_ids: (r.daily_report_items ?? []).flatMap((i) => (i.task_id ? [i.task_id] : [])),
  }));

  const progress = new Map<string, ProgressInfo>();
  let rules: DeadlineRule[] = [];
  let extensions: DeadlineExtension[] = [];
  if (o.mode === "admin") {
    const { data, error } = await supabase.rpc("admin_progress_summary");
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as (ProgressInfo & { student_id: string })[]) progress.set(p.student_id, p);
    const [r, e] = await Promise.all([supabase.from("submission_deadlines").select("*"), supabase.from("deadline_extensions").select("*")]);
    if (r.error) throw new Error(r.error.message);
    rules = (r.data ?? []) as DeadlineRule[];
    extensions = (e.data ?? []) as DeadlineExtension[];
  } else {
    const { data } = await supabase.rpc("my_progress");
    progress.set(o.studentId as string, ownProgress((data ?? []) as BadgeProgress[], submissions.filter((s) => s.student_id === o.studentId)));
  }

  return {
    org,
    input: {
      students: roster,
      submissions,
      reports,
      tasks,
      progress,
      rules,
      extensions,
      defaultPolicy: org.submission_default_policy,
      reportingDays: org.reporting_days,
      now: new Date(),
    },
  };
}

interface RepQueryRow {
  id: string;
  student_id: string;
  report_date: string;
  summary: string;
  hours_spent: number | string | null;
  status: Status;
  submitted_at: string;
  daily_report_items: { submission_id: string | null; task_id: string | null }[] | null;
}

function ownProgress(badges: BadgeProgress[], subs: { status: Status }[]): ProgressInfo {
  const done = badges.filter((b) => b.state === "completed");
  const active = badges.find((b) => b.state === "active");
  const required = badges.reduce((n, b) => n + b.required, 0);
  const counted = badges.reduce((n, b) => n + b.counted, 0);
  return {
    approved: subs.filter((s) => s.status === "approved").length,
    pending: subs.filter((s) => s.status === "pending").length,
    rejected: subs.filter((s) => s.status === "rejected").length,
    current_badge: done.at(-1)?.name ?? null,
    next_badge: active?.name ?? null,
    next_counted: active?.counted ?? 0,
    next_required: active?.required ?? 0,
    overall_percent: required > 0 ? Math.round((100 * counted) / required) : 0,
  };
}

export function scopeLabel(scope: Scope, roster: RosterStudent[]): string {
  switch (scope.kind) {
    case "all":
      return "All active students";
    case "class":
      return `Class: ${roster.find((s) => s.class_id === scope.id)?.class_name ?? "selected class"}`;
    case "batch": {
      const s = roster.find((x) => x.batch_id === scope.id);
      return `Batch: ${[s?.class_name, s?.batch_name].filter(Boolean).join(" / ") || "selected batch"}`;
    }
    case "student":
      return `Student: ${roster.find((s) => s.id === scope.id)?.name ?? "selected student"}`;
  }
}
