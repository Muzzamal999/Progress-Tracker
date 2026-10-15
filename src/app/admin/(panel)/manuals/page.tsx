import { createClient } from "@/lib/supabase/server";
import { ManualsManager } from "@/components/admin/workflow/ManualsManager";
import type { BatchRow, ClassRow, ManualRow } from "@/lib/workflow-types";

export const metadata = { title: "Lab manuals" };

export default async function ManualsPage() {
  const supabase = await createClient();
  const [c, b, m] = await Promise.all([
    supabase.from("classes").select("*").order("name"),
    supabase.from("batches").select("*").order("name"),
    supabase.from("lab_manuals").select("*").order("created_at", { ascending: false }),
  ]);
  if (c.error || b.error || m.error) throw new Error((c.error ?? b.error ?? m.error)!.message);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold">Lab manuals</h1>
        <p className="mt-1 text-muted-foreground">Publish instructions with images for a class or a single batch.</p>
      </header>
      <ManualsManager classes={c.data as ClassRow[]} batches={b.data as BatchRow[]} manuals={m.data as ManualRow[]} />
    </div>
  );
}
