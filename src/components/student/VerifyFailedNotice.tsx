"use client";

import { useSearchParams } from "next/navigation";

/** Shown when an emailed confirm/reset link failed in /auth/callback (it redirects to /login?verified=failed). */
export function VerifyFailedNotice() {
  if (useSearchParams().get("verified") !== "failed") return null;
  return (
    <p role="alert" className="mb-4 rounded-xl border border-border bg-card p-4 text-sm">
      That email link is invalid or has expired. If you already confirmed your email, sign in below; otherwise sign in to get a new confirmation email.
    </p>
  );
}
