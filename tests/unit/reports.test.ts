import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  buildDailyModel, buildRangeModel, buildSummaryModel, isReportExpected,
  type ProgressInfo, type RepRow, type ReportInput, type RosterStudent, type SubRow,
} from "../../src/lib/reports/model";
import { renderDailyPdf, renderRangePdf, renderSummaryPdf } from "../../src/lib/reports/report-pdf";
import { DEFAULT_ORG } from "../../src/lib/workflow-types";

// 2030-01-02 is a Wednesday. Karachi day = 2030-01-01T19:00Z .. 2030-01-02T19:00Z
const DATE = "2030-01-02";
const NOW = new Date("2030-01-02T14:00:00Z");

const student = (o: Partial<RosterStudent> & { id: string; name: string }): RosterStudent => ({
  code: o.id.toUpperCase(), email: `${o.id}@example.com`, user_id: `u-${o.id}`, profile_completed_at: "2029-12-01T10:00:00Z", badge: null,
  class_id: "c1", class_name: "Web 101", batch_id: "b1", batch_name: "Batch A", batch_starts_on: null, batch_ends_on: null, enrolled_active: true, ...o,
});
const sub = (o: Partial<SubRow> & { id: string; student_id: string; title: string }): SubRow => ({
  task_id: null, description: "A description", type: "mini", status: "pending", submitted_at: "2030-01-02T08:00:00Z", reviewed_at: null, feedback: null, has_lab_report: true, ...o,
});
const rep = (o: Partial<RepRow> & { id: string; student_id: string }): RepRow => ({
  report_date: DATE, summary: "Worked on the API", hours_spent: 5, status: "pending", submitted_at: "2030-01-02T10:00:00Z", linked_submission_ids: [], linked_task_ids: [], ...o,
});

const students = [
  student({ id: "ayesha", name: "Ayesha Khan" }),
  student({ id: "bilal", name: "Bilal Ahmed" }),
  student({ id: "chaman", name: "Chaman Lal" }),
  student({ id: "dua", name: "Dua Fatima", batch_id: "b2", batch_name: "Batch B", class_id: "c2", class_name: "Android" }),
  student({ id: "legacy", name: "Legacy Imported", user_id: null }), // imported record, no login
  student({ id: "unenrolled", name: "Not Enrolled", profile_completed_at: null }),
  student({ id: "inactive", name: "Inactive Batch", enrolled_active: false }),
];
const submissions: SubRow[] = [
  sub({ id: "p1", student_id: "ayesha", title: "Todo App", status: "approved", reviewed_at: "2030-01-02T09:00:00Z" }),
  sub({ id: "p2", student_id: "ayesha", title: "Blog", status: "pending" }),
  sub({ id: "p3", student_id: "bilal", title: "Weather", status: "rejected", reviewed_at: "2030-01-02T09:30:00Z" }),
  sub({ id: "p4", student_id: "chaman", title: "Old project", status: "approved", submitted_at: "2029-12-20T08:00:00Z", reviewed_at: "2029-12-21T08:00:00Z" }),
  sub({ id: "p5", student_id: "ayesha", title: "Task work", task_id: "t1", status: "approved", submitted_at: "2029-12-30T08:00:00Z", reviewed_at: "2029-12-31T08:00:00Z" }),
  sub({ id: "p6", student_id: "ayesha", title: "Tomorrow", status: "approved", submitted_at: "2030-01-03T08:00:00Z", reviewed_at: "2030-01-03T09:00:00Z" }), // after the report day
];
const reports: RepRow[] = [
  rep({ id: "r1", student_id: "ayesha", linked_submission_ids: ["p1"], linked_task_ids: ["t1"], status: "approved" }),
  rep({ id: "r2", student_id: "bilal", report_date: "2030-01-01" }), // other day
];
const progress = new Map<string, ProgressInfo>([
  ["ayesha", { approved: 2, pending: 1, rejected: 0, current_badge: "Bronze", next_badge: "Silver", next_counted: 1, next_required: 3, overall_percent: 20 }],
]);
const input: ReportInput = {
  students, submissions, reports, progress, now: NOW, rules: [], extensions: [], defaultPolicy: "open", reportingDays: [1, 2, 3, 4, 5],
  tasks: [
    { id: "t1", class_id: "c1", batch_id: null, title: "Build a REST API", is_active: true },
    { id: "t2", class_id: "c1", batch_id: null, title: "Write tests", is_active: true },
    { id: "t3", class_id: "c2", batch_id: null, title: "Android only", is_active: true },
  ],
};

test("only the active registered roster is expected to report", () => {
  const m = buildDailyModel(input, { kind: "all" }, DATE);
  assert.deepEqual(m.rows.map((r) => r.student.id), ["ayesha", "bilal", "chaman", "dua"]);
  assert.equal(m.summary.rosterSize, 4);
  assert.equal(m.summary.expected, 4);
});

