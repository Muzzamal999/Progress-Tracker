import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/** Only same-site relative paths, so the `next` param can never become an open redirect. */
function safeNext(value: string | null, fallback: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}

/**
 * Landing point of the emailed confirm/reset link. Exchanges the link's code (PKCE) or token_hash
 * for a session cookie, then sends the student straight in instead of back to the login form.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const base = request.nextUrl.origin;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  if (!ok) {
    // Expired/used link, or opened in a different browser than the one that signed up.
    return NextResponse.redirect(`${base}/login?verified=failed`);
  }
  const fallback = type === "recovery" ? "/reset-password" : "/dashboard/profile";
  return NextResponse.redirect(`${base}${safeNext(searchParams.get("next"), fallback)}`);
}
