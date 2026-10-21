import Link from "next/link";
import { CalendarClock, CalendarX, CheckCircle2, ClipboardCheck, FileText, FolderGit2, Unlock, UserCheck, UserX, XCircle } from "lucide-react";
import { KIND_LABEL, type DeadlineRule } from "@/lib/deadlines";
import { formatPkt, formatLongDate } from "@/lib/time";
import type { DashboardData } from "@/lib/admin-queries";
import { cn } from "@/lib/utils";

function Card({ label, value, hint, href, icon: Icon, tone }: { label: string; value: number | string; hint?: string; href: string; icon: typeof FileText; tone?: "good" | "warn" | "bad" }) {
  return (
    <Link href={href} className="group rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <dd className={cn("text-2xl font-extrabold sm:text-3xl", tone === "good" && "text-green-600 dark:text-green-400", tone === "warn" && "text-amber-600 dark:text-amber-400", tone === "bad" && "text-red-600 dark:text-red-400")}>{value}</dd>
        <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
      </div>
      <dt className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">{label}</dt>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Link>
  );
}

function RuleList({ title, rules, empty, when }: { title: string; rules: DeadlineRule[]; empty: string; when: (r: DeadlineRule) => string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rules.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rules.slice(0, 5).map((r) => (
            <li key={r.id} className="text-sm">
              <Link href="/admin/deadlines" className="font-medium hover:underline">{r.title || KIND_LABEL[r.kind]}</Link>
              <p className="text-xs text-muted-foreground">{KIND_LABEL[r.kind]} · {when(r)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Admin dashboard summary: today's activity (Karachi day) and the state of the submission windows. */
export function DashboardCards({ d }: { d: DashboardData }) {
  return (
    <section aria-labelledby="today-h" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-h" className="text-xl font-bold">Today</h2>
        <p className="text-sm text-muted-foreground">{formatLongDate(d.today)} · Asia/Karachi</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 sm:gap-4">
        <Card label="Active students" value={d.activeStudents} href="/admin" icon={UserCheck} />
        <Card label="Daily reports submitted today" value={d.reportsToday} hint={`${d.expectedToday} expected`} href={`/admin/reports?date=${d.today}&status=submitted`} icon={FileText} tone="good" />
        <Card label="Not submitted today" value={d.notSubmittedToday} hint="Expected but missing" href={`/admin/reports?date=${d.today}&status=missing`} icon={UserX} tone={d.notSubmittedToday ? "bad" : undefined} />
        <Card label="Projects submitted today" value={d.projectsToday} href="/admin/projects" icon={FolderGit2} />
        <Card label="Awaiting review" value={d.awaitingReview} href="/admin/projects?status=pending" icon={ClipboardCheck} tone={d.awaitingReview ? "warn" : undefined} />
        <Card label="Approved today" value={d.approvedToday} href="/admin/projects?status=approved" icon={CheckCircle2} tone="good" />
        <Card label="Rejected today" value={d.rejectedToday} href="/admin/projects?status=rejected" icon={XCircle} />
        <Card label="Open submission windows" value={d.openWindows.length} href="/admin/deadlines?status=open" icon={Unlock} tone="good" />
        <Card label="Upcoming deadlines" value={d.upcoming.length} href="/admin/deadlines?status=scheduled" icon={CalendarClock} />
        <Card label="Recently expired (7 days)" value={d.recentlyExpired.length} href="/admin/deadlines?status=closed" icon={CalendarX} />
      </dl>
      <div className="grid gap-4 md:grid-cols-3">
        <RuleList title="Open now" rules={d.openWindows} empty="No submission window is open." when={(r) => `closes ${formatPkt(r.closes_at)}`} />
        <RuleList title="Upcoming" rules={d.upcoming} empty="Nothing scheduled." when={(r) => `opens ${formatPkt(r.opens_at)}`} />
        <RuleList title="Recently expired" rules={d.recentlyExpired} empty="Nothing expired this week." when={(r) => `closed ${formatPkt(r.closes_at)}`} />
      </div>
    </section>
  );
}
