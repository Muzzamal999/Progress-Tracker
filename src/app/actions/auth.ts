"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "@/lib/recovery";
import { validatePassword } from "@/lib/password";
import type { ActionResult } from "./students";

const schema = z.object({ password: z.string().max(200), confirm: z.string().max(200) });

const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

/**
 * Sets a new password for the signed-in RECOVERY session. The browser never edits anything directly:
 *  1. the request must carry the httpOnly recovery cookie set by /auth/callback (so a normal login is not enough),
 *  2. there must be a valid Supabase session (the one created by the emailed link) - it can only ever change
 *     that user's own password,
 *  3. the password is validated here (the browser check is only for feedback),
 *  4. Supabase Auth hashes and stores it; afterwards the recovery session is ended.
 */
export async function updatePasswordAction(raw: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const jar = await cookies();
  if (jar.get(RECOVERY_COOKIE)?.value !== "1") return { ok: false, error: INVALID_LINK };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: INVALID_LINK };

  const { password, confirm } = parsed.data;
  if (password !== confirm) return { ok: false, error: "Passwords do not match" };
  const problem = validatePassword(password, { email: data.user.email });
  if (problem) return { ok: false, error: problem };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { ok: false, error: "Choose a password you are not already using" };
    if (error.code === "weak_password") return { ok: false, error: "That password is too weak. Try a longer one" };
    if (error.code === "session_not_found" || error.code === "not_authenticated" || error.status === 401) return { ok: false, error: INVALID_LINK };
    console.error("password update failed", error.code, error.message);
    return { ok: false, error: "Could not update your password. Please try again." };
  }
  jar.delete(RECOVERY_COOKIE);
  await supabase.auth.signOut(); // the recovery session ends; the user signs in with the new password
  return { ok: true };
}
