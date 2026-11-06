"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { sendExchangeMessageAction } from "@/app/actions/exchange";
import { formatPkt } from "@/lib/time";
import type { ExchangeMessageRow } from "@/lib/workflow-types";

/** Pseudonymous live chat for one active connection. Only ever shows "Me" / a fixed counterpart label, never a real name. */
export function ExchangeChat({
  connectionId,
  myStudentId,
  initialMessages,
  counterpartLabel,
  canSend,
}: {
  connectionId: string;
  myStudentId: string;
  initialMessages: ExchangeMessageRow[];
  counterpartLabel: string;
  canSend: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`exchange-connection-${connectionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "exchange_messages", filter: `connection_id=eq.${connectionId}` },
        (payload) => setMessages((prev) => (prev.some((m) => m.id === (payload.new as ExchangeMessageRow).id) ? prev : [...prev, payload.new as ExchangeMessageRow])),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [connectionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const res = await sendExchangeMessageAction({ connectionId, body: text });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setBody("");
  }

  return (
    <div className="flex h-80 flex-col rounded-xl border border-border bg-background">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && <p className="text-center text-xs text-muted-foreground">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.sender_student_id === myStudentId;
          return (
            <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div className={mine ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground" : "max-w-[80%] rounded-2xl rounded-bl-sm bg-secondary px-3 py-2"}>
                {!mine && <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{counterpartLabel}</p>}
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                <p className="mt-0.5 text-[10px] opacity-60">{formatPkt(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {canSend ? (
        <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-2">
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message..." maxLength={4000} disabled={busy} aria-label="Message" />
          <Button type="submit" size="sm" disabled={busy || !body.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      ) : (
        <p className="border-t border-border p-2 text-center text-xs text-muted-foreground">This conversation has ended.</p>
      )}
      {error && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
