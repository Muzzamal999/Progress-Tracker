"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileText, Trash2, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/textarea";
import {
  deleteExchangeAction, decideConnectionAction, endConnectionAction, forceConnectionAction, saveExchangeAction, setExchangeParticipantsAction, setParticipantRevealAction,
} from "@/app/actions/admin-exchange";
import { formatPkt, toPktInputs } from "@/lib/time";
import type { ActionResult } from "@/app/actions/students";
import type {
  ConnectionStatus, ExchangeConnectionRow, ExchangeListingRow, ExchangeParticipantRow, ExchangeRow, ExchangeStatus,
} from "@/lib/workflow-types";
import { cn } from "@/lib/utils";

interface RosterOption { id: string; name: string; className: string | null; batchName: string | null; classId: string | null; batchId: string | null }

const STATUS_STYLE: Record<ConnectionStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  active: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  ended: "bg-secondary text-secondary-foreground border-border",
};

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<ActionResult>, okMsg?: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (okMsg) toast.success(okMsg);
    router.refresh();
  }
  return { run, busy };
}

function SettingsPanel({ exchange }: { exchange: ExchangeRow }) {
  const { run, busy } = useRun();
  const router = useRouter();
  const o = exchange.opens_at ? toPktInputs(exchange.opens_at) : null;
  const c = exchange.closes_at ? toPktInputs(exchange.closes_at) : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(() => saveExchangeAction({
      id: exchange.id,
      title: f.get("title"), description: f.get("description"), status: f.get("status") as ExchangeStatus,
      isAnonymous: f.get("isAnonymous") === "on", requiresApproval: f.get("requiresApproval") === "on",
      maxPerAcceptor: f.get("maxPerAcceptor") ? Number(f.get("maxPerAcceptor")) : null,
      maxPerProvider: f.get("maxPerProvider") ? Number(f.get("maxPerProvider")) : null,
      opensDate: String(f.get("opensDate") ?? ""),
      opensTime: String(f.get("opensTime") ?? ""),
      closesDate: String(f.get("closesDate") ?? ""),
      closesTime: String(f.get("closesTime") ?? ""),
    }), "Exchange updated");
  }

  return (
    <section aria-labelledby="settings-h" className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
      <h2 id="settings-h" className="text-lg font-bold">Settings</h2>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field id="title" label="Title" className="sm:col-span-2"><Input id="title" name="title" defaultValue={exchange.title} required maxLength={160} /></Field>
        <Field id="description" label="Description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={exchange.description ?? ""} maxLength={2000} className="min-h-20" /></Field>
        <Field id="status" label="Status" hint="Open = acceptors can browse and connect. Closed locks everything in place.">
          <NativeSelect id="status" name="status" defaultValue={exchange.status}>
            <option value="draft">Draft (hidden from students)</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </NativeSelect>
        </Field>
        <div className="space-y-3 self-end">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isAnonymous" defaultChecked={exchange.is_anonymous} className="h-4 w-4 accent-[var(--primary)]" /> Keep identities anonymous to students</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requiresApproval" defaultChecked={exchange.requires_approval} className="h-4 w-4 accent-[var(--primary)]" /> Require my approval before a connection goes live</label>
        </div>
        <Field id="maxPerAcceptor" label="Max connections per acceptor" hint="Blank = unlimited. 1 means once they connect, they're locked to that one provider."><Input id="maxPerAcceptor" name="maxPerAcceptor" type="number" min={1} max={100} defaultValue={exchange.max_connections_per_acceptor ?? ""} /></Field>
        <Field id="maxPerProvider" label="Max connections per provider" hint="Blank = unlimited acceptors can connect to one provider."><Input id="maxPerProvider" name="maxPerProvider" type="number" min={1} max={100} defaultValue={exchange.max_connections_per_provider ?? ""} /></Field>
        <Field id="opensDate" label="Opens" hint="Blank = opens as soon as you set status to Open."><div className="flex gap-2"><Input id="opensDate" name="opensDate" type="date" defaultValue={o?.date ?? ""} /><Input name="opensTime" type="time" defaultValue={o?.time ?? ""} /></div></Field>
        <Field id="closesDate" label="Closes" hint="Blank = stays open until you close it (weeks to months)."><div className="flex gap-2"><Input id="closesDate" name="closesDate" type="date" defaultValue={c?.date ?? ""} /><Input name="closesTime" type="time" defaultValue={c?.time ?? ""} /></div></Field>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save settings"}</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => {
            if (!confirm(`Delete "${exchange.title}"? This removes all listings, connections and messages inside it.`)) return;
            run(() => deleteExchangeAction(exchange.id)).then(() => router.push("/admin/exchanges"));
          }}><Trash2 /> Delete exchange</Button>
        </div>
      </form>
    </section>
  );
}

