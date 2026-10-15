import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudentPage } from "@/lib/student-session";
import { BadgeMedal } from "@/components/BadgeMedal";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusPill } from "@/components/ui/field";
import type { BadgeProgress, CertificateRow, SubmissionRow } from "@/lib/workflow-types";

export default async function DashboardPage() {
  const { student } = await requireStudentPage();
  const supabase = await createClient();
  const [progressRes, subsRes, certsRes, reportsRes] = await Promise.all([
    supabase.rpc("my_progress"),
    supabase.from("submissions").select("id, title, status, feedback, submitted_at").order("submitted_at", { ascending: false }),
    supabase.from("certificates").select("*").is("revoked_at", null).order("issued_at", { ascending: false }),
    supabase.from("daily_reports").select("id", { count: "exact", head: true }),
  ]);
  const progress = (progressRes.data ?? []) as BadgeProgress[];
  const subs = (subsRes.data ?? []) as Pick<SubmissionRow, "id" | "title" | "status" | "feedback" | "submitted_at">[];
  const certs = (certsRes.data ?? []) as CertificateRow[];
  const count = (s: string) => subs.filter((x) => x.status === s).length;
  const profileDone = !!student.profile_completed_at;
  const active = progress.find((b) => b.state === "active");

  return (
    <div className="space-y-8">
      {!profileDone && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div>
            <p className="font-semibold">Complete your profile to get started</p>
            <p className="text-sm text-muted-foreground">Choose your track and batch. Your first badge unlocks once you are enrolled.</p>
          </div>
          <Button asChild><Link href="/dashboard/profile">Complete profile</Link></Button>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          { label: "Verified projects", value: count("approved") },
          { label: "Pending review", value: count("pending") },
          { label: "Needs changes", value: count("rejected") },
          { label: "Daily reports", value: reportsRes.count ?? 0 },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5">
            <dd className="text-2xl font-extrabold sm:text-3xl">{t.value}</dd>
            <dt className="text-xs text-muted-foreground sm:text-sm">{t.label}</dt>
          </div>
        ))}
      </dl>

      <section aria-labelledby="badges-h">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="badges-h" className="text-xl font-bold">Your badges</h2>
          {active && <p className="text-sm text-muted-foreground">Next: <strong className="text-foreground">{active.name}</strong> ({active.counted}/{active.required} approved projects)</p>}
        </div>
        {progress.length === 0 ? (
          <EmptyState title="No badges have been configured yet">Your administrator has not set up the badge ladder. Check back soon.</EmptyState>
        ) : (
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {progress.map((b) => (
              <li key={b.badge_id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
                <BadgeMedal badge={b} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{b.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {b.state === "completed" ? "Unlocked" : b.state === "active" ? "In progress" : "Locked"} · {b.counted}/{b.required} approved
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={b.percent} aria-label={`${b.name} progress`}>
                    <div className="h-full rounded-full bg-accent-gradient transition-all" style={{ width: `${b.percent}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{b.percent}%{b.certificate_eligible ? " · certificate on completion" : ""}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="certs-h">
        <h2 id="certs-h" className="mb-4 text-xl font-bold">Certificates</h2>
        {certs.length === 0 ? (
          <EmptyState title="No certificates yet">Complete a certificate-eligible badge and your downloadable certificate appears here.</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {certs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
                <div className="min-w-0">
                  <p className="font-semibold">{c.badge_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.certificate_number}</p>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline"><Link href={`/verify/${c.certificate_number}`}><ExternalLink /> Verify</Link></Button>
                  <Button asChild size="sm"><a href={`/api/certificates/${c.certificate_number}/pdf`}><Download /> PDF</a></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-h">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-h" className="text-xl font-bold">Recent submissions</h2>
          {profileDone && <Button asChild size="sm"><Link href="/dashboard/projects">Submit a project</Link></Button>}
        </div>
        {subs.length === 0 ? (
          <EmptyState title="You have not submitted any projects yet">
            {profileDone ? "Submit your first project with screenshots as evidence. Once an admin approves it, your first badge starts filling." : "Finish your profile, then submit your first project."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-(--shadow-card)">
            {subs.slice(0, 6).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.title}</p>
                  {s.status === "rejected" && s.feedback && <p className="text-sm text-muted-foreground">Feedback: {s.feedback}</p>}
                </div>
                <StatusPill status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
