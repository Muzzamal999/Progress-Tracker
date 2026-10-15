import { createClient } from "@/lib/supabase/server";
import { AcademicsManager } from "@/components/admin/workflow/AcademicsManager";
import type { BatchRow, ClassRow, TaskRow } from "@/lib/workflow-types";

export const metadata = { title: "Classes, batches & tasks" };

export default async function AcademicsPage() {
  const supabase = await createClient();
  const [c, b, t] = await Promise.all([
    supabase.from("classes").select("*").order("created_at"),
    supabase.from("batches").select("*").order("created_at"),
    supabase.from("tasks").select("*").order("created_at", { ascending: false }),
  ]);
  if (c.error || b.error || t.error) throw new Error((c.error ?? b.error ?? t.error)!.message);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold">Classes, batches &amp; tasks</h1>
        <p className="mt-1 text-muted-foreground">Set up where students enrol and what they work on. Start with a class, then a batch.</p>
      </header>
      <AcademicsManager classes={c.data as ClassRow[]} batches={b.data as BatchRow[]} tasks={t.data as TaskRow[]} />
    </div>
  );
}
