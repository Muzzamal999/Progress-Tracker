import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReviewCard, type ReviewItem } from "@/components/admin/workflow/ReviewCard";
import { EmptyState } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { ReportRow, SubmissionRow } from "@/lib/workflow-types";

export const metadata = { title: "Review queue" };
const STATUSES = ["pending", "approved", "rejected"] as const;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "pending";
  const kind = sp.kind === "report" ? "report" : "submission";
  const supabase = await createClient();

  const [{ count: pendingSubs }, { count: pendingReps }] = await Promise.all([
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("daily_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  let items: ReviewItem[] = [];
  if (kind === "submission") {
    const { data } = await supabase.from("submissions").select("*, students(name)").eq("status", status).order("submitted_at", { ascending: status === "pending" }).limit(50);
    items = ((data ?? []) as (SubmissionRow & { students: { name: string } | null })[]).map((s) => ({
      kind: "submission", id: s.id, studentName: s.students?.name ?? "Unknown", title: s.title,
      meta: `${s.type} project · ${new Date(s.submitted_at).toLocaleDateString("en-GB")}${s.resubmit_count ? " · resubmitted" : ""}`,
      body: s.description, link: s.link, attachments: s.attachments, status: s.status, feedback: s.feedback,
    }));
  } else {
    const { data } = await supabase.from("daily_reports").select("*, students(name)").eq("status", status).order("report_date", { ascending: false }).limit(50);
    items = ((data ?? []) as (ReportRow & { students: { name: string } | null })[]).map((r) => ({
      kind: "report", id: r.id, studentName: r.students?.name ?? "Unknown", title: `Report for ${r.report_date}`,
      meta: r.hours_spent != null ? `${r.hours_spent} h` : "Daily report",
      body: [r.summary, r.blockers ? `Blockers: ${r.blockers}` : ""].filter(Boolean).join("\n\n"), link: null, attachments: r.attachments, status: r.status, feedback: r.feedback,
    }));
  }

  const tab = (href: string, label: string, active: boolean) => (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70")}>{label}</Link>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Review queue</h1>
        <p className="mt-1 text-muted-foreground">Only projects you approve count towards a student&apos;s badges.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {tab(`/admin/review?kind=submission&status=${status}`, `Projects${pendingSubs ? ` (${pendingSubs} pending)` : ""}`, kind === "submission")}
        {tab(`/admin/review?kind=report&status=${status}`, `Daily reports${pendingReps ? ` (${pendingReps} pending)` : ""}`, kind === "report")}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {STATUSES.map((s) => (
          <Fragment key={s}>{tab(`/admin/review?kind=${kind}&status=${s}`, s[0].toUpperCase() + s.slice(1), s === status)}</Fragment>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState title={status === "pending" ? "Nothing waiting for review" : `No ${status} ${kind === "report" ? "reports" : "projects"}`}>
          {status === "pending" ? "New student submissions appear here as soon as they are sent." : undefined}
        </EmptyState>
      ) : (
        <ul className="space-y-4">{items.map((i) => <ReviewCard key={i.id} item={i} />)}</ul>
      )}
    </div>
  );
}
