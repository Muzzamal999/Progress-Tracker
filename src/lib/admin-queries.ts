import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ruleStatus, type DeadlineRule } from "./deadlines";
import { isReportExpected, isActiveRoster } from "./reports/model";
import { loadOrg } from "./reports/load";
import { pktDate, pktDayRange } from "./time";
import type { RosterStudent } from "./reports/model";

export interface DashboardData {
  today: string;
  activeStudents: number;
  reportsToday: number;
  notSubmittedToday: number;
  expectedToday: number;
  projectsToday: number;
  awaitingReview: number;
  approvedToday: number;
  rejectedToday: number;
  openWindows: DeadlineRule[];
  upcoming: DeadlineRule[];
  recentlyExpired: DeadlineRule[];
}

const head = (sb: SupabaseClient, table: string) => sb.from(table).select("id", { count: "exact", head: true });

/** Roster rows with class/batch for the admin selectors and the dashboard (paged to get past the 1000-row API cap). */
export async function listRoster(sb: SupabaseClient): Promise<RosterStudent[]> {
  const out: RosterStudent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("students")
      .select("id, legacy_id, name, user_id, profile_completed_at, badge, batch_id, batches(name, starts_on, ends_on, is_active, class_id, classes(name, is_active))")
      .order("name")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as unknown as RosterRaw[]) {
      const b = r.batches;
      const c = Array.isArray(b?.classes) ? b?.classes[0] : b?.classes;
      out.push({
        id: r.id, code: r.legacy_id ?? r.id.slice(0, 8).toUpperCase(), name: r.name, email: null, user_id: r.user_id,
        profile_completed_at: r.profile_completed_at, badge: r.badge, class_id: b?.class_id ?? null, class_name: c?.name ?? null,
        batch_id: r.batch_id, batch_name: b?.name ?? null, batch_starts_on: b?.starts_on ?? null, batch_ends_on: b?.ends_on ?? null,
        enrolled_active: !!b && b.is_active && !!c?.is_active,
      });
    }
    if (!data || data.length < 1000) return out;
  }
}
interface RosterRaw {
  id: string; legacy_id: string | null; name: string; user_id: string | null; profile_completed_at: string | null; badge: string | null; batch_id: string | null;
  batches: { name: string; starts_on: string | null; ends_on: string | null; is_active: boolean; class_id: string; classes: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] | null } | null;
}

export async function getDashboardData(sb: SupabaseClient, now = new Date()): Promise<DashboardData> {
  const today = pktDate(now);
  const { start, end } = pktDayRange(today);
  const [roster, org, reps, projectsToday, awaiting, approved, rejected, rulesRes] = await Promise.all([
    listRoster(sb),
    loadOrg(sb),
    sb.from("daily_reports").select("student_id").eq("report_date", today),
    head(sb, "submissions").gte("submitted_at", start).lt("submitted_at", end),
    head(sb, "submissions").eq("status", "pending"),
    head(sb, "submissions").eq("status", "approved").gte("reviewed_at", start).lt("reviewed_at", end),
    head(sb, "submissions").eq("status", "rejected").gte("reviewed_at", start).lt("reviewed_at", end),
    sb.from("submission_deadlines").select("*").order("closes_at"),
  ]);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  const active = roster.filter(isActiveRoster);
  const reported = new Set((reps.data ?? []).map((r: { student_id: string }) => r.student_id));
  const expected = active.filter((s) => isReportExpected(s, today, org.reporting_days));
  const rules = (rulesRes.data ?? []) as DeadlineRule[];
  const week = 7 * 24 * 3600 * 1000;
  return {
    today,
    activeStudents: active.length,
    reportsToday: active.filter((s) => reported.has(s.id)).length,
    expectedToday: expected.length,
    notSubmittedToday: expected.filter((s) => !reported.has(s.id)).length,
    projectsToday: projectsToday.count ?? 0,
    awaitingReview: awaiting.count ?? 0,
    approvedToday: approved.count ?? 0,
    rejectedToday: rejected.count ?? 0,
    openWindows: rules.filter((r) => ruleStatus(r, now) === "open"),
    upcoming: rules.filter((r) => ruleStatus(r, now) === "scheduled").slice(0, 5),
    recentlyExpired: rules.filter((r) => ruleStatus(r, now) === "closed" && now.getTime() - new Date(r.closes_at).getTime() < week).slice(-5).reverse(),
  };
}

export interface FilterOptions {
  classes: { id: string; name: string }[];
  batches: { id: string; name: string; class_id: string; class_name: string }[];
  students: { id: string; name: string }[];
}

/** Class / batch / student choices for the admin filters and export forms. */
export async function getFilterOptions(sb: SupabaseClient): Promise<FilterOptions> {
  const [classes, batches, students] = await Promise.all([
    sb.from("classes").select("id, name").order("name"),
    sb.from("batches").select("id, name, class_id, classes(name)").order("name"),
    sb.from("students").select("id, name").not("user_id", "is", null).order("name").limit(1000),
  ]);
  const err = [classes, batches, students].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  return {
    classes: classes.data ?? [],
    batches: (batches.data ?? []).map((b) => {
      const c = Array.isArray(b.classes) ? b.classes[0] : b.classes;
      return { id: b.id, name: b.name, class_id: b.class_id, class_name: (c as { name: string } | null)?.name ?? "?" };
    }),
    students: students.data ?? [],
  };
}
