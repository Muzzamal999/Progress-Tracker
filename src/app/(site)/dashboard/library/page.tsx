import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudentPage } from "@/lib/student-session";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/field";
import type { ManualRow, TaskRow } from "@/lib/workflow-types";

export const metadata = { title: "Tasks & lab manuals" };

export default async function LibraryPage() {
  const { student } = await requireStudentPage();
  if (!student.batch_id) {
    return (
      <EmptyState title="Choose your batch to see tasks and lab manuals">
        <div className="mt-2"><Button asChild><Link href="/dashboard/profile">Complete profile</Link></Button></div>
      </EmptyState>
    );
  }
  const supabase = await createClient();
  const [{ data: tasks }, { data: manuals }] = await Promise.all([
    supabase.from("tasks").select("*").eq("is_active", true).order("due_date", { nullsFirst: false }),
    supabase.from("lab_manuals").select("*").order("created_at", { ascending: false }),
  ]);
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section aria-labelledby="t-h">
        <h2 id="t-h" className="mb-5 text-xl font-bold">Tasks</h2>
        {(tasks ?? []).length === 0 ? (
          <EmptyState title="No tasks assigned yet">Your administrator will post tasks for your batch here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {(tasks as TaskRow[]).map((t) => (
              <li key={t.id} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
                <p className="font-semibold">{t.title}</p>
                {t.due_date && <p className="text-xs text-muted-foreground">Due {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-GB")}</p>}
                {t.description && <p className="mt-2 whitespace-pre-wrap text-sm">{t.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="m-h">
        <h2 id="m-h" className="mb-5 text-xl font-bold">Lab manuals</h2>
        {(manuals ?? []).length === 0 ? (
          <EmptyState title="No lab manuals yet">Manuals for your class will appear here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {(manuals as ManualRow[]).map((m) => (
              <li key={m.id} className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
                <p className="font-semibold">{m.title}</p>
                {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                {m.body && <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>}
                {m.images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.images.map((i) => (
                      <a key={i.public_id} href={i.url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={i.url} alt={`Figure from ${m.title}`} className="h-24 w-32 rounded-lg border border-border object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
