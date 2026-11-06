"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, EmptyState } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { saveExchangeAction } from "@/app/actions/admin-exchange";
import type { ExchangeRow } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<ExchangeRow["status"], string> = {
  draft: "bg-secondary text-secondary-foreground border-border",
  open: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  closed: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

export function ExchangeListManager({ exchanges }: { exchanges: ExchangeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(exchanges.length === 0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    const res = await saveExchangeAction({
      title: f.get("title"), description: f.get("description"), status: "draft", isAnonymous: true, requiresApproval: false,
      maxPerAcceptor: 1, maxPerProvider: null, opensDate: "", opensTime: "", closesDate: "", closesTime: "",
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Exchange created as a draft — open it to add participants and tune the rules");
    form.reset();
    setOpen(false);
    router.push(`/admin/exchanges/${res.data.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setOpen((v) => !v)}><Plus /> New exchange</Button>
      </div>
      {open && (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2" noValidate>
          <Field id="title" label="Title" className="sm:col-span-2"><Input id="title" name="title" required maxLength={160} placeholder="e.g. Architecture → Build hand-off" /></Field>
          <Field id="description" label="Description (optional)" className="sm:col-span-2"><Textarea id="description" name="description" maxLength={2000} className="min-h-20" /></Field>
          {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Creating..." : "Create as draft"}</Button></div>
        </form>
      )}
      {exchanges.length === 0 ? (
        <EmptyState title="No exchanges yet">Create one to connect two classes or batches — for example, one class designs an architecture and another builds against it, without either side knowing who they are paired with.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {exchanges.map((x) => (
            <li key={x.id}>
              <Link href={`/admin/exchanges/${x.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) transition-colors hover:border-primary/40">
                <div className="min-w-0">
                  <p className="font-semibold">{x.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{x.is_anonymous ? "Anonymous" : "Identities visible"} · {x.requires_approval ? "Approval required" : "Instant connect"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", STATUS_STYLE[x.status])}>{x.status}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