interface Member extends RosterOption { reveal: boolean | null }

function ParticipantPicker({ exchangeId, role, members, roster }: { exchangeId: string; role: "provider" | "acceptor"; members: Member[]; roster: RosterOption[] }) {
  const { run, busy } = useRun();
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("");
  const [batchId, setBatchId] = useState("");
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const classes = useMemo(() => [...new Map(roster.filter((r) => r.classId).map((r) => [r.classId!, r.className ?? "Class"])).entries()], [roster]);
  const batches = useMemo(() => [...new Map(roster.filter((r) => r.batchId && r.classId === classId).map((r) => [r.batchId!, r.batchName ?? "Batch"])).entries()], [roster, classId]);
  const matches = useMemo(() => (query.trim().length < 2 ? [] : roster.filter((r) => !memberIds.has(r.id) && r.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)), [roster, query, memberIds]);

  function save(ids: string[]) {
    run(() => setExchangeParticipantsAction({ exchangeId, role, studentIds: ids }));
  }
  const addOne = (id: string) => { save([...memberIds, id]); setQuery(""); };
  const removeOne = (id: string) => save([...memberIds].filter((x) => x !== id));
  const addGroup = () => {
    const pool = roster.filter((r) => r.classId === classId && (!batchId || r.batchId === batchId)).map((r) => r.id);
    save([...new Set([...memberIds, ...pool])]);
  };

  const { run: runReveal, busy: revealBusy } = useRun();
  const setReveal = (studentId: string, reveal: boolean | null) =>
    runReveal(() => setParticipantRevealAction({ exchangeId, studentId, role, reveal }));

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold capitalize">{role}s ({members.length})</p>
      <ul className="space-y-1.5">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-xs">
            <span className="font-medium">{m.name}</span>
            <NativeSelect
              aria-label={`Show ${m.name}'s identity to who they talk to`}
              className="h-7 w-auto px-2 py-0 text-xs"
              value={m.reveal === null ? "default" : m.reveal ? "show" : "hide"}
              disabled={revealBusy}
              onChange={(e) => setReveal(m.id, e.target.value === "default" ? null : e.target.value === "show")}
            >
              <option value="default">Exchange default</option>
              <option value="show">Always show identity</option>
              <option value="hide">Always hide identity</option>
            </NativeSelect>
            <button type="button" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => removeOne(m.id)} className="ml-auto text-muted-foreground hover:text-destructive"><UserMinus className="h-3 w-3" /></button>
          </li>
        ))}
        {members.length === 0 && <li className="text-xs text-muted-foreground">No one added yet.</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Field id={`${role}-class`} label="Add a whole class/batch" className="w-40">
          <NativeSelect id={`${role}-class`} value={classId} onChange={(e) => { setClassId(e.target.value); setBatchId(""); }}>
            <option value="">Choose class</option>
            {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </NativeSelect>
        </Field>
        <NativeSelect aria-label="Batch (optional)" className="w-40" value={batchId} onChange={(e) => setBatchId(e.target.value)} disabled={!classId}>
          <option value="">Whole class</option>
          {batches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </NativeSelect>
        <Button type="button" size="sm" variant="outline" disabled={!classId || busy} onClick={addGroup}><UserPlus /> Add group</Button>
      </div>
      <div className="relative max-w-xs">
        <Input placeholder="Add one student by name..." value={query} onChange={(e) => setQuery(e.target.value)} />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-md">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary" onClick={() => addOne(m.id)}>{m.name}{m.className ? ` · ${m.className}` : ""}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ListingsPanel({ listings, nameOf }: { listings: ExchangeListingRow[]; nameOf: (id: string) => string }) {
  if (listings.length === 0) return <p className="text-sm text-muted-foreground">No providers have posted a listing yet.</p>;
  return (
    <ul className="space-y-2">
      {listings.map((l) => (
        <li key={l.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{l.project_name} <span className="text-xs font-normal text-muted-foreground">by {nameOf(l.provider_student_id)}</span></p>
            {!l.is_active && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>}
          </div>
          {l.description && <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {l.links.map((lk, i) => <a key={i} href={lk.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary"><ExternalLink className="h-3 w-3" /> {lk.label}</a>)}
            {l.pdf && <a href={l.pdf.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary"><FileText className="h-3 w-3" /> {l.pdf.name}</a>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConnectionsPanel({
  exchangeId, connections, providers, acceptors, listings, nameOf,
}: {
  exchangeId: string; connections: ExchangeConnectionRow[]; providers: RosterOption[]; acceptors: RosterOption[]; listings: ExchangeListingRow[]; nameOf: (id: string) => string;
}) {
  const { run, busy } = useRun();
  const [provId, setProvId] = useState("");
  const [accId, setAccId] = useState("");
  const projectOf = (connectionListingId: string | null) => listings.find((l) => l.id === connectionListingId)?.project_name ?? "Admin-paired (no listing)";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
        <Field id="force-prov" label="Force-pair: provider" className="w-48">
          <NativeSelect id="force-prov" value={provId} onChange={(e) => setProvId(e.target.value)}>
            <option value="">Choose provider</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="force-acc" label="with acceptor" className="w-48">
          <NativeSelect id="force-acc" value={accId} onChange={(e) => setAccId(e.target.value)}>
            <option value="">Choose acceptor</option>
            {acceptors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </Field>
        <Button type="button" size="sm" disabled={!provId || !accId || busy} onClick={() => run(() => forceConnectionAction(exchangeId, provId, accId), "Connection created")}>Connect them</Button>
      </div>
      {connections.length === 0 ? <p className="text-sm text-muted-foreground">No connection requests yet.</p> : (
        <ul className="space-y-2">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{nameOf(c.acceptor_student_id)} <span className="text-muted-foreground">→</span> {nameOf(c.provider_student_id)}</p>
                <p className="text-xs text-muted-foreground">{projectOf(c.listing_id)} · Requested {formatPkt(c.requested_at)}{c.ended_reason ? ` · ${c.ended_reason}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", STATUS_STYLE[c.status])}>{c.status}</span>
                {c.status === "pending" && (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => decideConnectionAction(c.id, "approved"), "Approved")}>Approve</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => run(() => decideConnectionAction(c.id, "rejected"), "Rejected")}>Reject</Button>
                  </>
                )}
                {c.status === "active" && (
                  <>
                    <Button asChild size="sm" variant="outline"><Link href={`/admin/exchanges/${exchangeId}/connections/${c.id}`}>View chat</Link></Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => run(() => endConnectionAction(c.id, prompt("Reason (optional):") ?? ""), "Ended")}>End</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExchangeDetailManager({
  exchange, participants, listings, connections, roster,
}: {
  exchange: ExchangeRow; participants: ExchangeParticipantRow[]; listings: ExchangeListingRow[]; connections: ExchangeConnectionRow[]; roster: RosterOption[];
}) {
  const byId = useMemo(() => new Map(roster.map((r) => [r.id, r])), [roster]);
  const nameOf = (id: string) => byId.get(id)?.name ?? "Unknown student";
  const toMember = (p: ExchangeParticipantRow): Member | null => {
    const o = byId.get(p.student_id);
    return o ? { ...o, reveal: p.reveal_identity } : null;
  };
  const providers = participants.filter((p) => p.role === "provider").map(toMember).filter((x): x is Member => !!x);
  const acceptors = participants.filter((p) => p.role === "acceptor").map(toMember).filter((x): x is Member => !!x);

  return (
    <div className="space-y-6">
      <header><h1 className="text-3xl font-extrabold">{exchange.title}</h1></header>
      <SettingsPanel exchange={exchange} />
      <section aria-labelledby="participants-h" className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card) md:grid-cols-2">
        <h2 id="participants-h" className="sr-only">Participants</h2>
        <ParticipantPicker exchangeId={exchange.id} role="provider" members={providers} roster={roster} />
        <ParticipantPicker exchangeId={exchange.id} role="acceptor" members={acceptors} roster={roster} />
      </section>
      <section aria-labelledby="listings-h" className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
        <h2 id="listings-h" className="text-lg font-bold">Listings ({listings.length})</h2>
        <ListingsPanel listings={listings} nameOf={nameOf} />
      </section>
      <section aria-labelledby="connections-h" className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
        <h2 id="connections-h" className="text-lg font-bold">Connections ({connections.length})</h2>
        <ConnectionsPanel exchangeId={exchange.id} connections={connections} providers={providers} acceptors={acceptors} listings={listings} nameOf={nameOf} />
      </section>
    </div>
  );
}
