"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/field";
import { ListingForm } from "@/components/student/exchange/ListingForm";
import { BrowseGrid } from "@/components/student/exchange/BrowseGrid";
import { ExchangeChat } from "@/components/student/exchange/ExchangeChat";
import { cancelConnectionAction } from "@/app/actions/exchange";
import { formatPkt } from "@/lib/time";
import { createClient } from "@/lib/supabase/client";
import type { ExchangeConnectionRow, ExchangeListingRow, ExchangeMessageRow, ExchangeRole, ExchangeRow } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";

function ConnectionThread({ connection, label, myStudentId, canSend }: { connection: ExchangeConnectionRow; label: string; myStudentId: string; canSend: boolean }) {
  const [messages, setMessages] = useState<ExchangeMessageRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("exchange_messages")
      .select("*")
      .eq("connection_id", connection.id)
      .order("created_at")
      .then(({ data }) => { if (!cancelled) { setMessages((data ?? []) as ExchangeMessageRow[]); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [connection.id]);

  if (!loaded) return <div className="h-80 animate-pulse rounded-xl bg-secondary/50" />;
  return <ExchangeChat connectionId={connection.id} myStudentId={myStudentId} initialMessages={messages} counterpartLabel={label} canSend={canSend} />;
}

function PendingCard({ connection, label }: { connection: ExchangeConnectionRow; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm font-medium">Waiting for admin approval to connect with {label}</p>
      <p className="text-xs text-muted-foreground">Requested {formatPkt(connection.requested_at)}</p>
      <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={async () => {
        setBusy(true);
        const res = await cancelConnectionAction(connection.id);
        setBusy(false);
        if (!res.ok) return toast.error(res.error);
        router.refresh();
      }}>Cancel request</Button>
    </div>
  );
}

export function ExchangeWorkspace({
  myStudentId, exchange, roles, connections, myListing, browseListings, counterpartNames,
}: {
  myStudentId: string; exchange: ExchangeRow; roles: ExchangeRole[]; connections: ExchangeConnectionRow[];
  myListing: ExchangeListingRow | null; browseListings: ExchangeListingRow[]; counterpartNames: Record<string, string>;
}) {
  const isProvider = roles.includes("provider");
  const isAcceptor = roles.includes("acceptor");
  const isOpen = exchange.status === "open" && (!exchange.opens_at || new Date(exchange.opens_at) <= new Date()) && (!exchange.closes_at || new Date(exchange.closes_at) > new Date());

  const asAcceptor = useMemo(() => connections.filter((c) => c.acceptor_student_id === myStudentId), [connections, myStudentId]);
  const asProvider = useMemo(() => connections.filter((c) => c.provider_student_id === myStudentId), [connections, myStudentId]);
  const activeOrPendingAsAcceptor = asAcceptor.filter((c) => c.status === "active" || c.status === "pending");
  const activeAsProvider = asProvider.filter((c) => c.status === "active");
  const cap = exchange.max_connections_per_acceptor;
  const canConnectMore = isOpen && (cap === null || activeOrPendingAsAcceptor.length < cap);
  const listingName = (listingId: string | null) => browseListings.find((l) => l.id === listingId)?.project_name ?? "your project";
  const counterpartLabel = (c: ExchangeConnectionRow, perspective: "acceptor" | "provider") => {
    const otherId = perspective === "acceptor" ? c.provider_student_id : c.acceptor_student_id;
    if (!exchange.is_anonymous && counterpartNames[otherId]) return counterpartNames[otherId];
    return perspective === "acceptor" ? `Provider — ${listingName(c.listing_id)}` : "Acceptor";
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{exchange.title}</h1>
        {exchange.description && <p className="mt-1 text-sm text-muted-foreground">{exchange.description}</p>}
        {!isOpen && <p className={cn("mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold", exchange.status === "closed" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "border-border bg-secondary")}>
          {exchange.status === "closed" ? "This exchange is closed" : "Not open yet"}
        </p>}
      </header>

      {isProvider && (
        <section aria-labelledby="listing-h" className="space-y-3">
          <h2 id="listing-h" className="text-lg font-bold">Your listing</h2>
          <ListingForm exchangeId={exchange.id} listing={myListing} />
          {activeAsProvider.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Active conversations ({activeAsProvider.length})</h3>
              {activeAsProvider.map((c) => <ConnectionThread key={c.id} connection={c} label={counterpartLabel(c, "provider")} myStudentId={myStudentId} canSend={isOpen} />)}
            </div>
          )}
        </section>
      )}

      {isAcceptor && (
        <section aria-labelledby="browse-h" className="space-y-3">
          <h2 id="browse-h" className="text-lg font-bold">Your connections</h2>
          {activeOrPendingAsAcceptor.length === 0 && <p className="text-sm text-muted-foreground">You haven&apos;t connected with anyone yet — browse listings below.</p>}
          {activeOrPendingAsAcceptor.map((c) =>
            c.status === "pending"
              ? <PendingCard key={c.id} connection={c} label={counterpartLabel(c, "acceptor")} />
              : <ConnectionThread key={c.id} connection={c} label={counterpartLabel(c, "acceptor")} myStudentId={myStudentId} canSend={isOpen} />,
          )}

          <h2 className="pt-2 text-lg font-bold">Browse providers</h2>
          {isOpen ? (
            <BrowseGrid listings={browseListings} connectedProviderIds={new Set(activeOrPendingAsAcceptor.map((c) => c.provider_student_id))} canConnect={canConnectMore} />
          ) : (
            <EmptyState title="Browsing isn't open right now" />
          )}
        </section>
      )}
    </div>
  );
}
