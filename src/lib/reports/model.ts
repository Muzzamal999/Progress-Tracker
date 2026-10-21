/**
 * Report model: turns raw database rows into the numbers and lists the PDFs print.
 * Pure (no I/O) so the counting rules can be unit tested exactly.
 *
 * Definitions (also printed in the PDF notes):
 *  - Active roster: a registered student (has a login) who completed the profile and is enrolled in an
 *    active batch of an active class. Imported legacy records without a login are never expected to report.
 *  - A daily report is EXPECTED on a date when: the date is one of the organisation's reporting weekdays,
 *    it is on/after the day the student completed their profile, and it falls inside the batch dates (if set).
 *  - MISSING = expected and no report row exists. An absent report is never counted as submitted.
 *  - Project figures use each project's CURRENT review status. "To date" cuts off at the end of the report day.
 *  - Task states: completed = has an approved submission; awaiting review = submitted, not yet approved;
 *    pending = not submitted (or only rejected submissions).
 */
import {
  compliance,
  resolveWindow,
  type Compliance,
  type DeadlineExtension,
  type DeadlineRule,
  type DefaultPolicy,
} from "../deadlines";
import { datesBetween, isoWeekday, pktDate, pktDayRange } from "../time";

export type Status = "pending" | "approved" | "rejected";

export interface RosterStudent {
  id: string;
  /** Human-friendly identifier printed on reports (legacy id such as stu-002, else the first 8 characters of the id). */
  code: string;
  name: string;
  email: string | null;
  user_id: string | null;
  profile_completed_at: string | null;
  badge: string | null;
  class_id: string | null;
  class_name: string | null;
  batch_id: string | null;
  batch_name: string | null;
  batch_starts_on: string | null;
  batch_ends_on: string | null;
  enrolled_active: boolean; // batch and class are both active
}
export interface SubRow {
  id: string;
  student_id: string;
  task_id: string | null;
  title: string;
  description: string | null;
  type: string;
  status: Status;
  submitted_at: string;
  reviewed_at: string | null;
  feedback: string | null;
  has_lab_report: boolean;
}
export interface RepRow {
  id: string;
  student_id: string;
  report_date: string;
  summary: string;
  hours_spent: number | null;
  status: Status;
  submitted_at: string;
  linked_submission_ids: string[];
  linked_task_ids: string[];
}
export interface TaskInfo {
  id: string;
  class_id: string;
  batch_id: string | null;
  title: string;
  is_active: boolean;
}
export interface ProgressInfo {
  approved: number;
  pending: number;
  rejected: number;
  current_badge: string | null;
  next_badge: string | null;
  next_counted: number;
  next_required: number;
  overall_percent: number;
}
export interface ReportInput {
  students: RosterStudent[];
  submissions: SubRow[];
  reports: RepRow[];
  tasks: TaskInfo[];
  progress: Map<string, ProgressInfo>;
  rules: DeadlineRule[];
  extensions: DeadlineExtension[];
  defaultPolicy: DefaultPolicy;
  reportingDays: number[];
  now: Date;
}
export type Scope =
  | { kind: "all" }
  | { kind: "class"; id: string }
  | { kind: "batch"; id: string }
  | { kind: "student"; id: string };

const NO_PROGRESS: ProgressInfo = { approved: 0, pending: 0, rejected: 0, current_badge: null, next_badge: null, next_counted: 0, next_required: 0, overall_percent: 0 };

export const isActiveRoster = (s: RosterStudent) => !!s.user_id && !!s.profile_completed_at && s.enrolled_active;

/** Students a report covers. Class/batch/all use the active roster; an individual student is always included. */
export function studentsInScope(students: RosterStudent[], scope: Scope): RosterStudent[] {
  switch (scope.kind) {
    case "student":
      return students.filter((s) => s.id === scope.id);
    case "class":
      return students.filter((s) => isActiveRoster(s) && s.class_id === scope.id);
    case "batch":
      return students.filter((s) => isActiveRoster(s) && s.batch_id === scope.id);
    default:
      return students.filter(isActiveRoster);
  }
}

