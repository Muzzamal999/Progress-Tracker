import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudentPage } from "@/lib/student-session";
import { getMyWindows } from "@/lib/my-deadlines";
import { ReviewTimeline } from "@/components/ReviewTimeline";
import type { ReviewEvent } from "@/lib/review-history";
import { formatPkt } from "@/lib/time";
import { ProjectForm } from "@/components/student/ProjectForm";
import { ResubmitButton } from "@/components/student/ResubmitButton";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { PdfViewer } from "@/components/PdfViewer";
import { EmptyState, StatusPill } from "@/components/ui/field";
import type { SubmissionRow } from "@/lib/workflow-types";

export const metadata = { title: "My projects" };

export default async function ProjectsPage() {
  const { student } = await requireStudentPage();
  if (!student.profile_completed_at) {
    return (
      <EmptyState title="Complete your profile first">
        You need a finished profile and an enrolled batch before you can submit projects.
        <div className="mt-4"><Button asChild><Link href="/dashboard/profile">Complete profile</Link></Button></div>
      </EmptyState>
    );
  }
  const supabase = await createClient();
  const [{ data }, { data: tasks }, { data: events }, windows] = await Promise.all([
    supabase.from("submissions").select("*").order("submitted_at", { ascending: false }),
    supabase.from("tasks").select("id, title").eq("is_active", true).order("created_at"),
    supabase.from("review_events").select("*").eq("kind", "submission").order("created_at"),
    getMyWindows(),
  ]);
  const history = (events ?? []) as ReviewEvent[];
  const subs = (data ?? []) as SubmissionRow[];
  const lockedTasks = new Set(subs.filter((s) => s.status !== "rejected" && s.task_id).map((s) => s.task_id));
  const taskList = (tasks ?? []).filter((t) => !lockedTasks.has(t.id));
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      <section aria-labelledby="new-h">
        <h2 id="new-h" className="text-xl font-bold">Submit a project</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Submissions are locked once sent: you cannot edit them unless an admin rejects them. Only projects approved by an admin count towards your badges. Pending and rejected work does not.</p>
        <ProjectForm tasks={taskList} windows={windows} />
      </section>
      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className="mb-5 text-xl font-bold">My submissions ({subs.length})</h2>
        {subs.length === 0 ? (
          <EmptyState title="Nothing submitted yet">Your submissions and the admin&apos;s feedback will show up here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {subs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
                <div className="min-w-0">
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-xs text-muted-foreground">Submitted {formatPkt(s.submitted_at)}{s.resubmit_count ? ` · resubmitted ${s.resubmit_count}×` : ""}</p>
                  {s.feedback && <p className="mt-2 rounded-lg bg-secondary p-2 text-sm"><span className="font-medium">Admin feedback:</span> {s.feedback}</p>}
                </div>
                <div className="flex items-center gap-2">{s.status !== "rejected" && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Locked" />}<StatusPill status={s.status} /></div>
                {s.lab_report && <div className="w-full"><PdfViewer pdf={s.lab_report} label="My lab report" openHref={`/api/submissions/${s.id}/file?which=lab`} downloadHref={`/api/submissions/${s.id}/file?which=lab&download=1`} /></div>}
                <ReviewTimeline events={history.filter((e) => e.item_id === s.id)} label="Review history" />
                {s.status === "rejected" && (
                  <ResubmitButton
                    tasks={taskList}
                    windows={windows}
                    draft={{ id: s.id, title: s.title, description: s.description ?? "", type: s.type, stack: s.stack, link: s.link ?? "", taskId: s.task_id }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
