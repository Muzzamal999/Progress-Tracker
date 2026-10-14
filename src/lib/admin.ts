import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export interface AdminProfile {
  id: string;
  email: string | null;
}

/** The signed-in admin, or null. The check is against admin_users (RLS-protected). */
export async function getAdmin(): Promise<AdminProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  return row ? { id: data.user.id, email: data.user.email ?? null } : null;
}

export async function getAdminUserId(): Promise<string | null> {
  return (await getAdmin())?.id ?? null;
}

/** For pages: redirects to the login screen when the caller isn't an admin. */
export async function requireAdminPage(): Promise<AdminProfile> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export class NotAdminError extends Error {
  constructor() {
    super("Not authorized");
  }
}

/** For actions and route handlers: throws instead of redirecting. */
export async function requireAdmin(): Promise<string> {
  const id = await getAdminUserId();
  if (!id) throw new NotAdminError();
  return id;
}
