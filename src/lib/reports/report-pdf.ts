/** Renders the report models to professional A4 PDFs. Pure apart from pdf-lib (the logo is passed in). */
import { COMPLIANCE_LABEL, type Compliance } from "../deadlines";
import type { OrgSettings } from "../workflow-types";
import { formatLongDate, formatPkt, formatPktDate, formatShortDate } from "../time";
import { COLORS, PdfBuilder, type Cell, type Column } from "./pdf-layout";
import type { DailyModel, DailyStudentRow, RangeModel, RosterStudent, Status, SummaryModel } from "./model";

export interface PdfContext {
  org: OrgSettings;
  scopeLabel: string;
  generatedAt: Date;
  logoPng?: Uint8Array | null;
  /** false for a student's own copy: they cannot read the deadline rules, so no compliance column is printed. */
  showCompliance?: boolean;
}

const statusCell = (s: Status): Cell => ({
  text: s[0].toUpperCase() + s.slice(1),
  bold: true,
  color: s === "approved" ? COLORS.good : s === "rejected" ? COLORS.bad : COLORS.warn,
});
const complianceCell = (c: Compliance): Cell => ({
  text: COMPLIANCE_LABEL[c],
  color: c === "on_time" ? COLORS.good : c === "late" || c === "missed" ? COLORS.bad : COLORS.muted,
});
const place = (s: RosterStudent) => [s.class_name, s.batch_name].filter(Boolean).join(" / ") || "Not enrolled";
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "-");

async function start(ctx: PdfContext, title: string, subtitleLines: string[], docTitle: string) {
  return PdfBuilder.create({
    orgName: ctx.org.org_name,
    tagline: ctx.org.tagline,
    accent: ctx.org.accent_color,
    logoPng: ctx.logoPng ?? null,
    title,
    subtitleLines,
    documentTitle: docTitle,
  });
}

const NOTES =
  "Notes: project and report statuses are the current review status. A daily report is expected on the organisation's reporting weekdays, " +
  "from the day a student completes their profile, within their batch dates. A missing report is never counted as submitted. All times are Asia/Karachi (PKT).";

// ------------------------------------------------------------------ daily
export async function renderDailyPdf(m: DailyModel, ctx: PdfContext): Promise<Uint8Array> {
  const single = m.rows.length === 1;
  const pdf = await start(
    ctx,
    single ? "Daily Student Progress Report" : "Daily Progress Report",
    [`Reporting date: ${formatLongDate(m.date)}`, `Scope: ${ctx.scopeLabel}`],
    `Daily progress report ${m.date}`,
  );
  const s = m.summary;

  pdf.heading("Summary");
  pdf.stats([
    { label: "Students in report", value: s.rosterSize },
    { label: "Daily reports submitted", value: s.reportsSubmitted, color: COLORS.good },
    { label: "Daily reports missing", value: s.reportsMissing, color: s.reportsMissing ? COLORS.bad : COLORS.ink },
    { label: "Reports expected", value: s.expected },
    { label: "Projects submitted", value: s.projectsSubmitted },
    { label: "Students with projects", value: s.studentsWithProjects },
    { label: "Students without projects", value: s.studentsWithoutProjects },
    { label: "Lab reports submitted", value: s.labReports },
    { label: "Approved projects (to date)", value: s.totalApproved, color: COLORS.good },
    { label: "Pending projects (to date)", value: s.totalPending, color: COLORS.warn },
    { label: "Rejected projects (to date)", value: s.totalRejected, color: s.totalRejected ? COLORS.bad : COLORS.ink },
    ...(ctx.showCompliance === false ? [] : [{ label: "Late / missed items", value: `${s.late} / ${s.missed}` }]),
  ]);
  pdf.paragraph(
    `Reports on this date: ${s.reportsApproved} approved, ${s.reportsPending} pending review, ${s.reportsRejected} rejected. ` +
      `Projects submitted on this date: ${s.projectsApproved} approved, ${s.projectsPending} pending, ${s.projectsRejected} rejected.`,
    { size: 9, color: COLORS.muted },
  );

  if (!single) {
    const nameCols: Column[] = [
      { header: "Student", width: 3 },
      { header: "ID", width: 1.3 },
      { header: "Class / batch", width: 3 },
    ];
    const names = (list: RosterStudent[]) => list.map((st) => [st.name, st.code, place(st)]);
    pdf.heading(`Daily report submitted (${m.submittedReports.length})`);
    pdf.table(
      [...nameCols, { header: "Submitted at", width: 2.6 }, { header: "Status", width: 1.4 }],
      m.rows.filter((r) => r.report).map((r) => [r.student.name, r.student.code, place(r.student), formatPkt((r.report as NonNullable<typeof r.report>).submitted_at), statusCell((r.report as NonNullable<typeof r.report>).status)]),
      { emptyText: "No daily reports were submitted on this date." },
    );
    pdf.heading(`Daily report NOT submitted (${m.missingReports.length})`);
    pdf.table(nameCols, names(m.missingReports), { emptyText: "Every expected student submitted a report." });
    pdf.heading(`Students who submitted projects (${m.withProjects.length})`);
    pdf.table(
      [...nameCols, { header: "Projects", width: 1.2, align: "right" }],
      m.rows.filter((r) => r.projectsToday.length).map((r) => [r.student.name, r.student.code, place(r.student), String(r.projectsToday.length)]),
      { emptyText: "No projects were submitted on this date." },
    );
    pdf.heading(`Students who did not submit any project (${m.withoutProjects.length})`);
    pdf.table(nameCols, names(m.withoutProjects), { emptyText: "Every student submitted at least one project." });
  }

  pdf.heading(single ? "Student details" : "Student-wise details");
  if (m.rows.length === 0) pdf.paragraph("No students match this selection.", { color: COLORS.muted });
  for (const row of m.rows) studentBlock(pdf, row, m.date, ctx.showCompliance !== false);

  pdf.space(6);
  pdf.paragraph(NOTES, { size: 7.5, color: COLORS.muted });
  return pdf.finish(ctx.generatedAt);
}

