import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Download, ExternalLink, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/Badge";
import { StudentAvatar } from "@/components/StudentAvatar";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusPill } from "@/components/ui/field";
import { loadOrg } from "@/lib/reports/load";
import { taskBuckets, type RosterStudent, type SubRow, type TaskInfo } from "@/lib/reports/model";
import { addDays, formatPkt, formatShortDate, pktDate, pktDayRange } from "@/lib/time";
import type { BadgeLevel } from "@/lib/types";
import type { BadgeProgress, CertificateRow, ReportRow, SubmissionRow } from "@/lib/workflow-types";
import { CertificateActions } from "@/components/admin/workflow/CertificateActions";
import { IssueCompletionCertificateButton } from "@/components/admin/workflow/IssueCompletionCertificateButton";

export const metadata = { title: "Student profile" };

interface Profile {
  id: string; slug: string; name: string; track: string; badge: BadgeLevel | null; bio: string | null; skills: string[]; image_url: string | null;
  user_id: string | null; profile_completed_at: string | null; batch_id: string | null; created_at: string;
  batches: { name: string; starts_on: string | null; ends_on: string | null; class_id: string; classes: { name: string } | { name: string }[] | null } | null;
  student_private: { email: string | null } | { email: string | null }[] | null;
}

const pdfHref = (q: Record<string, string>) => `/api/admin/reports/pdf?${new URLSearchParams(q)}`;