/** Is a daily report expected from this student on this Karachi date? */
export function isReportExpected(s: RosterStudent, date: string, reportingDays: number[]): boolean {
  if (!s.user_id || !s.profile_completed_at) return false;
  if (!reportingDays.includes(isoWeekday(date))) return false;
  if (date < pktDate(s.profile_completed_at)) return false;
  if (s.batch_starts_on && date < s.batch_starts_on) return false;
  if (s.batch_ends_on && date > s.batch_ends_on) return false;
  return true;
}

export const tasksFor = (s: RosterStudent, tasks: TaskInfo[]) =>
  tasks.filter((t) => t.is_active && t.class_id === s.class_id && (t.batch_id === null || t.batch_id === s.batch_id));

export interface TaskBuckets {
  completed: TaskInfo[];
  awaiting: TaskInfo[];
  pending: TaskInfo[];
}
/** Task state as of the end of `asOfEnd` (ISO instant): only submissions made by then count. */
export function taskBuckets(s: RosterStudent, tasks: TaskInfo[], subs: SubRow[], asOfEnd: string): TaskBuckets {
  const out: TaskBuckets = { completed: [], awaiting: [], pending: [] };
  for (const t of tasksFor(s, tasks)) {
    const mine = subs.filter((x) => x.student_id === s.id && x.task_id === t.id && x.submitted_at < asOfEnd);
    if (mine.some((x) => x.status === "approved" && (x.reviewed_at ?? x.submitted_at) < asOfEnd)) out.completed.push(t);
    else if (mine.some((x) => x.status === "pending" || x.status === "approved")) out.awaiting.push(t);
    else out.pending.push(t);
  }
  return out;
}

function windowFor(input: ReportInput, s: RosterStudent, kind: "project" | "task" | "daily_report", taskId: string | null) {
  return resolveWindow(input.rules, input.extensions, { id: s.id, batch_id: s.batch_id, class_id: s.class_id }, kind, taskId, input.defaultPolicy, input.now);
}

const countStatus = (list: { status: Status }[]) => ({
  approved: list.filter((x) => x.status === "approved").length,
  pending: list.filter((x) => x.status === "pending").length,
  rejected: list.filter((x) => x.status === "rejected").length,
});

// ---------------------------------------------------------------- daily
export interface DailyStudentRow {
  student: RosterStudent;
  expected: boolean;
  report: RepRow | null;
  reportCompliance: Compliance;
  linkedProjects: string[];
  linkedTasks: string[];
  projectsToday: (SubRow & { compliance: Compliance })[];
  labReportsToday: number;
  tasks: TaskBuckets;
  totalsToDate: { approved: number; pending: number; rejected: number };
  progress: ProgressInfo;
}
export interface DailySummary {
  rosterSize: number;
  expected: number;
  reportsSubmitted: number;
  reportsMissing: number;
  reportsApproved: number;
  reportsPending: number;
  reportsRejected: number;
  projectsSubmitted: number;
  projectsApproved: number;
  projectsPending: number;
  projectsRejected: number;
  studentsWithProjects: number;
  studentsWithoutProjects: number;
  labReports: number;
  totalApproved: number;
  totalPending: number;
  totalRejected: number;
  late: number;
  missed: number;
}
export interface DailyModel {
  date: string;
  rows: DailyStudentRow[];
  summary: DailySummary;
  submittedReports: RosterStudent[];
  missingReports: RosterStudent[];
  withProjects: RosterStudent[];
  withoutProjects: RosterStudent[];
}

