import Link from "next/link";
import { requireStudentPage } from "@/lib/student-session";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/field";
import type { ExchangeParticipantRow, ExchangeRow } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Class exchange" };

const STATUS_STYLE: Record<ExchangeRow["status"], string> = {
  draft: "bg-secondary text-secondary-foreground border-border",
  open: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  closed: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

export default async function ExchangeListPage() {
  const { student } = await requireStudentPage();
  const sb = await createClient();
  const { data: mine } = await sb.from("exchange_participants").select("*").eq("student_id", student.id);
  const participation = (mine ?? []) as ExchangeParticipantRow[];
  const ids = [...new Set(participation.map((p) => p.exchange_id))];
  const { data: exchanges } = ids.length ? await sb.from("exchanges").select("*").in("id", ids).order("created_at", { ascending: false }) : { data: [] };
  const rows = (exchanges ?? []) as ExchangeRow[];
  const roleOf = (exchangeId: string) => participation.filter((p) => p.exchange_id === exchangeId).map((p) => p.role);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Class exchange</h1>
        <p className="mt-1 text-sm text-muted-foreground">Portals your admin has added you to, for handing work off between classes or batches.</p>
      </header>
      {rows.length === 0 ? (
        <EmptyState title="You're not part of an exchange yet">When your admin adds you to one, it will show up here.</EmptyState>
      ) : rows.filter((x) => x.status !== "draft").length === 0 ? (
        <EmptyState title="Not open yet">Your admin is still setting this up. Check back soon.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.filter((x) => x.status !== "draft").map((x) => (
            <li key={x.id}>
              <Link href={`/dashboard/exchange/${x.id}`} className="block rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) transition-colors hover:border-primary/40">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{x.title}</p>
                  <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", STATUS_STYLE[x.status])}>{x.status}</span>
                </div>
                {x.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{x.description}</p>}
                <p className="mt-2 text-xs font-medium capitalize text-primary">{roleOf(x.id).join(" & ")}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
