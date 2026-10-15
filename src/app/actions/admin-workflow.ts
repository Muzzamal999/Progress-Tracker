"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin, NotAdminError } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { destroyImage, isOwnAsset, verifyUploadedImage } from "@/lib/cloudinary-server";
import { STUDENTS_TAG } from "@/lib/students";
import { BADGE_ORDER } from "@/lib/types";
import type { ActionResult } from "./students";

async function guarded(fn: (supabase: Awaited<ReturnType<typeof createClient>>) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    await requireAdmin();
    return await fn(await createClient());
  } catch (e) {
    if (e instanceof NotAdminError) return { ok: false, error: "You are not authorized" };
    console.error("admin action failed", e);
    return { ok: false, error: "Something went wrong" };
  }
}
const fail = (error: { code?: string; message: string }): ActionResult => {
  if (error.code === "23505") return { ok: false, error: "That name is already in use" };
  if (error.code === "P0001") return { ok: false, error: error.message };
  console.error("admin action db error", error);
  return { ok: false, error: error.message || "Database error" };
};
const bad = (e: z.ZodError): ActionResult => ({ ok: false, error: e.issues[0]?.message ?? "Invalid data" });
const text = (max: number) => z.string().trim().max(max).optional().default("");
const orNull = (v: string | undefined | null) => (v ? v : null);
const asset = z.object({ url: z.url(), publicId: z.string().min(1).max(300) });

// ---------- review ----------
const reviewSchema = z.object({
  kind: z.enum(["submission", "report"]),
  id: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  feedback: text(2000),
});
export async function reviewAction(raw: unknown): Promise<ActionResult> {
  const p = reviewSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  return guarded(async (sb) => {
    const { error } = await sb.rpc("review_item", { p_kind: p.data.kind, p_id: p.data.id, p_decision: p.data.decision, p_feedback: p.data.feedback });
    if (error) return fail(error);
    updateTag(STUDENTS_TAG); // approvals change the public board
    return { ok: true };
  });
}

// ---------- classes / batches / tasks ----------
const classSchema = z.object({ id: z.uuid().optional(), name: z.string().trim().min(1, "Name is required").max(120), description: text(1000), isActive: z.boolean() });
export async function saveClassAction(raw: unknown): Promise<ActionResult> {
  const p = classSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  return guarded(async (sb) => {
    const row = { name: v.name, description: orNull(v.description), is_active: v.isActive };
    const { error } = v.id ? await sb.from("classes").update(row).eq("id", v.id) : await sb.from("classes").insert(row);
    return error ? fail(error) : { ok: true };
  });
}

const dateOrEmpty = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Invalid date").optional().default("");
const batchSchema = z.object({
  id: z.uuid().optional(), classId: z.uuid("Choose a class"), name: z.string().trim().min(1, "Name is required").max(120),
  startsOn: dateOrEmpty, endsOn: dateOrEmpty, isActive: z.boolean(),
});
export async function saveBatchAction(raw: unknown): Promise<ActionResult> {
  const p = batchSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) return { ok: false, error: "End date must be after the start date" };
  return guarded(async (sb) => {
    const row = { class_id: v.classId, name: v.name, starts_on: orNull(v.startsOn), ends_on: orNull(v.endsOn), is_active: v.isActive };
    const { error } = v.id ? await sb.from("batches").update(row).eq("id", v.id) : await sb.from("batches").insert(row);
    return error ? fail(error) : { ok: true };
  });
}

const taskSchema = z.object({
  id: z.uuid().optional(), classId: z.uuid("Choose a class"), batchId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(200), description: text(4000), dueDate: dateOrEmpty, isActive: z.boolean(),
});
export async function saveTaskAction(raw: unknown): Promise<ActionResult> {
  const p = taskSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  return guarded(async (sb) => {
    const row = { class_id: v.classId, batch_id: v.batchId ?? null, title: v.title, description: orNull(v.description), due_date: orNull(v.dueDate), is_active: v.isActive };
    const { error } = v.id ? await sb.from("tasks").update(row).eq("id", v.id) : await sb.from("tasks").insert(row);
    return error ? fail(error) : { ok: true };
  });
}

export async function deleteRowAction(table: "classes" | "batches" | "tasks" | "lab_manuals", id: string): Promise<ActionResult> {
  if (!["classes", "batches", "tasks", "lab_manuals"].includes(table) || !z.uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
  return guarded(async (sb) => {
    let images: { public_id: string }[] = [];
    if (table === "lab_manuals") {
      const { data } = await sb.from("lab_manuals").select("images").eq("id", id).maybeSingle();
      images = (data?.images as { public_id: string }[]) ?? [];
    }
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) return fail(error);
    await Promise.all(images.map((i) => destroyImage(i.public_id)));
    updateTag(STUDENTS_TAG);
    return { ok: true };
  });
}