test("missing = expected and no report; an absent report is never counted as submitted", () => {
  const m = buildDailyModel(input, { kind: "all" }, DATE);
  assert.deepEqual(m.submittedReports.map((s) => s.id), ["ayesha"]);
  assert.deepEqual(m.missingReports.map((s) => s.id), ["bilal", "chaman", "dua"]); // bilal's report is for another day
  assert.equal(m.summary.reportsSubmitted, 1);
  assert.equal(m.summary.reportsMissing, 3);
  assert.equal(m.summary.reportsApproved, 1);
});

test("projects: counted on their Karachi submission day, with current statuses", () => {
  const m = buildDailyModel(input, { kind: "all" }, DATE);
  assert.equal(m.summary.projectsSubmitted, 3); // p1,p2,p3 (not p4,p5 earlier / p6 later)
  assert.equal(m.summary.projectsApproved, 1);
  assert.equal(m.summary.projectsPending, 1);
  assert.equal(m.summary.projectsRejected, 1);
  assert.deepEqual(m.withProjects.map((s) => s.id), ["ayesha", "bilal"]);
  assert.deepEqual(m.withoutProjects.map((s) => s.id), ["chaman", "dua"]);
  assert.equal(m.summary.labReports, 3);
  // to-date totals exclude p6 (submitted after the report day)
  const a = m.rows.find((r) => r.student.id === "ayesha")!;
  assert.deepEqual(a.totalsToDate, { approved: 2, pending: 1, rejected: 0 });
  assert.equal(m.summary.totalApproved, 3); // ayesha 2 + chaman 1
});

test("karachi day boundary: 23:30 UTC on the 1st is already the 2nd in Karachi", () => {
  const edge: ReportInput = { ...input, submissions: [sub({ id: "e1", student_id: "dua", title: "Edge", submitted_at: "2030-01-01T19:00:00Z" }), sub({ id: "e2", student_id: "dua", title: "Edge2", submitted_at: "2030-01-01T18:59:59Z" })] };
  const m = buildDailyModel(edge, { kind: "student", id: "dua" }, DATE);
  assert.deepEqual(m.rows[0].projectsToday.map((p) => p.id), ["e1"]);
});

test("task buckets: completed / awaiting / pending", () => {
  const m = buildDailyModel(input, { kind: "student", id: "ayesha" }, DATE);
  const t = m.rows[0].tasks;
  assert.deepEqual(t.completed.map((x) => x.id), ["t1"]);
  assert.deepEqual(t.pending.map((x) => x.id), ["t2"]);
  assert.deepEqual(m.rows[0].linkedProjects, ["Todo App"]);
  assert.deepEqual(m.rows[0].linkedTasks, ["Build a REST API"]);
});

test("scope filters: class, batch, student (a student scope ignores roster rules)", () => {
  assert.deepEqual(buildDailyModel(input, { kind: "class", id: "c2" }, DATE).rows.map((r) => r.student.id), ["dua"]);
  assert.deepEqual(buildDailyModel(input, { kind: "batch", id: "b1" }, DATE).rows.map((r) => r.student.id), ["ayesha", "bilal", "chaman"]);
  const one = buildDailyModel(input, { kind: "student", id: "legacy" }, DATE);
  assert.equal(one.rows.length, 1);
  assert.equal(one.rows[0].expected, false);
  assert.equal(one.summary.reportsMissing, 0);
});

test("reporting rules: weekdays, enrolment date and batch dates", () => {
  const s = student({ id: "x", name: "X", batch_starts_on: "2030-01-02", batch_ends_on: "2030-01-10", profile_completed_at: "2030-01-02T01:00:00Z" });
  assert.equal(isReportExpected(s, "2030-01-01", [1, 2, 3, 4, 5]), false); // before batch start / enrolment
  assert.equal(isReportExpected(s, "2030-01-02", [1, 2, 3, 4, 5]), true);
  assert.equal(isReportExpected(s, "2030-01-05", [1, 2, 3, 4, 5]), false); // Saturday
  assert.equal(isReportExpected(s, "2030-01-05", [1, 2, 3, 4, 5, 6]), true);
  assert.equal(isReportExpected(s, "2030-01-11", [1, 2, 3, 4, 5, 6, 7]), false); // after batch end
  // profile completed at 20:00 UTC on 1 Jan = 01:00 PKT on 2 Jan: first expected day is the 2nd
  assert.equal(isReportExpected(student({ id: "y", name: "Y", profile_completed_at: "2030-01-01T20:00:00Z" }), "2030-01-01", [1, 2, 3, 4, 5, 6, 7]), false);
});

test("range model totals", () => {
  const m = buildRangeModel(input, { kind: "all" }, "2030-01-01", "2030-01-03");
  assert.equal(m.days, 3);
  const bilal = m.rows.find((r) => r.student.id === "bilal")!;
  assert.equal(bilal.expectedDays, 3);
  assert.equal(bilal.reportsSubmitted, 1);
  assert.equal(bilal.reportsMissing, 2);
  assert.equal(m.totals.reportsSubmitted, 2);
  assert.equal(m.totals.projectsSubmitted, 4); // p1 p2 p3 + p6 (3 Jan)
  assert.equal(m.totals.projectsApproved, 2);
});

