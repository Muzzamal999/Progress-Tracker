import "server-only";
import { createClient } from "./supabase/server";
import type { AdminStudent } from "./types";

const SELECT =
  "id, slug, name, image_url, image_public_id, track, badge, skills, created_at, student_private(email), projects(*)";

type Row = Omit<AdminStudent, "email"> & { student_private: { email: string | null } | { email: string | null }[] | null };

function toAdmin(r: Row): AdminStudent {
  const priv = Array.isArray(r.student_private) ? r.student_private[0] : r.student_private;
  const { student_private: _drop, ...rest } = r;
  void _drop;
  return { ...rest, email: priv?.email ?? null, projects: [...(rest.projects ?? [])].sort((a, b) => a.position - b.position) };
}

export async function listAdminStudents(): Promise<AdminStudent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select(SELECT).order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(toAdmin);
}

export async function getAdminStudent(id: string): Promise<AdminStudent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toAdmin(data as unknown as Row) : null;
}

/** Existing skills across all students, for autocomplete in the form. */
export async function listSkillSuggestions(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("skills");
  const seen = new Map<string, string>();
  for (const row of data ?? []) {
    for (const s of (row.skills as string[]) ?? []) if (!seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
