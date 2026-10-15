import { cacheLife, cacheTag } from "next/cache";
import { createAnonClient } from "./supabase/anon";
import type { Student } from "./types";

export const STUDENTS_TAG = "students";

/** Retries brief network failures (not Supabase errors) so a blip doesn't turn into an error page. */
async function withRetry<T>(fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, attempts = 3) {
  let last = "Request failed";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fn();
      if (!res.error) return res.data;
      last = res.error.message;
      if (!/fetch failed|network|timeout|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(last)) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  throw new Error(last);
}

/**
 * All students with their projects, cached and tagged. Admin mutations call
 * updateTag("students") so changes show up immediately. Never selects email.
 */
export async function getStudents(): Promise<Student[]> {
  "use cache";
  cacheTag(STUDENTS_TAG);
  cacheLife("hours");

  const supabase = createAnonClient();
  const data = await withRetry(() =>
    supabase
      .from("students")
      .select("id, slug, name, image_url, track, badge, skills, created_at, projects(*)")
      .order("name")
      .order("position", { referencedTable: "projects" }),
  );
  const students = (data ?? []) as unknown as Student[];

  // Approved submissions of registered students are public projects too. Failure here (e.g. the
  // migration has not been applied yet) must not take the whole board down.
  try {
    const { data: approved } = await supabase
      .from("public_student_projects")
      .select("id, student_id, title, type, solo, stack, link, submitted_at")
      .order("submitted_at");
    const byStudent = new Map<string, Student["projects"]>();
    for (const p of (approved ?? []) as { id: string; student_id: string; title: string; type: Student["projects"][number]["type"]; solo: boolean; stack: string[]; link: string | null }[]) {
      const list = byStudent.get(p.student_id) ?? [];
      list.push({ id: p.id, title: p.title, type: p.type, solo: p.solo, stack: p.stack, link: p.link, position: 1000 + list.length });
      byStudent.set(p.student_id, list);
    }
    for (const s of students) s.projects = [...(s.projects ?? []), ...(byStudent.get(s.id) ?? [])];
  } catch (e) {
    console.error("Could not load approved submissions", e);
  }
  return students;
}

export async function getStudentBySlug(slug: string): Promise<Student | null> {
  const all = await getStudents();
  return all.find((s) => s.slug === slug) ?? null;
}

/** Resolves an old "stu-002" id to the new slug, for permanent redirects. */
export async function getSlugByLegacyId(legacyId: string): Promise<string | null> {
  "use cache";
  cacheTag(STUDENTS_TAG);
  cacheLife("hours");

  const supabase = createAnonClient();
  const data = await withRetry(() =>
    supabase.from("students").select("slug").eq("legacy_id", legacyId).limit(1),
  );
  return data?.[0]?.slug ?? null;
}
