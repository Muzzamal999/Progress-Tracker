import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudentPage } from "@/lib/student-session";
import { ReportForm } from "@/components/student/ReportForm";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusPill } from "@/components/ui/field";
import type { ReportRow } from "@/lib/workflow-types";

export const metadata = { title: "Daily reports" };

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
  const { data } = await supabase.from("daily_reports").select("*").order("report_date", { ascending: false }).limit(30);
  const reports = (data ?? []) as ReportRow[];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      <section aria-labelledby="new-h">
        <h2 id="new-h" className="mb-5 text-xl font-bold">Submit today&apos;s report</h2>
        <ReportForm today={today} />
      </section>
      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className="mb-5 text-xl font-bold">My reports</h2>
        {reports.length === 0 ? (
          <EmptyState title="No reports yet">Write a short daily report. An admin reviews each one and can leave feedback.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{new Date(r.report_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                  <StatusPill status={r.status} />
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{r.summary}</p>
                {r.feedback && <p className="mt-2 rounded-lg bg-secondary p-2 text-sm"><span className="font-medium">Admin feedback:</span> {r.feedback}</p>}
                {r.status === "rejected" && <p className="mt-2 text-xs text-muted-foreground">Submit a new report for this date to replace it.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
