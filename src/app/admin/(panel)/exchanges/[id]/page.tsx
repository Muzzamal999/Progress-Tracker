import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listRoster } from "@/lib/admin-queries";
import { Button } from "@/components/ui/button";
import { ExchangeDetailManager } from "@/components/admin/workflow/ExchangeDetailManager";
import type { ExchangeConnectionRow, ExchangeListingRow, ExchangeParticipantRow, ExchangeRow } from "@/lib/workflow-types";

export const metadata = { title: "Exchange" };

export default async function ExchangeDetailPage({ params }: PageProps<"/admin/exchanges/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sb = await createClient();
  const [{ data: exchange }, { data: participants }, { data: listings }, { data: connections }, roster] = await Promise.all([
    sb.from("exchanges").select("*").eq("id", id).maybeSingle(),
    sb.from("exchange_participants").select("*").eq("exchange_id", id),
    sb.from("exchange_listings").select("*").eq("exchange_id", id),
    sb.from("exchange_connections").select("*").eq("exchange_id", id).order("requested_at", { ascending: false }),
    listRoster(sb),
  ]);
  if (!exchange) notFound();

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/exchanges"><ArrowLeft /> All exchanges</Link></Button>
      <ExchangeDetailManager
        exchange={exchange as ExchangeRow}
        participants={(participants ?? []) as ExchangeParticipantRow[]}
        listings={(listings ?? []) as ExchangeListingRow[]}
        connections={(connections ?? []) as ExchangeConnectionRow[]}
        roster={roster.filter((r) => r.user_id).map((r) => ({ id: r.id, name: r.name, className: r.class_name, batchName: r.batch_name, classId: r.class_id, batchId: r.batch_id }))}
      />
    </div>
  );
}
