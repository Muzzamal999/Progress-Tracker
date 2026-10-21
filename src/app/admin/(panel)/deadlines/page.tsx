import { createClient } from "@/lib/supabase/server";
import { DeadlineManager, type AuditRow, type ExtensionRow, type Option } from "@/components/admin/deadlines/DeadlineManager";
import { loadOrg } from "@/lib/reports/load";
import type { DeadlineKind, DeadlineRule, RuleStatus } from "@/lib/deadlines";

export const metadata = { title: "Deadlines" };

const KINDS = ["project", "task", "daily_report", "lab_report"];
const STATUSES = ["scheduled", "open", "closed", "disabled"];

export default async function DeadlinesPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const [rules, exts, classes, batches, tasks, students, audit, org] = await Promise.all([
    sb.from("submission_deadlines").select("*").order("closes_at", { ascending: false }),
    sb.from("deadline_extensions").select("id, deadline_id, student_id, extended_until, reason, created_at, students(name)").order("created_at", { ascending: false }),
    sb.from("classes").select("id, name").order("name"),
    sb.from("batches").select("id, name, classes(name)").order("name"),
    sb.from("tasks").select("id, title, classes(name)").order("created_at", { ascending: false }),
    sb.from("students").select("id, name").not("user_id", "is", null).order("name"),
    sb.from("audit_log").select("id, actor_email, action, entity, summary, details, created_at").order("created_at", { ascending: false }).limit(60),
    loadOrg(sb),
  ]);
  const err = [rules, exts, classes, batches, tasks, students, audit].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);

  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const options = {
    classes: (classes.data ?? []).map((c): Option => ({ id: c.id, label: c.name })),
    batches: (batches.data ?? []).map((b): Option => ({ id: b.id, label: `${one(b.classes as { name: string } | { name: string }[] | null)?.name ?? "?"} / ${b.name}` })),
    tasks: (tasks.data ?? []).map((t): Option => ({ id: t.id, label: `${t.title} (${one(t.classes as { name: string } | { name: string }[] | null)?.name ?? "?"})` })),
    students: (students.data ?? []).map((s): Option => ({ id: s.id, label: s.name })),
  };
  const extensions = (exts.data ?? []).map((e): ExtensionRow => ({
    id: e.id, deadline_id: e.deadline_id, student_id: e.student_id, extended_until: e.extended_until, reason: e.reason,
    student_name: one(e.students as { name: string } | { name: string }[] | null)?.name ?? "Unknown",
  }));
  return (
    <DeadlineManager
      rules={(rules.data ?? []) as DeadlineRule[]}
      extensions={extensions}
      options={options}
      audit={(audit.data ?? []) as AuditRow[]}
      policy={{ defaultPolicy: org.submission_default_policy, reportingDays: org.reporting_days }}
      serverNow={new Date().toISOString()}
      initialKind={KINDS.includes(sp.kind ?? "") ? (sp.kind as DeadlineKind) : "all"}
      initialStatus={STATUSES.includes(sp.status ?? "") ? (sp.status as RuleStatus) : "all"}
    />
  );
}