function studentBlock(pdf: PdfBuilder, r: DailyStudentRow, date: string, showCompliance: boolean) {
  const st = r.student;
  pdf.ensure(110);
  pdf.space(4);
  pdf.paragraph(st.name, { size: 11, bold: true });
  pdf.facts([
    ["Student ID", st.code],
    ["Email", st.email ?? "-"],
    ["Class / batch", place(st)],
    ["Badge", `${r.progress.current_badge ?? st.badge ?? "None yet"}${r.progress.next_badge ? `  (next: ${r.progress.next_badge} ${r.progress.next_counted}/${r.progress.next_required})` : ""}`],
    ["Overall progress", `${r.progress.overall_percent}% of the badge ladder`],
    ["Projects to date", `${r.totalsToDate.approved} approved, ${r.totalsToDate.pending} pending, ${r.totalsToDate.rejected} rejected`],
  ]);
  if (r.report) {
    pdf.facts([
      ["Daily report", `Submitted ${formatPkt(r.report.submitted_at)} - ${r.report.status}${r.report.hours_spent != null ? ` - ${r.report.hours_spent} h` : ""}`],
      ...(showCompliance ? ([["Deadline status", COMPLIANCE_LABEL[r.reportCompliance]]] as [string, string][]) : []),
      ["Summary", r.report.summary],
      ...(r.linkedProjects.length ? ([["Linked projects", r.linkedProjects.join("; ")]] as [string, string][]) : []),
      ...(r.linkedTasks.length ? ([["Linked tasks", r.linkedTasks.join("; ")]] as [string, string][]) : []),
    ]);
  } else {
    pdf.facts([["Daily report", r.expected ? `NOT SUBMITTED${showCompliance ? ` (${COMPLIANCE_LABEL[r.reportCompliance]})` : ""}` : "Not expected on this date"]]);
  }
  pdf.facts([
    ["Tasks", `${r.tasks.completed.length} completed, ${r.tasks.awaiting.length} awaiting review, ${r.tasks.pending.length} pending`],
    ...(r.tasks.pending.length ? ([["Pending tasks", r.tasks.pending.map((t) => t.title).join("; ")]] as [string, string][]) : []),
    ["Lab reports", `${r.labReportsToday} submitted on ${formatShortDate(date)}`],
  ]);
  pdf.space(4);
  pdf.table(
    [
      { header: "Project submitted", width: 3 },
      { header: "Description", width: 4 },
      { header: "Time", width: 1.7 },
      { header: "Status", width: 1.3 },
      ...(showCompliance ? [{ header: "Deadline", width: 1.4 }] : []),
    ],
    r.projectsToday.map((p) => [p.title, p.description ?? "-", formatPkt(p.submitted_at).replace(/^.*?, ?/, ""), statusCell(p.status), ...(showCompliance ? [complianceCell(p.compliance)] : [])]),
    { emptyText: "No projects submitted on this date.", maxLines: 4 },
  );
}

