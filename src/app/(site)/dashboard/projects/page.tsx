import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudentPage } from "@/lib/student-session";
import { ProjectForm } from "@/components/student/ProjectForm";
import { ResubmitButton } from "@/components/student/ResubmitButton";
import { Button } from "@/components/ui/button";
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
  const [{ data }, { data: tasks }] = await Promise.all([
    supabase.from("submissions").select("*").order("submitted_at", { ascending: false }),
    supabase.from("tasks").select("id, title").eq("is_active", true).order("created_at"),
  ]);
  const subs = (data ?? []) as SubmissionRow[];
  const taskList = tasks ?? [];
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      <section aria-labelledby="new-h">
        <h2 id="new-h" className="text-xl font-bold">Submit a project</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Only projects approved by an admin count towards your badges. Pending and rejected work does not.</p>
        <ProjectForm tasks={taskList} />
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
                  <p className="text-xs text-muted-foreground">Submitted {new Date(s.submitted_at).toLocaleDateString("en-GB")}{s.resubmit_count ? ` · resubmitted ${s.resubmit_count}×` : ""}</p>
                  {s.feedback && <p className="mt-2 rounded-lg bg-secondary p-2 text-sm"><span className="font-medium">Admin feedback:</span> {s.feedback}</p>}
                </div>
                <StatusPill status={s.status} />
                {s.status === "rejected" && (
                  <ResubmitButton
                    tasks={taskList}
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
