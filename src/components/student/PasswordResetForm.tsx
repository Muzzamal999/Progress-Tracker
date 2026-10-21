"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url";
import { updatePasswordAction } from "@/app/actions/auth";
import { MIN_PASSWORD_LENGTH, passwordStrength, validatePassword } from "@/lib/password";
import { cn } from "@/lib/utils";

const STRENGTH = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
const BAR = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-green-500", "bg-green-600"] as const;

/**
 * mode "request": ask for a reset email.
 * mode "update": set a new password. `ready` is decided on the SERVER (recovery cookie + valid session),
 * the browser never decides whether a link is valid.
 */
export function PasswordResetForm({ mode, ready = true }: { mode: "request" | "update"; ready?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);

    if (mode === "request") {
      const email = String(f.get("email") ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address");
      setBusy(true);
      try {
        const { error: err } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/reset-password` });
        if (err && (err.code === "over_email_send_rate_limit" || err.status === 429)) return setError("Please wait a minute before requesting another link.");
        // Same message whether or not the account exists (or the send failed), so emails cannot be probed.
        setNotice("If an account exists for that email, a reset link is on its way. Check your inbox (and spam). The link works once and expires soon.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const confirm = String(f.get("confirm") ?? "");
    const problem = validatePassword(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      const res = await updatePasswordAction({ password, confirm });
      if (!res.ok) return setError(res.error);
      setNotice("Password updated. Sign in with your new password.");
    } finally {
      setBusy(false);
    }
  }

  if (notice) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-6 text-center shadow-(--shadow-card)">
        <p className="font-semibold">{notice}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild><Link href="/login" onClick={() => router.refresh()}>Student sign in</Link></Button>
          {mode === "update" && <Button asChild variant="outline"><Link href="/admin/login">Admin sign in</Link></Button>}
        </div>
      </div>
    );
  }

  if (mode === "update" && !ready) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-6 text-center shadow-(--shadow-card)">
        <p className="font-semibold">This reset link is invalid or has expired.</p>
        <p className="mt-1 text-sm text-muted-foreground">Reset links work once and expire after a short time. Request a new one to continue.</p>
        <Button asChild className="mt-4"><Link href="/forgot-password">Request a new link</Link></Button>
      </div>
    );
  }

  const strength = passwordStrength(password);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "request" ? (
        <Field id="email" label="Email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      ) : (
        <>
          <Field id="password" label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="strength" />
          </Field>
          {password && (
            <div id="strength" aria-live="polite">
              <div className="flex gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full bg-border", i <= strength && BAR[strength])} />)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Strength: {STRENGTH[strength]}</p>
            </div>
          )}
          <Field id="confirm" label="Confirm new password">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait..." : mode === "request" ? "Send reset link" : "Update password"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}
