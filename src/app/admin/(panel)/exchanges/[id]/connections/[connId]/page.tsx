import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/field";
import { formatPkt } from "@/lib/time";
import type { ExchangeConnectionRow, ExchangeMessageRow } from "@/lib/workflow-types";

export const metadata = { title: "Connection chat" };

export default async function ConnectionChatPage({ params }: PageProps<"/admin/exchanges/[id]/connections/[connId]">) {
  const { id, connId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(connId).success) notFound();
  const sb = await createClient();
  const { data: conn } = await sb.from("exchange_connections").select("*").eq("id", connId).eq("exchange_id", id).maybeSingle();
  if (!conn) notFound();
  const c = conn as ExchangeConnectionRow;
  const [{ data: messages }, { data: provider }, { data: acceptor }, { data: listing }] = await Promise.all([
    sb.from("exchange_messages").select("*").eq("connection_id", connId).order("created_at"),
    sb.from("students").select("name").eq("id", c.provider_student_id).maybeSingle(),
    sb.from("students").select("name").eq("id", c.acceptor_student_id).maybeSingle(),
    c.listing_id ? sb.from("exchange_listings").select("project_name").eq("id", c.listing_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const msgs = (messages ?? []) as ExchangeMessageRow[];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href={`/admin/exchanges/${id}`}><ArrowLeft /> Back to exchange</Link></Button>
      <header>
        <h1 className="text-2xl font-extrabold">{acceptor?.name ?? "Acceptor"} ↔ {provider?.name ?? "Provider"}</h1>
        <p className="text-sm text-muted-foreground">{listing?.project_name ?? "Admin-paired, no listing"} · Status: <span className="capitalize">{c.status}</span></p>
      </header>
      {msgs.length === 0 ? <EmptyState title="No messages yet" /> : (
        <ul className="space-y-3">
          {msgs.map((m) => {
            const fromProvider = m.sender_student_id === c.provider_student_id;
            return (
              <li key={m.id} className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-semibold text-muted-foreground">{fromProvider ? provider?.name ?? "Provider" : acceptor?.name ?? "Acceptor"} · {formatPkt(m.created_at)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