// ---------- lab manuals ----------
const manualSchema = z.object({
  classId: z.uuid("Choose a class"), batchId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(200), description: text(1000), body: text(20000),
  images: z.array(asset).max(10),
});
export async function createManualAction(raw: unknown): Promise<ActionResult> {
  const p = manualSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  for (const i of v.images) {
    if (!isOwnAsset(i.publicId, i.url, "manual")) return { ok: false, error: "Invalid image" };
    const c = await verifyUploadedImage(i.publicId);
    if (!c.ok) return { ok: false, error: c.error };
  }
  const res = await guarded(async (sb) => {
    const { error } = await sb.from("lab_manuals").insert({
      class_id: v.classId, batch_id: v.batchId ?? null, title: v.title, description: orNull(v.description), body: orNull(v.body),
      images: v.images.map((i) => ({ url: i.url, public_id: i.publicId })),
    });
    return error ? fail(error) : { ok: true };
  });
  if (!res.ok) await Promise.all(v.images.map((i) => destroyImage(i.publicId)));
  return res;
}

// ---------- badge rules ----------
const rulesSchema = z.array(z.object({
  level: z.enum(BADGE_ORDER), name: z.string().trim().min(1, "Every badge needs a name").max(60),
  position: z.number().int().min(1).max(1000), required_projects: z.number().int().min(1, "Required projects must be at least 1").max(100),
  certificate_eligible: z.boolean(), is_active: z.boolean(),
})).min(1).refine((r) => new Set(r.map((x) => x.position)).size === r.length, "Each badge needs a different order number");
export async function saveBadgeRulesAction(raw: unknown): Promise<ActionResult> {
  const p = rulesSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!p.data.some((r) => r.is_active)) return { ok: false, error: "At least one badge must stay active" };
  return guarded(async (sb) => {
    const { error } = await sb.rpc("save_badge_rules", { rules: p.data });
    if (error) return fail(error);
    updateTag(STUDENTS_TAG);
    return { ok: true };
  });
}

// ---------- organisation branding ----------
const orgSchema = z.object({
  orgName: z.string().trim().min(1, "Organisation name is required").max(120), tagline: text(200),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #4f46e5"),
  signatoryName: text(120), signatoryTitle: text(120), certificateFooter: text(300),
  newLogo: asset.optional(), removeLogo: z.boolean().optional(),
});
export async function saveOrgAction(raw: unknown): Promise<ActionResult> {
  const p = orgSchema.safeParse(raw);
  if (!p.success) return bad(p.error);
  const v = p.data;
  if (v.newLogo) {
    if (!isOwnAsset(v.newLogo.publicId, v.newLogo.url, "branding")) return { ok: false, error: "Invalid logo" };
    const c = await verifyUploadedImage(v.newLogo.publicId);
    if (!c.ok) return { ok: false, error: c.error };
  }
  return guarded(async (sb) => {
    const { data: old } = await sb.from("organization_settings").select("logo_public_id").maybeSingle();
    const row: Record<string, unknown> = {
      org_name: v.orgName, tagline: orNull(v.tagline), accent_color: v.accentColor, signatory_name: orNull(v.signatoryName),
      signatory_title: orNull(v.signatoryTitle), certificate_footer: orNull(v.certificateFooter), updated_at: new Date().toISOString(),
    };
    if (v.newLogo) Object.assign(row, { logo_url: v.newLogo.url, logo_public_id: v.newLogo.publicId });
    else if (v.removeLogo) Object.assign(row, { logo_url: null, logo_public_id: null });
    const { error } = await sb.from("organization_settings").update(row).eq("id", true);
    if (error) {
      if (v.newLogo) await destroyImage(v.newLogo.publicId);
      return fail(error);
    }
    if ((v.newLogo || v.removeLogo) && old?.logo_public_id && old.logo_public_id !== v.newLogo?.publicId) await destroyImage(old.logo_public_id);
    return { ok: true };
  });
}

// ---------- certificates ----------
export async function setCertificateRevokedAction(id: string, revoke: boolean, reason?: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  return guarded(async (sb) => {
    const row = revoke ? { revoked_at: new Date().toISOString(), revoke_reason: (reason ?? "").trim().slice(0, 300) || "Revoked by an administrator" } : { revoked_at: null, revoke_reason: null };
    const { error } = await sb.from("certificates").update(row).eq("id", id);
    return error ? fail(error) : { ok: true };
  });
}
