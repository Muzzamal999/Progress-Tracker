import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PdfViewer } from "@/components/PdfViewer";
import { ReviewTimeline } from "@/components/ReviewTimeline";
import { ReviewActions } from "@/components/admin/workflow/ReviewActions";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/field";
import { formatPkt } from "@/lib/time";
import type { ReviewEvent } from "@/lib/review-history";
import type { BadgeProgress, SubmissionRow } from "@/lib/workflow-types";

export const metadata = { title: "Project details" };

interface Detail extends SubmissionRow {
  reviewed_by: string | null;
  students: { id: string; name: string; badge: string | null; batches: { name: string; classes: { name: string } | { name: string }[] | null } | null };
  tasks: { title: string } | null;
}

export default async function ProjectDetailPage({ params }: PageProps<"/admin/projects/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await createClient();
  const { data } = await sb
    .from("submissions")
    .select("*, students(id, name, badge, batches(name, classes(name))), tasks(title)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as unknown as Detail;
  const [{ data: events }, { data: progress }] = await Promise.all([
    sb.from("review_events").select("*").eq("kind", "submission").eq("item_id", id).order("created_at"),
    sb.rpc("admin_student_progress", { p_student: p.student_id }),
  ]);
  const history = (events ?? []) as ReviewEvent[];
  const actorIds = [...new Set([p.reviewed_by, ...history.map((e) => e.actor)].filter((x): x is string => !!x))];
  const actors: Record<string, string> = {};
  if (actorIds.length) {
    const { data: rows } = await sb.rpc("admin_actor_emails", { p_ids: actorIds });
    for (const r of (rows ?? []) as { id: string; email: string }[]) actors[r.id] = r.email;
  }
  const ladder = (progress ?? []) as BadgeProgress[];
  const active = ladder.find((b) => b.state === "active");
  const cls = Array.isArray(p.students.batches?.classes) ? p.students.batches?.classes[0]?.name : p.students.batches?.classes?.name;
  const file = (which: string | number, dl = false) => `/api/submissions/${p.id}/file?which=${which}${dl ? "&download=1" : ""}`;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/projects"><ArrowLeft /> All projects</Link></Button>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            <Link href={`/admin/students/${p.students.id}`} className="font-medium hover:underline">{p.students.name}</Link> · {[cls, p.students.batches?.name].filter(Boolean).join(" / ") || "not enrolled"}
          </p>
          <h1 className="text-3xl font-extrabold">{p.title}</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{p.type} project{p.tasks ? ` · task: ${p.tasks.title}` : ""}</p>
        </div>
        <StatusPill status={p.status} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)" aria-labelledby="desc-h">
            <h2 id="desc-h" className="mb-2 text-lg font-bold">Description</h2>
            <p className="whitespace-pre-wrap text-sm">{p.description || "No description provided."}</p>
            <h3 className="mb-1 mt-4 text-sm font-semibold">Technologies</h3>
            {p.stack.length ? (
              <ul className="flex flex-wrap gap-1.5">{p.stack.map((t) => <li key={t} className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs">{t}</li>)}</ul>
            ) : <p className="text-sm text-muted-foreground">None listed.</p>}
            {p.link && (
              <a href={p.link} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 break-all text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {p.link}
              </a>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)" aria-labelledby="files-h">
            <h2 id="files-h" className="mb-3 text-lg font-bold">Screenshots and files</h2>
            {p.attachments.length === 0 && !p.lab_report ? <p className="text-sm text-muted-foreground">No files were uploaded.</p> : null}
            {p.attachments.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {p.attachments.map((a, i) => (
                  <li key={a.public_id} className="overflow-hidden rounded-xl border border-border bg-background">
                    <a href={file(i)} target="_blank" rel="noopener noreferrer" aria-label={`Preview screenshot ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file(i)} alt={`Screenshot ${i + 1} of ${p.title}`} className="h-32 w-full object-cover" loading="lazy" />
                    </a>
                    <div className="flex items-center justify-between gap-2 p-2 text-xs">
                      <span>Screenshot {i + 1}</span>
                      <a href={file(i, true)} className="inline-flex items-center gap-1 text-primary hover:underline"><Download className="h-3 w-3" aria-hidden="true" /> Download</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {p.lab_report ? (
              <div className="mt-4"><PdfViewer pdf={p.lab_report} label="Lab report (PDF)" openHref={file("lab")} downloadHref={file("lab", true)} /></div>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4" aria-hidden="true" /> No lab report attached (older submission).</p>
            )}
          </section>

          <ReviewTimeline events={history} actors={actors} label="Submission and review history" open />
        </div>

        <aside className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)" aria-labelledby="review-h">
            <h2 id="review-h" className="text-lg font-bold">Review</h2>
            <dl className="space-y-1 text-sm">
              <div><dt className="inline text-muted-foreground">Submitted: </dt><dd className="inline">{formatPkt(p.submitted_at)}</dd></div>
              {p.resubmit_count > 0 && <div><dt className="inline text-muted-foreground">Resubmissions: </dt><dd className="inline">{p.resubmit_count}</dd></div>}
              <div><dt className="inline text-muted-foreground">Reviewed: </dt><dd className="inline">{p.reviewed_at ? formatPkt(p.reviewed_at) : "not yet"}</dd></div>
              {p.reviewed_by && <div><dt className="inline text-muted-foreground">Reviewer: </dt><dd className="inline">{actors[p.reviewed_by] ?? "an administrator"}</dd></div>}
            </dl>
            {p.feedback && <p className="rounded-lg bg-secondary p-2 text-sm"><span className="font-medium">Feedback:</span> {p.feedback}</p>}
            <ReviewActions kind="submission" id={p.id} status={p.status} title={p.title} size="default" />
          </section>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)" aria-labelledby="prog-h">
            <h2 id="prog-h" className="mb-2 text-lg font-bold">Student progress</h2>
            <p className="text-sm">Badge: <strong>{p.students.badge ?? "none yet"}</strong></p>
            {active && <p className="mt-1 text-sm text-muted-foreground">Next: {active.name} ({active.counted}/{active.required} approved projects)</p>}
            <Button asChild variant="outline" size="sm" className="mt-3"><Link href={`/admin/students/${p.students.id}`}>Open student profile</Link></Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
