import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { BadgeLevel, Track } from "./types";

export interface StudentSession {
  userId: string;
  email: string | null;
  student: {
    id: string;
    slug: string;
    name: string;
    track: Track;
    badge: BadgeLevel | null;
    bio: string | null;
    skills: string[];
    image_url: string | null;
    image_public_id: string | null;
    batch_id: string | null;
    profile_completed_at: string | null;
  };
}

/** The signed-in student (a user that owns a students row), or null. RLS lets them read only their own row. */
export async function getStudentSession(): Promise<StudentSession | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await supabase
    .from("students")
    .select("id, slug, name, track, badge, bio, skills, image_url, image_public_id, batch_id, profile_completed_at")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!row) return null;
  return { userId: data.user.id, email: data.user.email ?? null, student: row as StudentSession["student"] };
}

export async function requireStudentPage(): Promise<StudentSession> {
  const s = await getStudentSession();
  if (!s) redirect("/login");
  return s;
}