// ------------------------------------------------------------------ range
export async function renderRangePdf(m: RangeModel, ctx: PdfContext): Promise<Uint8Array> {
  const pdf = await start(
    ctx,
    "Student Progress Report",
    [`Reporting period: ${formatShortDate(m.from)} to ${formatShortDate(m.to)} (${m.days} day${m.days === 1 ? "" : "s"})`, `Scope: ${ctx.scopeLabel}`],
    `Progress report ${m.from} to ${m.to}`,
  );
  const t = m.totals;
  pdf.heading("Summary");
  pdf.stats([
    { label: "Students", value: m.rows.length },
    { label: "Reports submitted / expected", value: `${t.reportsSubmitted} / ${t.expectedDays}` },
    { label: "Reports missing", value: t.reportsMissing, color: t.reportsMissing ? COLORS.bad : COLORS.ink },
    { label: "Report submission rate", value: pct(Math.min(t.reportsSubmitted, t.expectedDays), t.expectedDays) },
    { label: "Projects submitted", value: t.projectsSubmitted },
    { label: "Projects approved", value: t.projectsApproved, color: COLORS.good },
    { label: "Projects pending", value: t.projectsPending, color: COLORS.warn },
    { label: "Projects rejected", value: t.projectsRejected, color: t.projectsRejected ? COLORS.bad : COLORS.ink },
    { label: "Reports approved", value: t.reportsApproved, color: COLORS.good },
    { label: "Reports pending", value: t.reportsPending, color: COLORS.warn },
    { label: "Reports rejected", value: t.reportsRejected },
    { label: "Late / missed", value: `${t.late} / ${t.missed}` },
  ]);

  pdf.heading("Student-wise progress");
  pdf.table(
    [
      { header: "Student", width: 3.2 },
      { header: "Class / batch", width: 2.6 },
      { header: "Reports", width: 1.3, align: "center" },
      { header: "Missing", width: 1.1, align: "center" },
      { header: "Projects", width: 1.1, align: "center" },
      { header: "A / P / R", width: 1.5, align: "center" },
      { header: "Tasks done", width: 1.2, align: "center" },
      { header: "Badge", width: 1.8 },
      { header: "Progress", width: 1.2, align: "center" },
    ],
    m.rows.map((r) => [
      { text: r.student.name, bold: true },
      place(r.student),
      `${r.reportsSubmitted}/${r.expectedDays}`,
      { text: String(r.reportsMissing), color: r.reportsMissing ? COLORS.bad : COLORS.ink },
      String(r.projectsSubmitted),
      `${r.projectsApproved} / ${r.projectsPending} / ${r.projectsRejected}`,
      `${r.tasksCompleted}`,
      r.progress.current_badge ?? r.student.badge ?? "None yet",
      `${r.progress.overall_percent}%`,
    ]),
    { size: 8, emptyText: "No students match this selection." },
  );
  pdf.paragraph("A / P / R = projects submitted in the period that are currently Approved / Pending / Rejected. Reports = submitted / expected.", { size: 7.5, color: COLORS.muted });
  pdf.space(4);
  pdf.paragraph(NOTES, { size: 7.5, color: COLORS.muted });
  return pdf.finish(ctx.generatedAt);
}

// ------------------------------------------------------------------ submission summary
export async function renderSummaryPdf(m: SummaryModel, ctx: PdfContext): Promise<Uint8Array> {
  const same = m.from === m.to;
  const pdf = await start(
    ctx,
    "Daily Submission Summary",
    [same ? `Date: ${formatLongDate(m.from)}` : `Period: ${formatShortDate(m.from)} to ${formatShortDate(m.to)}`, `Scope: ${ctx.scopeLabel}`],
    `Daily submission summary ${m.from}${same ? "" : ` to ${m.to}`}`,
  );
  pdf.heading("Summary");
  pdf.stats([
    { label: "Reports expected", value: m.totals.expected },
    { label: "Submitted", value: m.totals.submitted, color: COLORS.good },
    { label: "Missing", value: m.totals.missing, color: m.totals.missing ? COLORS.bad : COLORS.ink },
    { label: "Submission rate", value: pct(Math.min(m.totals.submitted, m.totals.expected), m.totals.expected) },
  ]);
  if (!same) {
    pdf.heading("Day by day");
    pdf.table(
      [
        { header: "Date", width: 3 },
        { header: "Expected", width: 1.2, align: "center" },
        { header: "Submitted", width: 1.2, align: "center" },
        { header: "Missing", width: 1.2, align: "center" },
        { header: "Rate", width: 1, align: "center" },
      ],
      m.days.map((d) => [formatPktDate(`${d.date}T12:00:00+05:00`), String(d.expected), String(d.submitted), { text: String(d.missing), color: d.missing ? COLORS.bad : COLORS.ink }, pct(Math.min(d.submitted, d.expected), d.expected)]),
      { emptyText: "No reporting days in this period." },
    );
  }
  for (const d of m.days) {
    pdf.heading(`${formatLongDate(d.date)}`);
    const cols: Column[] = [
      { header: "Student", width: 3 },
      { header: "ID", width: 1.3 },
      { header: "Class / batch", width: 3 },
    ];
    pdf.paragraph(`Submitted (${d.submitted})`, { bold: true, size: 9.5 });
    pdf.table(cols, d.submittedStudents.map((s) => [s.name, s.code, place(s)]), { emptyText: "Nobody submitted a report." });
    pdf.paragraph(`Missing (${d.missing})`, { bold: true, size: 9.5, color: d.missing ? COLORS.bad : COLORS.ink });
    pdf.table(cols, d.missingStudents.map((s) => [s.name, s.code, place(s)]), { emptyText: "No missing reports." });
  }
  pdf.paragraph(NOTES, { size: 7.5, color: COLORS.muted });
  return pdf.finish(ctx.generatedAt);
}
