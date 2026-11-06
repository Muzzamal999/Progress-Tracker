import { createClient } from "@/lib/supabase/server";
import { ExchangeListManager } from "@/components/admin/workflow/ExchangeListManager";
import type { ExchangeRow } from "@/lib/workflow-types";

export const metadata = { title: "Class exchange" };

export default async function ExchangesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("exchanges").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Class exchange</h1>
        <p className="mt-1 text-muted-foreground">Connect one group of students to another so they can hand off work — anonymously if you choose — without exposing their identities until you decide to.</p>
      </header>
      <ExchangeListManager exchanges={(data ?? []) as ExchangeRow[]} />
    </div>
  );
}
