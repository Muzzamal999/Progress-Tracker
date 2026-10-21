"use server";

import { z } from "zod";
import { NotAdminError, requireAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { DEADLINE_KINDS, SCOPE_TYPES } from "@/lib/deadlines";
import { isDateString, isTimeString, karachiToIso } from "@/lib/time";
import type { ActionResult } from "./students";

type Sb = Awaited<ReturnType<typeof createClient>>;

async function guarded(fn: (sb: Sb) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    await requireAdmin();
    return await fn(await createClient());
  } catch (e) {
    if (e instanceof NotAdminError) return { ok: false, error: "You are not authorized" };
    console.error("deadline action failed", e);
    return { ok: false, error: "Something went wrong" };
  }
}
const fail = (error: { code?: string; message: string }): ActionResult => {
  if (error.code === "P0001" || error.code === "42501") return { ok: false, error: error.message };
  if (error.code === "23514") return { ok: false, error: "Those settings are not valid (closing time must be after opening time, and the target must match the audience)" };
  console.error("deadline db error", error);
  return { ok: false, error: "Database error" };
};
const bad = (e: z.ZodError): ActionResult => ({ ok: false, error: e.issues[0]?.message ?? "Invalid data" });

const date = z.string().refine(isDateString, "Choose a valid date");
const time = z.string().refine(isTimeString, "Choose a valid time");
const reason = z.string().trim().max(500).optional().default("");

// ---------------------------------------------------------------- create / edit
const saveSchema = z
  .object({
    id: z.uuid().optional(),
    kind: z.enum(DEADLINE_KINDS),
    title: z.string().trim().max(120).optional().default(""),
    scopeType: z.enum(SCOPE_TYPES),
    classId: z.uuid().nullable().optional(),
    batchId: z.uuid().nullable().optional(),
    studentId: z.uuid().nullable().optional(),
    taskId: z.uuid().nullable().optional(),
    opensDate: date,
    opensTime: time,
    closesDate: date,
    closesTime: time,
    isActive: z.boolean(),
    note: z.string().trim().max(500).optional().default(""),
  })
  .superRefine((v, ctx) => {
    const need = { all: null, class: v.classId, batch: v.batchId, student: v.studentId }[v.scopeType];
    if (v.scopeType !== "all" && !need) ctx.addIssue({ code: "custom", message: `Choose the ${v.scopeType}`, path: [v.scopeType + "Id"] });
    if (v.taskId && v.kind !== "task") ctx.addIssue({ code: "custom", message: "Only task deadlines can target a task", path: ["taskId"] });
  });

export async function saveDeadlineAction(raw: unknown): Promise<ActionResult> {
  const p = saveSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  const opens = karachiToIso(v.opensDate, v.opensTime);
  const closes = karachiToIso(v.closesDate, v.closesTime);
  if (new Date(closes) <= new Date(opens)) return { ok: false, error: "The closing time must be after the opening time" };
  return guarded(async (sb) => {
    const row = {
      kind: v.kind,
      title: v.title,
      scope_type: v.scopeType,
      class_id: v.scopeType === "class" ? v.classId : null,
      batch_id: v.scopeType === "batch" ? v.batchId : null,
      student_id: v.scopeType === "student" ? v.studentId : null,
      task_id: v.kind === "task" ? (v.taskId ?? null) : null,
      opens_at: opens,
      closes_at: closes,
      is_active: v.isActive,
      note: v.note || null,
    };
    const { error } = v.id ? await sb.from("submission_deadlines").update(row).eq("id", v.id) : await sb.from("submission_deadlines").insert(row);
    return error ? fail(error) : { ok: true };
  });
}

// ---------------------------------------------------------------- activate / deactivate / delete
export async function setDeadlineActiveAction(id: string, active: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
  return guarded(async (sb) => {
    const { error } = await sb.from("submission_deadlines").update({ is_active: active }).eq("id", id);
    return error ? fail(error) : { ok: true };
  });
}

export async function deleteDeadlineAction(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
  return guarded(async (sb) => {
    const { error } = await sb.from("submission_deadlines").delete().eq("id", id);
    return error ? fail(error) : { ok: true };
  });
}

// ---------------------------------------------------------------- reopen / extend
const reopenSchema = z.object({ id: z.uuid(), closesDate: date, closesTime: time, reason });
export async function reopenDeadlineAction(raw: unknown): Promise<ActionResult> {
  const p = reopenSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  return guarded(async (sb) => {
    const { error } = await sb.rpc("reopen_deadline", { p_id: v.id, p_closes_at: karachiToIso(v.closesDate, v.closesTime), p_reason: v.reason });
    return error ? fail(error) : { ok: true };
  });
}

const extendSchema = z.object({ deadlineId: z.uuid(), studentId: z.uuid("Choose a student"), untilDate: date, untilTime: time, reason });
export async function grantExtensionAction(raw: unknown): Promise<ActionResult> {
  const p = extendSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  return guarded(async (sb) => {
    const { error } = await sb.rpc("grant_deadline_extension", {
      p_deadline: v.deadlineId,
      p_student: v.studentId,
      p_until: karachiToIso(v.untilDate, v.untilTime),
      p_reason: v.reason,
    });
    return error ? fail(error) : { ok: true };
  });
}

export async function revokeExtensionAction(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
  return guarded(async (sb) => {
    const { error } = await sb.rpc("revoke_deadline_extension", { p_id: id });
    return error ? fail(error) : { ok: true };
  });
}

// ---------------------------------------------------------------- organisation policy
const policySchema = z.object({
  defaultPolicy: z.enum(["open", "closed"]),
  reportingDays: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one reporting day").max(7),
});
export async function savePolicyAction(raw: unknown): Promise<ActionResult> {
  const p = policySchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  return guarded(async (sb) => {
    const days = [...new Set(p.data.reportingDays)].sort();
    const { error } = await sb.from("organization_settings").update({ submission_default_policy: p.data.defaultPolicy, reporting_days: days }).eq("id", true);
    return error ? fail(error) : { ok: true };
  });
}