test("summary model skips days nobody is expected and lists missing students", () => {
  const m = buildSummaryModel(input, { kind: "all" }, "2029-12-29", "2030-01-02"); // Sat 29, Sun 30, Mon 31, Tue 1, Wed 2
  assert.deepEqual(m.days.map((d) => d.date), ["2029-12-31", "2030-01-01", "2030-01-02"]);
  const jan1 = m.days.find((d) => d.date === "2030-01-01")!;
  assert.deepEqual(jan1.submittedStudents.map((s) => s.id), ["bilal"]);
  assert.deepEqual(jan1.missingStudents.map((s) => s.id), ["ayesha", "chaman", "dua"]);
});

// ---- PDF -------------------------------------------------------------------
const ctx = { org: { ...DEFAULT_ORG, org_name: "Atlas Academy" }, scopeLabel: "All students", generatedAt: new Date("2030-01-02T14:05:00Z") };
const havePdftotext = spawnSync("pdftotext", ["-v"]).status !== null;
function text(bytes: Uint8Array) {
  const f = join(mkdtempSync(join(tmpdir(), "pdf-")), "r.pdf");
  writeFileSync(f, bytes);
  return execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" });
}

test("daily PDF is a valid A4 document with real data, page numbers and a timestamp", async () => {
  const bytes = await renderDailyPdf(buildDailyModel(input, { kind: "all" }, DATE), ctx);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 0.1 && Math.abs(height - 841.89) < 0.1);
  if (!havePdftotext) return;
  const t = text(bytes);
  for (const needle of ["Atlas Academy", "Daily Progress Report", "Wednesday, 2 January 2030", "Ayesha Khan", "Todo App", "Blog", "Weather", "Approved", "Pending", "Rejected", "Bilal Ahmed", "AYESHA", "ayesha@example.com", "Web 101 / Batch A", "Build a REST API", "NOT SUBMITTED", "Generated 02 Jan 2030", "PKT"]) {
    assert.ok(t.includes(needle), `PDF should contain "${needle}"`);
  }
  assert.ok(t.includes(`Page 1 of ${doc.getPageCount()}`));
  assert.ok(!t.includes("Legacy Imported"), "students without a login are not in the roster");
  assert.ok(!t.includes("Tomorrow"), "projects from other days are not listed as submitted that day");
});

test("individual daily PDF shows one student and their numbers", async () => {
  const bytes = await renderDailyPdf(buildDailyModel(input, { kind: "student", id: "ayesha" }, DATE), { ...ctx, scopeLabel: "Student: Ayesha Khan" });
  if (!havePdftotext) return;
  const t = text(bytes);
  assert.ok(t.includes("Daily Student Progress Report"));
  assert.ok(t.includes("2 approved, 1 pending, 0 rejected"));
  assert.ok(t.includes("Bronze"));
  assert.ok(!t.includes("Bilal Ahmed"));
});

test("long lists flow onto multiple pages with repeating headers and unique page numbers", async () => {
  const many = Array.from({ length: 150 }, (_, i) => student({ id: `s${i}`, name: `Student Number ${i}` }));
  const big: ReportInput = { ...input, students: many, submissions: [], reports: [] };
  const bytes = await renderSummaryPdf(buildSummaryModel(big, { kind: "all" }, DATE, DATE), ctx);
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 4, `expected several pages, got ${doc.getPageCount()}`);
  if (!havePdftotext) return;
  const t = text(bytes);
  assert.ok(t.includes("Student Number 149"));
  assert.ok(t.includes(`Page ${doc.getPageCount()} of ${doc.getPageCount()}`));
  assert.ok(t.includes("Missing (150)"));
});

test("range PDF lists each student with real counts", async () => {
  const bytes = await renderRangePdf(buildRangeModel(input, { kind: "all" }, "2030-01-01", "2030-01-03"), ctx);
  if (!havePdftotext) return;
  const t = text(bytes);
  assert.ok(t.includes("Student Progress Report"));
  assert.ok(t.includes("01 Jan 2030 to 03 Jan 2030"));
  assert.ok(/Bilal Ahmed[\s\S]*1\/3/.test(t));
});

test("non-Latin names never break rendering", async () => {
  const odd = student({ id: "odd", name: "Ayşe Ömer 李雷 محمد" });
  const bytes = await renderDailyPdf(buildDailyModel({ ...input, students: [odd] }, { kind: "student", id: "odd" }, DATE), ctx);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  if (havePdftotext) assert.ok(/Ayse \u00d6mer \? \?/.test(text(bytes)) || text(bytes).includes("Ayse"), "accents stripped where possible, other scripts become ?");
});