export default async function StudentProfilePage({ params }: PageProps<"/admin/students/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sb = await createClient();
  const { data } = await sb
    .from("students")
    .select("id, slug, name, track, badge, bio, skills, image_url, user_id, profile_completed_at, batch_id, created_at, batches(name, starts_on, ends_on, class_id, classes(name)), student_private(email)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const s = data as unknown as Profile;
  const cls = Array.isArray(s.batches?.classes) ? s.batches?.classes[0]?.name : s.batches?.classes?.name;
  const email = (Array.isArray(s.student_private) ? s.student_private[0] : s.student_private)?.email ?? null;

  const classId = s.batches?.class_id ?? null;
  const [{ data: progress }, { data: subs }, { data: reps }, { data: tasks }, org, { data: certs }] = await Promise.all([
    sb.rpc("admin_student_progress", { p_student: id }),
    sb.from("submissions").select("*").eq("student_id", id).order("submitted_at", { ascending: false }),
    sb.from("daily_reports").select("*").eq("student_id", id).order("report_date", { ascending: false }).limit(60),
    classId ? sb.from("tasks").select("id, class_id, batch_id, title, is_active").eq("class_id", classId) : Promise.resolve({ data: [] as TaskInfo[] }),
    loadOrg(sb),
    sb.from("certificates").select("*").eq("student_id", id).order("issued_at", { ascending: false }),
  ]);
  const ladder = (progress ?? []) as BadgeProgress[];
  const projects = (subs ?? []) as SubmissionRow[];
  const reports = (reps ?? []) as ReportRow[];
  const certificates = (certs ?? []) as CertificateRow[];
  const liveCompletionCert = certificates.find((c) => c.certificate_type === "completion" && c.batch_id === s.batch_id && !c.revoked_at);
  const count = (st: string) => projects.filter((p) => p.status === st).length;
  const active = ladder.find((b) => b.state === "active");
  const completed = ladder.filter((b) => b.state === "completed");
  const required = ladder.reduce((n, b) => n + b.required, 0);
  const counted = ladder.reduce((n, b) => n + b.counted, 0);
  const overall = required ? Math.round((100 * counted) / required) : 0;

  const roster: RosterStudent = {
    id: s.id, code: "", name: s.name, email, user_id: s.user_id, profile_completed_at: s.profile_completed_at, badge: s.badge,
    class_id: classId, class_name: cls ?? null, batch_id: s.batch_id, batch_name: s.batches?.name ?? null,
    batch_starts_on: s.batches?.starts_on ?? null, batch_ends_on: s.batches?.ends_on ?? null, enrolled_active: true,
  };
  const subRows: SubRow[] = projects.map((p) => ({ id: p.id, student_id: id, task_id: p.task_id, title: p.title, description: p.description, type: p.type, status: p.status, submitted_at: p.submitted_at, reviewed_at: p.reviewed_at, feedback: p.feedback, has_lab_report: !!p.lab_report }));
  const buckets = taskBuckets(roster, (tasks ?? []) as TaskInfo[], subRows, pktDayRange(pktDate()).end);
  const today = pktDate();
  const isAccount = !!s.user_id;

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" size="sm"><Link href="/admin"><ArrowLeft /> All students</Link></Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <StudentAvatar name={s.name} imageUrl={s.image_url} size={72} />
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold">{s.name}</h1>
            <p className="text-muted-foreground">{email ?? "No email on file"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge level={s.badge} size="sm" />
              <span className="rounded-full bg-secondary px-2.5 py-0.5">{s.track}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={`/admin/students/${s.id}/edit`}><Pencil /> Edit</Link></Button>
          <Button asChild variant="outline"><Link href={`/student/${s.slug}`}><ExternalLink /> Public page</Link></Button>
        </div>
      </header>

      <section aria-labelledby="info-h" className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
          <h2 id="info-h" className="mb-3 text-lg font-bold">Basic information</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Class</dt><dd>{cls ?? "Not enrolled"}</dd>
            <dt className="text-muted-foreground">Batch</dt><dd>{s.batches?.name ?? "Not enrolled"}{s.batches?.starts_on ? ` (${formatShortDate(s.batches.starts_on)}${s.batches.ends_on ? ` to ${formatShortDate(s.batches.ends_on)}` : ""})` : ""}</dd>
            <dt className="text-muted-foreground">Account</dt><dd>{isAccount ? "Registered student" : "Imported record (no login)"}</dd>
            <dt className="text-muted-foreground">Profile completed</dt><dd>{s.profile_completed_at ? formatPkt(s.profile_completed_at) : "Not yet"}</dd>
            <dt className="text-muted-foreground">Joined</dt><dd>{formatPkt(s.created_at)}</dd>
            {s.skills.length > 0 && (<><dt className="text-muted-foreground">Skills</dt><dd>{s.skills.join(", ")}</dd></>)}
            {s.bio && (<><dt className="text-muted-foreground">Bio</dt><dd className="whitespace-pre-wrap">{s.bio}</dd></>)}
          </dl>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)" aria-labelledby="prog-h">
          <h2 id="prog-h" className="mb-3 text-lg font-bold">Badge and progress</h2>
          <dl className="mb-4 grid grid-cols-3 gap-3 text-center">
            {[["Approved", count("approved")], ["Pending", count("pending")], ["Rejected", count("rejected")]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-secondary p-3"><dd className="text-2xl font-extrabold">{v}</dd><dt className="text-xs text-muted-foreground">{l}</dt></div>
            ))}
          </dl>
          <p className="text-sm">Current badge: <strong>{completed.at(-1)?.name ?? "none yet"}</strong>{active ? <> · next <strong>{active.name}</strong> ({active.counted}/{active.required} approved)</> : null}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overall} aria-label="Overall badge ladder progress">
            <div className="h-full rounded-full bg-accent-gradient" style={{ width: `${overall}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{overall}% of the badge ladder · only approved projects count; pending and rejected work does not.</p>
        </div>
      </section>

      {isAccount && (
        <section aria-labelledby="dl-h" className="flex flex-wrap items-center gap-2">
          <h2 id="dl-h" className="mr-2 text-lg font-bold">PDF reports</h2>
          <Button asChild variant="outline" size="sm"><a href={pdfHref({ type: "daily", scope: "student", id: s.id, date: today })}><Download /> Today&apos;s daily report</a></Button>
          <Button asChild variant="outline" size="sm"><a href={pdfHref({ type: "range", scope: "student", id: s.id, from: addDays(today, -29), to: today })}><Download /> Last 30 days progress</a></Button>
          {org.org_name && <span className="text-xs text-muted-foreground">Issued by {org.org_name}</span>}
        </section>
      )}

      <section aria-labelledby="cert-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cert-h" className="text-lg font-bold">Certificates ({certificates.length})</h2>
          {s.batch_id && (
            <IssueCompletionCertificateButton studentId={s.id} batchId={s.batch_id} batchName={s.batches?.name ?? "this program"} alreadyIssued={!!liveCompletionCert} />
          )}
        </div>
        {certificates.length === 0 ? <EmptyState title="No certificates issued yet" /> : (
          <ul className="space-y-2">
            {certificates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.certificate_type === "completion" ? c.batch_name : c.badge_name}
                    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">{c.certificate_type}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{c.certificate_number} · Issued {formatPkt(c.issued_at)}{c.revoked_at ? ` · Revoked: ${c.revoke_reason}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  {!c.revoked_at && <a className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-secondary" href={`/api/certificates/${c.certificate_number}/pdf`}>PDF</a>}
                  <CertificateActions id={c.id} revoked={!!c.revoked_at} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="proj-h" className="space-y-3">
        <h2 id="proj-h" className="text-xl font-bold">Project history ({projects.length})</h2>
        {projects.length === 0 ? <EmptyState title="No projects submitted yet" /> : (
          <div className="relative overflow-x-auto rounded-2xl border border-border bg-card shadow-(--shadow-card)">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Project submissions</caption>
              <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="p-3 font-medium">Project</th><th scope="col" className="p-3 font-medium">Type</th><th scope="col" className="p-3 font-medium">Submitted</th><th scope="col" className="p-3 font-medium">Reviewed</th><th scope="col" className="p-3 font-medium">Status</th></tr></thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-border/40 last:border-0">
                    <td className="p-3"><Link href={`/admin/projects/${p.id}`} className="font-medium hover:underline">{p.title}</Link></td>
                    <td className="p-3 capitalize">{p.type}</td>
                    <td className="whitespace-nowrap p-3">{formatPkt(p.submitted_at)}</td>
                    <td className="whitespace-nowrap p-3">{p.reviewed_at ? formatPkt(p.reviewed_at) : "-"}</td>
                    <td className="p-3"><StatusPill status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="task-h" className="space-y-3">
        <h2 id="task-h" className="text-xl font-bold">Task completion</h2>
        {buckets.completed.length + buckets.awaiting.length + buckets.pending.length === 0 ? <EmptyState title="No tasks are assigned to this student" /> : (
          <div className="grid gap-3 md:grid-cols-3">
            {([["Completed (approved)", buckets.completed], ["Awaiting review", buckets.awaiting], ["Pending", buckets.pending]] as const).map(([label, list]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
                <h3 className="text-sm font-semibold">{label} ({list.length})</h3>
                {list.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">None</p> : <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">{list.map((t) => <li key={t.id}>{t.title}</li>)}</ul>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="rep-h" className="space-y-3">
        <h2 id="rep-h" className="text-xl font-bold">Daily report history ({reports.length}{reports.length === 60 ? "+" : ""})</h2>
        {reports.length === 0 ? <EmptyState title="No daily reports yet" /> : (
          <div className="relative overflow-x-auto rounded-2xl border border-border bg-card shadow-(--shadow-card)">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Daily reports</caption>
              <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="p-3 font-medium">Date</th><th scope="col" className="p-3 font-medium">Summary</th><th scope="col" className="p-3 font-medium">Submitted</th><th scope="col" className="p-3 font-medium">Status</th><th scope="col" className="p-3 font-medium"><span className="sr-only">PDF</span></th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 align-top last:border-0">
                    <td className="whitespace-nowrap p-3 font-medium">{formatShortDate(r.report_date)}</td>
                    <td className="max-w-md p-3"><p className="line-clamp-2 whitespace-pre-wrap">{r.summary}</p></td>
                    <td className="whitespace-nowrap p-3">{formatPkt(r.submitted_at)}</td>
                    <td className="p-3"><StatusPill status={r.status} /></td>
                    <td className="p-3"><a className="inline-flex items-center gap-1 text-primary hover:underline" href={pdfHref({ type: "daily", scope: "student", id: s.id, date: r.report_date })}><Download className="h-3.5 w-3.5" aria-hidden="true" /> PDF</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