export function buildDailyModel(input: ReportInput, scope: Scope, date: string): DailyModel {
  const students = studentsInScope(input.students, scope).sort((a, b) => a.name.localeCompare(b.name));
  const { start, end } = pktDayRange(date);
  const rows: DailyStudentRow[] = students.map((s) => {
    const expected = isReportExpected(s, date, input.reportingDays);
    const report = input.reports.find((r) => r.student_id === s.id && r.report_date === date) ?? null;
    const mine = input.submissions.filter((x) => x.student_id === s.id);
    const today = mine.filter((x) => x.submitted_at >= start && x.submitted_at < end);
    const toDate = mine.filter((x) => x.submitted_at < end);
    const dailyWindow = windowFor(input, s, "daily_report", null);
    const titleOf = (id: string) => mine.find((x) => x.id === id)?.title ?? "(removed)";
    const taskTitle = (id: string) => input.tasks.find((t) => t.id === id)?.title ?? "(removed)";
    return {
      student: s,
      expected,
      report,
      reportCompliance: expected || report ? compliance(dailyWindow, report?.submitted_at ?? null, input.now) : "no_deadline",
      linkedProjects: report?.linked_submission_ids.map(titleOf) ?? [],
      linkedTasks: report?.linked_task_ids.map(taskTitle) ?? [],
      projectsToday: today.map((x) => ({ ...x, compliance: compliance(windowFor(input, s, x.task_id ? "task" : "project", x.task_id), x.submitted_at, input.now) })),
      labReportsToday: today.filter((x) => x.has_lab_report).length,
      tasks: taskBuckets(s, input.tasks, input.submissions, end),
      totalsToDate: {
        approved: toDate.filter((x) => x.status === "approved" && (x.reviewed_at ?? x.submitted_at) < end).length,
        pending: toDate.filter((x) => x.status === "pending").length,
        rejected: toDate.filter((x) => x.status === "rejected").length,
      },
      progress: input.progress.get(s.id) ?? NO_PROGRESS,
    };
  });

  const reps = rows.filter((r) => r.report).map((r) => r.report as RepRow);
  const projects = rows.flatMap((r) => r.projectsToday);
  const sum: DailySummary = {
    rosterSize: rows.length,
    expected: rows.filter((r) => r.expected).length,
    reportsSubmitted: reps.length,
    reportsMissing: rows.filter((r) => r.expected && !r.report).length,
    reportsApproved: countStatus(reps).approved,
    reportsPending: countStatus(reps).pending,
    reportsRejected: countStatus(reps).rejected,
    projectsSubmitted: projects.length,
    projectsApproved: countStatus(projects).approved,
    projectsPending: countStatus(projects).pending,
    projectsRejected: countStatus(projects).rejected,
    studentsWithProjects: rows.filter((r) => r.projectsToday.length > 0).length,
    studentsWithoutProjects: rows.filter((r) => r.projectsToday.length === 0).length,
    labReports: rows.reduce((n, r) => n + r.labReportsToday, 0),
    totalApproved: rows.reduce((n, r) => n + r.totalsToDate.approved, 0),
    totalPending: rows.reduce((n, r) => n + r.totalsToDate.pending, 0),
    totalRejected: rows.reduce((n, r) => n + r.totalsToDate.rejected, 0),
    late: rows.filter((r) => r.report && r.reportCompliance === "late").length + projects.filter((p) => p.compliance === "late").length,
    missed: rows.filter((r) => r.expected && !r.report && r.reportCompliance === "missed").length,
  };
  return {
    date,
    rows,
    summary: sum,
    submittedReports: rows.filter((r) => r.report).map((r) => r.student),
    missingReports: rows.filter((r) => r.expected && !r.report).map((r) => r.student),
    withProjects: rows.filter((r) => r.projectsToday.length > 0).map((r) => r.student),
    withoutProjects: rows.filter((r) => r.projectsToday.length === 0).map((r) => r.student),
  };
}

// ---------------------------------------------------------------- date range
export interface RangeStudentRow {
  student: RosterStudent;
  expectedDays: number;
  reportsSubmitted: number;
  reportsMissing: number;
  reportsApproved: number;
  reportsPending: number;
  reportsRejected: number;
  projectsSubmitted: number;
  projectsApproved: number;
  projectsPending: number;
  projectsRejected: number;
  tasksCompleted: number;
  tasksPending: number;
  late: number;
  missed: number;
  progress: ProgressInfo;
}
export interface RangeModel {
  from: string;
  to: string;
  days: number;
  rows: RangeStudentRow[];
  totals: Omit<RangeStudentRow, "student" | "progress">;
}

