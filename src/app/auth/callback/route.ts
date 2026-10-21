import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE_SECONDS } from "@/lib/recovery";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/** Only same-site relative paths, so the `next` param can never become an open redirect. */
function safeNext(value: string | null, fallback: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}

/**
 * Landing point of the emailed confirm/reset link. Exchanges the link's code (PKCE) or token_hash
 * for a session cookie, then sends the user on. For password recovery it also sets the recovery marker cookie
 * and lands on /reset-password; an expired, invalid or already-used link lands on /reset-password?error=invalid
 * (which offers a fresh link) instead of silently signing anybody in.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const base = request.nextUrl.origin;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), "");
  const isRecovery = type === "recovery" || next === "/reset-password" || next.startsWith("/reset-password?");

  // Supabase reports expired/used links as ?error=... (or in the #fragment, which we never see: no code => failure below).
  let ok = false;
  if (!searchParams.get("error") && !searchParams.get("error_code")) {
    const supabase = await createClient();
    if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    else if (tokenHash && type && OTP_TYPES.includes(type)) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  if (!ok) {
    return NextResponse.redirect(`${base}${isRecovery ? "/reset-password?error=invalid" : "/login?verified=failed"}`);
  }
  const res = NextResponse.redirect(`${base}${isRecovery ? "/reset-password" : safeNext(next, "/dashboard/profile")}`);
  if (isRecovery) {
    res.cookies.set(RECOVERY_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: RECOVERY_MAX_AGE_SECONDS,
    });
  }
  return res;
}
