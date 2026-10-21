import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFilterOptions } from "@/lib/admin-queries";
import { loadReportInput } from "@/lib/reports/load";
import { buildDailyModel, type Scope } from "@/lib/reports/model";
import { PdfExportPanel } from "@/components/admin/reports/PdfExportPanel";
import { ReviewActions } from "@/components/admin/workflow/ReviewActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, StatusPill } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/textarea";
import { formatLongDate, formatPkt, isDateString, pktDate } from "@/lib/time";
import { COMPLIANCE_LABEL } from "@/lib/deadlines";

export const metadata = { title: "Daily reports" };

const PAGE_SIZE = 25;
const STATUSES = ["all", "submitted", "missing", "pending", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUSES)[number];
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : "");

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = pktDate();
  const date = sp.date && isDateString(sp.date) && sp.date <= today ? sp.date : today;
  const classId = uuid(sp.classId);
  const batchId = uuid(sp.batchId);
  const studentId = uuid(sp.studentId);
  const status: StatusFilter = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as StatusFilter) : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const sb = await createClient();
  const scope: Scope = studentId ? { kind: "student", id: studentId } : batchId ? { kind: "batch", id: batchId } : classId ? { kind: "class", id: classId } : { kind: "all" };
  const [{ input }, options] = await Promise.all([loadReportInput(sb, { from: date, to: date, mode: "admin" }), getFilterOptions(sb)]);
  const model = buildDailyModel(input, scope, date);
  const s = model.summary;

  const rows = model.rows.filter((r) => {
    switch (status) {
      case "submitted": return !!r.report;
      case "missing": return r.expected && !r.report;
      case "pending": case "approved": case "rejected": return r.report?.status === status;
      default: return true;
    }
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ date, ...(classId && { classId }), ...(batchId && { batchId }), ...(studentId && { studentId }), status, ...over });
    return `/admin/reports?${p}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Daily reports</h1>
        <p className="mt-1 text-muted-foreground">{formatLongDate(date)} · Asia/Karachi. Missing reports are worked out from the active student roster, never counted as submitted.</p>
      </header>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[10rem_1fr_1fr_1fr_10rem_auto]">
            <div><label htmlFor="f-date" className="mb-1 block text-sm font-medium">Date</label><Input id="f-date" type="date" name="date" defaultValue={date} max={today} /></div>
            <div><label htmlFor="f-class" className="mb-1 block text-sm font-medium">Class</label>
              <NativeSelect id="f-class" name="classId" defaultValue={classId}><option value="">All classes</option>{options.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></div>
            <div><label htmlFor="f-batch" className="mb-1 block text-sm font-medium">Batch</label>
              <NativeSelect id="f-batch" name="batchId" defaultValue={batchId}><option value="">All batches</option>{options.batches.map((b) => <option key={b.id} value={b.id}>{b.class_name} / {b.name}</option>)}</NativeSelect></div>
            <div><label htmlFor="f-student" className="mb-1 block text-sm font-medium">Student</label>
              <NativeSelect id="f-student" name="studentId" defaultValue={studentId}><option value="">All students</option>{options.students.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></div>
            <div><label htmlFor="f-status" className="mb-1 block text-sm font-medium">Status</label>
              <NativeSelect id="f-status" name="status" defaultValue={status}>{STATUSES.map((v) => <option key={v} value={v}>{v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}</option>)}</NativeSelect></div>
            <div className="flex items-end gap-2"><Button type="submit">Apply</Button><Button asChild variant="ghost"><Link href="/admin/reports">Reset</Link></Button></div>
          </form>
        </CardContent>
      </Card>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
        {[
          { label: "Expected to report", value: s.expected },
          { label: "Submitted", value: s.reportsSubmitted },
          { label: "Missing", value: s.reportsMissing },
          { label: "Awaiting review", value: s.reportsPending },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
            <dd className="text-2xl font-extrabold">{t.value}</dd>
            <dt className="text-xs text-muted-foreground sm:text-sm">{t.label}</dt>
          </div>
        ))}
      </dl>

      <PdfExportPanel options={options} today={today} initial={{ date, classId, batchId, studentId }} />

      {rows.length === 0 ? (
        <EmptyState title="No students match these filters">{model.rows.length === 0 ? "There are no active students in this selection yet." : "Try another status or date."}</EmptyState>
      ) : (
        <>
          <Card className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <caption className="sr-only">Daily reports for {date}</caption>
              <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3 font-medium">Student</th>
                  <th scope="col" className="p-3 font-medium">Class / batch</th>
                  <th scope="col" className="p-3 font-medium">Report</th>
                  <th scope="col" className="p-3 font-medium">Details</th>
                  <th scope="col" className="p-3 font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.student.id} className="border-b border-border/40 align-top last:border-0">
                    <td className="p-3"><Link href={`/admin/students/${r.student.id}`} className="font-medium hover:underline">{r.student.name}</Link><p className="text-xs text-muted-foreground">{r.student.email ?? ""}</p></td>
                    <td className="p-3 text-muted-foreground">{[r.student.class_name, r.student.batch_name].filter(Boolean).join(" / ") || "-"}</td>
                    <td className="p-3">
                      {r.report ? (
                        <>
                          <StatusPill status={r.report.status} />
                          <p className="mt-1 text-xs text-muted-foreground">{formatPkt(r.report.submitted_at)}</p>
                          <p className="text-xs text-muted-foreground">{COMPLIANCE_LABEL[r.reportCompliance]}</p>
                        </>
                      ) : r.expected ? (
                        <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">Missing</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not expected</span>
                      )}
                    </td>
                    <td className="max-w-md p-3">
                      {r.report ? (
                        <details>
                          <summary className="cursor-pointer line-clamp-2 whitespace-pre-wrap">{r.report.summary}</summary>
                          <p className="mt-2 whitespace-pre-wrap">{r.report.summary}</p>
                          {r.report.hours_spent != null && <p className="mt-1 text-xs text-muted-foreground">{r.report.hours_spent} hours</p>}
                          {r.linkedProjects.length > 0 && <p className="mt-1 text-xs">Projects: {r.linkedProjects.join(", ")}</p>}
                          {r.linkedTasks.length > 0 && <p className="mt-1 text-xs">Tasks: {r.linkedTasks.join(", ")}</p>}
                        </details>
                      ) : (
                        <span className="text-muted-foreground">{r.projectsToday.length} project{r.projectsToday.length === 1 ? "" : "s"} submitted today</span>
                      )}
                    </td>
                    <td className="p-3">{r.report ? <ReviewActions kind="report" id={r.report.id} status={r.report.status} title={`Report for ${date}`} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages} · {rows.length} students</span>
              <div className="flex gap-2">
                {page > 1 && <Button asChild variant="outline" size="sm"><Link href={qs({ page: String(page - 1) })}>Previous</Link></Button>}
                {page < pages && <Button asChild variant="outline" size="sm"><Link href={qs({ page: String(page + 1) })}>Next</Link></Button>}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
