"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin, NotAdminError } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { destroyImage, isOwnAsset, verifyUploadedImage } from "@/lib/cloudinary-server";
import { slugify, uniqueSlug } from "@/lib/student-utils";
import { studentSchema } from "@/lib/validation";
import { STUDENTS_TAG } from "@/lib/students";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; field?: "email" | "name" };

const uploadedImageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1).max(300),
});

const saveInput = z.object({
  id: z.uuid().optional(),
  values: studentSchema,
  // Present only when a new file was uploaded to Cloudinary in this save.
  newImage: uploadedImageSchema.optional(),
});

const PG_UNIQUE = "23505";

export async function saveStudentAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  let newPublicId: string | undefined;
  try {
    await requireAdmin();
    const parsed = saveInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
    const { id, values, newImage } = parsed.data;
    const supabase = await createClient();

    // Existing image (needed to keep it, or to delete it after a replacement).
    let oldPublicId: string | null = null;
    let imageUrl: string | null = null;
    let imagePublicId: string | null = null;
    if (id) {
      const { data: existing, error } = await supabase
        .from("students")
        .select("image_url, image_public_id")
        .eq("id", id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!existing) return { ok: false, error: "Student not found" };
      oldPublicId = existing.image_public_id;
      imageUrl = existing.image_url;
      imagePublicId = existing.image_public_id;
    }

    if (newImage) {
      if (!isOwnAsset(newImage.publicId, newImage.url)) return { ok: false, error: "Invalid image" };
      newPublicId = newImage.publicId;
      const check = await verifyUploadedImage(newImage.publicId);
      if (!check.ok) return { ok: false, error: check.error };
      imageUrl = newImage.url;
      imagePublicId = newImage.publicId;
    }

    const projects = values.projects.map((p) => ({ ...p, link: p.link || null }));

    // Slug: generated once on create, never changed on edit.
    let slug: string | undefined;
    let slugAttempt = 0;
    let savedId: string | null = null;
    let lastError = "";
    while (savedId === null && slugAttempt < 3) {
      if (!id) {
        const base = slugify(values.name);
        const { data: taken, error } = await supabase
          .from("students")
          .select("slug")
          .like("slug", `${base}%`);
        if (error) return { ok: false, error: error.message };
        slug = uniqueSlug(base, (taken ?? []).map((r) => r.slug));
      }
      const { data, error } = await supabase.rpc("save_student", {
        student: {
          id: id ?? null,
          slug,
          name: values.name,
          email: values.email || null,
          track: values.track,
          badge: values.badge,
          skills: values.skills,
          image_url: imageUrl,
          image_public_id: imagePublicId,
        },
        projects,
      });
      if (!error) {
        savedId = data as string;
        break;
      }
      if (error.code === PG_UNIQUE && /student_private_email/.test(error.message)) {
        if (newPublicId) await destroyImage(newPublicId);
        return { ok: false, error: "A student with this email already exists", field: "email" };
      }
      if (error.code === PG_UNIQUE && !id) {
        slugAttempt++; // slug raced with another create; recompute and retry
        lastError = error.message;
        continue;
      }
      lastError = error.message;
      break;
    }

    if (savedId === null) {
      // DB write failed: remove the asset we just uploaded.
      if (newPublicId) await destroyImage(newPublicId);
      return { ok: false, error: lastError || "Could not save student" };
    }

    // DB write succeeded: now it's safe to delete the replaced asset.
    if (newPublicId && oldPublicId && oldPublicId !== newPublicId) await destroyImage(oldPublicId);
    updateTag(STUDENTS_TAG);
    return { ok: true, data: { id: savedId } };
  } catch (e) {
    if (newPublicId) await destroyImage(newPublicId);
    if (e instanceof NotAdminError) return { ok: false, error: "You are not authorized" };
    console.error("saveStudentAction", e);
    return { ok: false, error: "Something went wrong while saving" };
  }
}

export async function deleteStudentAction(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
    const supabase = await createClient();
    const { data: existing, error: readErr } = await supabase
      .from("students")
      .select("image_public_id")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!existing) return { ok: false, error: "Student not found" };

    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await destroyImage(existing.image_public_id);
    updateTag(STUDENTS_TAG);
    return { ok: true };
  } catch (e) {
    if (e instanceof NotAdminError) return { ok: false, error: "You are not authorized" };
    console.error("deleteStudentAction", e);
    return { ok: false, error: "Something went wrong while deleting" };
  }
}
