import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudentPage } from "@/lib/student-session";
import { getMyWindows } from "@/lib/my-deadlines";
import { pktDate, formatShortDate, formatPkt } from "@/lib/time";
import { ReportForm } from "@/components/student/ReportForm";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusPill } from "@/components/ui/field";
import type { ReportRow } from "@/lib/workflow-types";

export const metadata = { title: "Daily reports" };

type ReportWithLinks = ReportRow & { daily_report_items: { submission_id: string | null; task_id: string | null }[] };

export default async function ReportsPage() {
  const { student } = await requireStudentPage();
  if (!student.profile_completed_at) {
    return (
      <EmptyState title="Complete your profile first">
        Daily reports are available once you are enrolled in a batch.
        <div className="mt-4"><Button asChild><Link href="/dashboard/profile">Complete profile</Link></Button></div>
      </EmptyState>
    );
  }
  const supabase = await createClient();
  const [{ data }, { data: subs }, { data: tasks }, windows] = await Promise.all([
    supabase.from("daily_reports").select("*, daily_report_items(submission_id, task_id)").order("report_date", { ascending: false }).limit(30),
    supabase.from("submissions").select("id, title").order("submitted_at", { ascending: false }),
    supabase.from("tasks").select("id, title").eq("is_active", true).order("created_at"),
    getMyWindows(),
  ]);
  const reports = (data ?? []) as ReportWithLinks[];
  const projects = subs ?? [];
  const taskList = tasks ?? [];
  const title = (list: { id: string; title: string }[], id: string | null) => list.find((x) => x.id === id)?.title ?? "(removed)";
  const today = pktDate(); // Karachi calendar date, the same one the database uses
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      <section aria-labelledby="new-h">
        <h2 id="new-h" className="mb-5 text-xl font-bold">Submit today&apos;s report</h2>
        <ReportForm today={today} windows={windows} projects={projects} tasks={taskList} />
      </section>
      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className="mb-5 text-xl font-bold">My reports</h2>
        {reports.length === 0 ? (
          <EmptyState title="No reports yet">Write a short daily report. An admin reviews each one and can leave feedback.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{formatShortDate(r.report_date)}</p>
                  <div className="flex items-center gap-2">
                    <StatusPill status={r.status} />
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/reports/mine/pdf?date=${r.report_date}`} aria-label={`Download the report for ${r.report_date} as PDF`}><Download /> PDF</a>
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Submitted {formatPkt(r.submitted_at)}{r.hours_spent != null ? ` · ${r.hours_spent} h` : ""}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{r.summary}</p>
                {r.daily_report_items.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Linked: {r.daily_report_items.map((i) => (i.submission_id ? `project “${title(projects, i.submission_id)}”` : `task “${title(taskList, i.task_id)}”`)).join(", ")}
                  </p>
                )}
                {r.feedback && <p className="mt-2 rounded-lg bg-secondary p-2 text-sm"><span className="font-medium">Admin feedback:</span> {r.feedback}</p>}
                {r.status === "rejected" && <p className="mt-2 text-xs text-muted-foreground">Submit a new report for this date to replace it (while the submission window is open).</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