export function buildRangeModel(input: ReportInput, scope: Scope, from: string, to: string): RangeModel {
  const dates = datesBetween(from, to);
  const students = studentsInScope(input.students, scope).sort((a, b) => a.name.localeCompare(b.name));
  const startIso = pktDayRange(from).start;
  const endIso = pktDayRange(dates.at(-1) ?? to).end;
  const rows: RangeStudentRow[] = students.map((s) => {
    const expectedDates = dates.filter((d) => isReportExpected(s, d, input.reportingDays));
    const reps = input.reports.filter((r) => r.student_id === s.id && r.report_date >= from && r.report_date <= to);
    const subs = input.submissions.filter((x) => x.student_id === s.id && x.submitted_at >= startIso && x.submitted_at < endIso);
    const dailyWindow = windowFor(input, s, "daily_report", null);
    const missing = expectedDates.filter((d) => !reps.some((r) => r.report_date === d));
    const buckets = taskBuckets(s, input.tasks, input.submissions, endIso);
    return {
      student: s,
      expectedDays: expectedDates.length,
      reportsSubmitted: reps.length,
      reportsMissing: missing.length,
      reportsApproved: countStatus(reps).approved,
      reportsPending: countStatus(reps).pending,
      reportsRejected: countStatus(reps).rejected,
      projectsSubmitted: subs.length,
      projectsApproved: countStatus(subs).approved,
      projectsPending: countStatus(subs).pending,
      projectsRejected: countStatus(subs).rejected,
      tasksCompleted: buckets.completed.length,
      tasksPending: buckets.pending.length + buckets.awaiting.length,
      late:
        reps.filter((r) => compliance(dailyWindow, r.submitted_at, input.now) === "late").length +
        subs.filter((x) => compliance(windowFor(input, s, x.task_id ? "task" : "project", x.task_id), x.submitted_at, input.now) === "late").length,
      missed: missing.length > 0 && compliance(dailyWindow, null, input.now) === "missed" ? missing.length : 0,
      progress: input.progress.get(s.id) ?? NO_PROGRESS,
    };
  });
  const add = (f: (r: RangeStudentRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  return {
    from,
    to,
    days: dates.length,
    rows,
    totals: {
      expectedDays: add((r) => r.expectedDays),
      reportsSubmitted: add((r) => r.reportsSubmitted),
      reportsMissing: add((r) => r.reportsMissing),
      reportsApproved: add((r) => r.reportsApproved),
      reportsPending: add((r) => r.reportsPending),
      reportsRejected: add((r) => r.reportsRejected),
      projectsSubmitted: add((r) => r.projectsSubmitted),
      projectsApproved: add((r) => r.projectsApproved),
      projectsPending: add((r) => r.projectsPending),
      projectsRejected: add((r) => r.projectsRejected),
      tasksCompleted: add((r) => r.tasksCompleted),
      tasksPending: add((r) => r.tasksPending),
      late: add((r) => r.late),
      missed: add((r) => r.missed),
    },
  };
}

// ---------------------------------------------------------------- submission summary
export interface SummaryDay {
  date: string;
  expected: number;
  submitted: number;
  missing: number;
  missingStudents: RosterStudent[];
  submittedStudents: RosterStudent[];
}
export interface SummaryModel {
  from: string;
  to: string;
  days: SummaryDay[];
  totals: { expected: number; submitted: number; missing: number };
}

/** Per-day submitted vs missing daily reports. Days where nobody is expected (weekends) are skipped. */
export function buildSummaryModel(input: ReportInput, scope: Scope, from: string, to: string): SummaryModel {
  const students = studentsInScope(input.students, scope).sort((a, b) => a.name.localeCompare(b.name));
  const days: SummaryDay[] = [];
  for (const date of datesBetween(from, to)) {
    const expected = students.filter((s) => isReportExpected(s, date, input.reportingDays));
    const has = (s: RosterStudent) => input.reports.some((r) => r.student_id === s.id && r.report_date === date);
    const submittedStudents = students.filter(has);
    const missingStudents = expected.filter((s) => !has(s));
    if (expected.length === 0 && submittedStudents.length === 0) continue;
    days.push({ date, expected: expected.length, submitted: submittedStudents.length, missing: missingStudents.length, missingStudents, submittedStudents });
  }
  return {
    from,
    to,
    days,
    totals: {
      expected: days.reduce((n, d) => n + d.expected, 0),
      submitted: days.reduce((n, d) => n + d.submitted, 0),
      missing: days.reduce((n, d) => n + d.missing, 0),
    },
  };
}
