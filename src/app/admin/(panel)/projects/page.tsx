import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFilterOptions } from "@/lib/admin-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, StatusPill } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/textarea";
import { formatPkt, isDateString, pktDayRange } from "@/lib/time";
import { BADGE_ORDER, PROJECT_TYPES } from "@/lib/types";
import type { ReviewStatus } from "@/lib/workflow-types";

export const metadata = { title: "Project review" };

const PAGE_SIZE = 20;
const STATUSES = ["pending", "approved", "rejected"] as const;
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : "");

interface Row {
  id: string; student_id: string; title: string; type: string; status: ReviewStatus; submitted_at: string; reviewed_at: string | null; resubmit_count: number;
  students: { name: string; badge: string | null; batches: { name: string; classes: { name: string } | { name: string }[] | null } | null };
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as ReviewStatus) : "";
  const type = (PROJECT_TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : "";
  const badge = (BADGE_ORDER as readonly string[]).includes(sp.badge ?? "") ? sp.badge! : "";
  const classId = uuid(sp.classId);
  const batchId = uuid(sp.batchId);
  const studentId = uuid(sp.studentId);
  const date = sp.date && isDateString(sp.date) ? sp.date : "";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const sb = await createClient();
  const options = await getFilterOptions(sb);
  // !inner on the embedded rows turns the embedded filters into real row filters.
  let query = sb
    .from("submissions")
    .select(`id, student_id, title, type, status, submitted_at, reviewed_at, resubmit_count, students!inner(name, badge, batch_id, batches${classId ? "!inner" : ""}(name, class_id, classes(name)))`, { count: "exact" })
    .order("submitted_at", { ascending: status === "pending" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);
  if (studentId) query = query.eq("student_id", studentId);
  if (batchId) query = query.eq("students.batch_id", batchId);
  if (classId) query = query.eq("students.batches.class_id", classId);
  if (badge) query = query.eq("students.badge", badge);
  if (q) query = query.ilike("title", `%${q.replace(/[%_,()]/g, " ")}%`);
  if (date) {
    const { start, end } = pktDayRange(date);
    query = query.gte("submitted_at", start).lt("submitted_at", end);
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ status, type, badge, classId, batchId, studentId, date, q, ...over }).filter(([, v]) => v) as [string, string][]);
    return `/admin/projects?${p}`;
  };
  const className = (r: Row) => {
    const c = r.students.batches?.classes;
    return [Array.isArray(c) ? c[0]?.name : c?.name, r.students.batches?.name].filter(Boolean).join(" / ") || "-";
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Project review</h1>
        <p className="mt-1 text-muted-foreground">Only approved projects count towards badges. Open a project to see its files, history and to approve or reject it.</p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {[{ v: "", l: "All" }, ...STATUSES.map((s) => ({ v: s, l: s[0].toUpperCase() + s.slice(1) }))].map((t) => (
          <Link key={t.v} href={href({ status: t.v, page: "" })} aria-current={status === t.v ? "page" : undefined} className={status === t.v ? "rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" : "rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/70"}>{t.l}</Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="status" value={status} />
            <div><label htmlFor="p-q" className="mb-1 block text-sm font-medium">Project title</label><Input id="p-q" name="q" defaultValue={q} placeholder="Search title..." /></div>
            <div><label htmlFor="p-student" className="mb-1 block text-sm font-medium">Student</label>
              <NativeSelect id="p-student" name="studentId" defaultValue={studentId}><option value="">All students</option>{options.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></div>
            <div><label htmlFor="p-class" className="mb-1 block text-sm font-medium">Class</label>
              <NativeSelect id="p-class" name="classId" defaultValue={classId}><option value="">All classes</option>{options.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></div>
            <div><label htmlFor="p-batch" className="mb-1 block text-sm font-medium">Batch</label>
              <NativeSelect id="p-batch" name="batchId" defaultValue={batchId}><option value="">All batches</option>{options.batches.map((b) => <option key={b.id} value={b.id}>{b.class_name} / {b.name}</option>)}</NativeSelect></div>
            <div><label htmlFor="p-type" className="mb-1 block text-sm font-medium">Project type</label>
              <NativeSelect id="p-type" name="type" defaultValue={type}><option value="">All types</option>{PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</NativeSelect></div>
            <div><label htmlFor="p-badge" className="mb-1 block text-sm font-medium">Student badge</label>
              <NativeSelect id="p-badge" name="badge" defaultValue={badge}><option value="">Any badge</option>{BADGE_ORDER.map((b) => <option key={b} value={b}>{b}</option>)}</NativeSelect></div>
            <div><label htmlFor="p-date" className="mb-1 block text-sm font-medium">Submitted on</label><Input id="p-date" type="date" name="date" defaultValue={date} /></div>
            <div className="flex items-end gap-2"><Button type="submit">Apply filters</Button><Button asChild variant="ghost"><Link href="/admin/projects">Reset</Link></Button></div>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No projects match these filters">{status === "pending" ? "Nothing is waiting for review." : "Try removing a filter."}</EmptyState>
      ) : (
        <>
          <Card className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <caption className="sr-only">Submitted projects</caption>
              <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3 font-medium">Project</th>
                  <th scope="col" className="p-3 font-medium">Student</th>
                  <th scope="col" className="p-3 font-medium">Class / batch</th>
                  <th scope="col" className="p-3 font-medium">Type</th>
                  <th scope="col" className="p-3 font-medium">Submitted</th>
                  <th scope="col" className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 align-top last:border-0">
                    <td className="p-3"><Link href={`/admin/projects/${r.id}`} className="font-medium hover:underline">{r.title}</Link>{r.resubmit_count > 0 && <p className="text-xs text-muted-foreground">Resubmitted {r.resubmit_count}×</p>}</td>
                    <td className="p-3"><Link href={`/admin/students/${r.student_id}`} className="hover:underline">{r.students.name}</Link>{r.students.badge && <p className="text-xs text-muted-foreground">{r.students.badge}</p>}</td>
                    <td className="p-3 text-muted-foreground">{className(r)}</td>
                    <td className="p-3 capitalize">{r.type}</td>
                    <td className="whitespace-nowrap p-3">{formatPkt(r.submitted_at)}</td>
                    <td className="p-3"><StatusPill status={r.status} />{r.reviewed_at && <p className="mt-1 text-xs text-muted-foreground">Reviewed {formatPkt(r.reviewed_at)}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages} · {count} project{count === 1 ? "" : "s"}</span>
            <div className="flex gap-2">
              {page > 1 && <Button asChild variant="outline" size="sm"><Link href={href({ page: String(page - 1) })}>Previous</Link></Button>}
              {page < pages && <Button asChild variant="outline" size="sm"><Link href={href({ page: String(page + 1) })}>Next</Link></Button>}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
