"use server";

import { z } from "zod";
import { NotAdminError, requireAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { destroyImage } from "@/lib/cloudinary-server";
import { isDateString, isTimeString, karachiToIso } from "@/lib/time";
import type { ActionResult } from "./students";

type Sb = Awaited<ReturnType<typeof createClient>>;

async function guarded<T = undefined>(fn: (sb: Sb) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await requireAdmin();
    return await fn(await createClient());
  } catch (e) {
    if (e instanceof NotAdminError) return { ok: false, error: "You are not authorized" };
    console.error("exchange admin action failed", e);
    return { ok: false, error: "Something went wrong" };
  }
}
const fail = (error: { code?: string; message: string }): { ok: false; error: string } => {
  if (error.code === "P0001" || error.code === "42501") return { ok: false, error: error.message };
  console.error("exchange admin db error", error);
  return { ok: false, error: error.message || "Database error" };
};
const bad = (e: z.ZodError): { ok: false; error: string } => ({ ok: false, error: e.issues[0]?.message ?? "Invalid data" });
const text = (max: number) => z.string().trim().max(max).optional().default("");
const orNull = (v: string | undefined | null) => (v ? v : null);
const dateOrEmpty = z.string().trim().optional().default("").refine((v) => v === "" || isDateString(v), "Choose a valid date");
const timeOrEmpty = z.string().trim().optional().default("").refine((v) => v === "" || isTimeString(v), "Choose a valid time");

// ---------- exchange (the portal itself) ----------
const exchangeSchema = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1, "Title is required").max(160),
    description: text(2000),
    status: z.enum(["draft", "open", "closed"]),
    isAnonymous: z.boolean(),
    requiresApproval: z.boolean(),
    maxPerAcceptor: z.number().int().min(1).max(100).nullable(),
    maxPerProvider: z.number().int().min(1).max(100).nullable(),
    opensDate: dateOrEmpty, opensTime: timeOrEmpty,
    closesDate: dateOrEmpty, closesTime: timeOrEmpty,
  })
  .superRefine((v, ctx) => {
    if (!!v.opensDate !== !!v.opensTime) ctx.addIssue({ code: "custom", message: "Set both the opening date and time, or leave both blank", path: ["opensTime"] });
    if (!!v.closesDate !== !!v.closesTime) ctx.addIssue({ code: "custom", message: "Set both the closing date and time, or leave both blank", path: ["closesTime"] });
  });
export async function saveExchangeAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const p = exchangeSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  const opensAt = v.opensDate && v.opensTime ? karachiToIso(v.opensDate, v.opensTime) : null;
  const closesAt = v.closesDate && v.closesTime ? karachiToIso(v.closesDate, v.closesTime) : null;
  if (opensAt && closesAt && closesAt <= opensAt) return { ok: false, error: "The closing time must be after the opening time" };
  return guarded(async (sb) => {
    const row = {
      title: v.title, description: orNull(v.description), status: v.status, is_anonymous: v.isAnonymous,
      requires_approval: v.requiresApproval, max_connections_per_acceptor: v.maxPerAcceptor, max_connections_per_provider: v.maxPerProvider,
      opens_at: opensAt, closes_at: closesAt,
    };
    const { data, error } = v.id
      ? await sb.from("exchanges").update(row).eq("id", v.id).select("id").single()
      : await sb.from("exchanges").insert(row).select("id").single();
    return error ? fail(error) : { ok: true, data: { id: data.id } };
  });
}

export async function deleteExchangeAction(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  return guarded(async (sb) => {
    const { data: listings } = await sb.from("exchange_listings").select("pdf").eq("exchange_id", id);
    const { error } = await sb.from("exchanges").delete().eq("id", id);
    if (error) return fail(error);
    await Promise.all(((listings ?? []) as { pdf: { public_id: string } | null }[]).map((l) => (l.pdf ? destroyImage(l.pdf.public_id) : Promise.resolve())));
    return { ok: true };
  });
}

// ---------- participants ----------
const participantsSchema = z.object({
  exchangeId: z.uuid(),
  role: z.enum(["provider", "acceptor"]),
  studentIds: z.array(z.uuid()).max(500),
});
/** Replaces the full provider or acceptor roster for one exchange with the given set (adds/removes to match). */
export async function setExchangeParticipantsAction(raw: unknown): Promise<ActionResult> {
  const p = participantsSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  return guarded(async (sb) => {
    const { data: existing, error: readErr } = await sb
      .from("exchange_participants")
      .select("student_id")
      .eq("exchange_id", v.exchangeId)
      .eq("role", v.role);
    if (readErr) return fail(readErr);
    const have = new Set((existing ?? []).map((r) => r.student_id as string));
    const want = new Set(v.studentIds);
    const toAdd = [...want].filter((id) => !have.has(id)).map((student_id) => ({ exchange_id: v.exchangeId, student_id, role: v.role }));
    const toRemove = [...have].filter((id) => !want.has(id));
    if (toAdd.length) {
      const { error } = await sb.from("exchange_participants").insert(toAdd);
      if (error) return fail(error);
    }
    if (toRemove.length) {
      const { error } = await sb.from("exchange_participants").delete().eq("exchange_id", v.exchangeId).eq("role", v.role).in("student_id", toRemove);
      if (error) return fail(error);
    }
    return { ok: true };
  });
}

// ---------- connections ----------
export async function decideConnectionAction(connectionId: string, decision: "approved" | "rejected"): Promise<ActionResult> {
  if (!z.uuid().safeParse(connectionId).success) return { ok: false, error: "Invalid request" };
  return guarded(async (sb) => {
    const { error } = await sb.rpc("admin_decide_connection", { p_connection: connectionId, p_decision: decision });
    return error ? fail(error) : { ok: true };
  });
}
export async function forceConnectionAction(exchangeId: string, providerId: string, acceptorId: string): Promise<ActionResult> {
  if (![exchangeId, providerId, acceptorId].every((id) => z.uuid().safeParse(id).success)) return { ok: false, error: "Invalid request" };
  return guarded(async (sb) => {
    const { error } = await sb.rpc("admin_force_connection", { p_exchange: exchangeId, p_provider: providerId, p_acceptor: acceptorId });
    return error ? fail(error) : { ok: true };
  });
}
export async function endConnectionAction(connectionId: string, reason: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(connectionId).success) return { ok: false, error: "Invalid request" };
  return guarded(async (sb) => {
    const { error } = await sb.rpc("admin_end_connection", { p_connection: connectionId, p_reason: reason.slice(0, 300) });
    return error ? fail(error) : { ok: true };
  });
}
