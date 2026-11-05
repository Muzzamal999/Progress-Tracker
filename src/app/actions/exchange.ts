"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { destroyImage, isOwnPdf, verifyUploadedPdf } from "@/lib/cloudinary-server";
import { getStudentSession } from "@/lib/student-session";
import type { ActionResult } from "./students";

/** Postgres RAISE EXCEPTION messages from our functions are written for users; anything else is generic. */
function userError(error: { code?: string; message: string }): string {
  if (error.code === "P0001" || error.code === "42501") return error.message;
  console.error("exchange action failed", error);
  return "Something went wrong. Please try again.";
}

// ---------- provider: create/update the listing for one exchange ----------
const linkSchema = z.object({
  label: z.string().trim().min(1, "Give each link a label").max(40),
  url: z.string().trim().max(500).refine((v) => /^https?:\/\/\S+$/i.test(v), "Enter a valid URL starting with http:// or https://"),
});
const listingSchema = z.object({
  exchangeId: z.uuid(),
  projectName: z.string().trim().min(1, "Project name is required").max(160),
  description: z.string().trim().max(4000).optional().default(""),
  links: z.array(linkSchema).max(8),
  pdf: z.object({ url: z.url(), publicId: z.string().min(1).max(300), name: z.string().trim().min(1).max(200) }).nullable().optional(),
});
export async function saveListingAction(raw: unknown): Promise<ActionResult> {
  const parsed = listingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const v = parsed.data;
  const session = await getStudentSession();
  if (!session) return { ok: false, error: "Please sign in first" };

  let pdf: { url: string; public_id: string; name: string; pages: number; bytes: number } | null = null;
  if (v.pdf) {
    if (!isOwnPdf(v.pdf.publicId, v.pdf.url, "exchangepdf")) return { ok: false, error: "Invalid PDF" };
    const c = await verifyUploadedPdf(v.pdf.publicId);
    if (!c.ok) return { ok: false, error: c.error };
    pdf = { url: v.pdf.url, public_id: v.pdf.publicId, name: v.pdf.name, pages: c.pages, bytes: c.bytes };
  }

  const supabase = await createClient();
  const { data: old } = await supabase
    .from("exchange_listings")
    .select("pdf")
    .eq("exchange_id", v.exchangeId)
    .eq("provider_student_id", session.student.id)
    .maybeSingle();

  const { error } = await supabase.from("exchange_listings").upsert(
    {
      exchange_id: v.exchangeId,
      provider_student_id: session.student.id,
      project_name: v.projectName,
      description: v.description || null,
      links: v.links,
      pdf,
    },
    { onConflict: "exchange_id,provider_student_id" },
  );
  if (error) {
    if (pdf) await destroyImage(pdf.public_id);
    return { ok: false, error: userError(error) };
  }
  const oldPdf = old?.pdf as { public_id: string } | null;
  if (oldPdf?.public_id && oldPdf.public_id !== pdf?.public_id) await destroyImage(oldPdf.public_id);
  return { ok: true };
}

// ---------- acceptor: request / cancel a connection ----------
export async function requestConnectionAction(listingId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(listingId).success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_connection", { p_listing_id: listingId });
  return error ? { ok: false, error: userError(error) } : { ok: true };
}
export async function cancelConnectionAction(connectionId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(connectionId).success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_connection", { p_connection: connectionId });
  return error ? { ok: false, error: userError(error) } : { ok: true };
}

// ---------- chat ----------
const messageSchema = z.object({ connectionId: z.uuid(), body: z.string().trim().min(1, "Write a message first").max(4000) });
export async function sendExchangeMessageAction(raw: unknown): Promise<ActionResult> {
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const v = parsed.data;
  const session = await getStudentSession();
  if (!session) return { ok: false, error: "Please sign in first" };
  const supabase = await createClient();
  const { error } = await supabase.from("exchange_messages").insert({
    connection_id: v.connectionId,
    sender_student_id: session.student.id,
    body: v.body,
  });
  return error ? { ok: false, error: userError(error) } : { ok: true };
}
