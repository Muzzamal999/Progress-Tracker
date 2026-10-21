"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { destroyImage, isOwnAsset, isOwnPdf, verifyUploadedImage, verifyUploadedPdf } from "@/lib/cloudinary-server";
import { getStudentSession } from "@/lib/student-session";
import { STUDENTS_TAG } from "@/lib/students";
import { PROJECT_TYPES, TRACKS } from "@/lib/types";
import { normalizeList } from "@/lib/student-utils";
import type { ActionResult } from "./students";

const asset = z.object({ url: z.url(), publicId: z.string().min(1).max(300) });
const evidenceList = (min: number) => z.array(asset).min(min, min ? "Attach at least one image as evidence" : undefined).max(6, "At most 6 images");
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a valid URL starting with http:// or https://");

const PG_UNIQUE = "23505";

/** Postgres RAISE EXCEPTION messages from our functions are written for users; anything else is generic. */
function userError(error: { code?: string; message: string }): string {
  if (error.code === PG_UNIQUE) return "You already have a submission with this title or link";
  if (error.code === "P0001" || error.code === "42501") return error.message;
  console.error("student action failed", error);
  return "Something went wrong. Please try again.";
}

async function verifyAssets(list: { url: string; publicId: string }[], purpose: "evidence" | "avatar"): Promise<string | null> {
  for (const a of list) {
    if (!isOwnAsset(a.publicId, a.url, purpose)) return "Invalid upload";
    const v = await verifyUploadedImage(a.publicId);
    if (!v.ok) return v.error;
  }
  return null;
}
const dropAssets = (list: { publicId: string }[]) => Promise.all(list.map((a) => destroyImage(a.publicId)));

// ---------- profile ----------
const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  track: z.enum(TRACKS),
  batchId: z.uuid("Choose your batch"),
  bio: z.string().trim().max(1000).optional().default(""),
  skills: z.array(z.string().trim().max(40)).max(50).transform(normalizeList),
  newImage: asset.optional(),
});

export async function updateProfileAction(raw: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const v = parsed.data;
  const session = await getStudentSession();
  if (!session) return { ok: false, error: "Please sign in first" };
  if (v.newImage) {
    const bad = await verifyAssets([v.newImage], "avatar");
    if (bad) return { ok: false, error: bad };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p: {
      name: v.name,
      track: v.track,
      batch_id: v.batchId,
      bio: v.bio,
      skills: v.skills,
      ...(v.newImage ? { image_url: v.newImage.url, image_public_id: v.newImage.publicId } : {}),
    },
  });
  if (error) {
    if (v.newImage) await dropAssets([v.newImage]);
    return { ok: false, error: userError(error) };
  }
  if (v.newImage && session.student.image_public_id && session.student.image_public_id !== v.newImage.publicId) {
    await destroyImage(session.student.image_public_id);
  }
  updateTag(STUDENTS_TAG);
  return { ok: true };
}

// ---------- project submissions ----------
const projectSchema = z.object({
  id: z.uuid().optional(), // present = resubmit a rejected one
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().trim().max(4000).optional().default(""),
  type: z.enum(PROJECT_TYPES),
  stack: z.array(z.string().trim().max(40)).max(30).transform(normalizeList),
  link: optionalUrl,
  taskId: z.uuid().nullable().optional(),
  attachments: evidenceList(1),
  labReport: z.object({ url: z.url(), publicId: z.string().min(1).max(300), name: z.string().trim().min(1).max(200) }, "Attach your lab report as a PDF"),
});

export async function submitProjectAction(raw: unknown): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const v = parsed.data;
  const bad = await verifyAssets(v.attachments, "evidence");
  if (bad) return { ok: false, error: bad };
  if (!isOwnPdf(v.labReport.publicId, v.labReport.url, "labreport")) return { ok: false, error: "Invalid lab report" };
  const pdf = await verifyUploadedPdf(v.labReport.publicId);
  if (!pdf.ok) {
    await dropAssets(v.attachments);
    return { ok: false, error: pdf.error };
  }

  const supabase = await createClient();
  const payload = {
    title: v.title,
    description: v.description,
    type: v.type,
    stack: v.stack,
    link: v.link,
    task_id: v.taskId ?? null,
    attachments: v.attachments.map((a) => ({ url: a.url, public_id: a.publicId })),
    lab_report: { url: v.labReport.url, public_id: v.labReport.publicId, name: v.labReport.name, pages: pdf.pages, bytes: pdf.bytes },
  };
  const { error } = v.id
    ? await supabase.rpc("resubmit_project", { p_id: v.id, p: payload })
    : await supabase.rpc("submit_project", { p: payload });
  if (error) {
    await dropAssets([...v.attachments, v.labReport]);
    return { ok: false, error: userError(error) };
  }
  return { ok: true };
}

// ---------- daily reports ----------
const reportSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  summary: z.string().trim().min(1, "Describe what you did today").max(4000),
  hours: z.number().min(0).max(24).nullable().optional(),
  blockers: z.string().trim().max(2000).optional().default(""),
  attachments: evidenceList(0),
  submissionIds: z.array(z.uuid()).max(20).optional().default([]),
  taskIds: z.array(z.uuid()).max(20).optional().default([]),
});

export async function submitReportAction(raw: unknown): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const v = parsed.data;
  const bad = await verifyAssets(v.attachments, "evidence");
  if (bad) return { ok: false, error: bad };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_daily_report", {
    p: {
      report_date: v.reportDate,
      summary: v.summary,
      hours_spent: v.hours ?? null,
      blockers: v.blockers,
      attachments: v.attachments.map((a) => ({ url: a.url, public_id: a.publicId })),
      submission_ids: v.submissionIds,
      task_ids: v.taskIds,
    },
  });
  if (error) {
    await dropAssets(v.attachments);
    if (error.code === PG_UNIQUE) return { ok: false, error: "You already submitted a report for that day" };
    return { ok: false, error: userError(error) };
  }
  return { ok: true };
}
