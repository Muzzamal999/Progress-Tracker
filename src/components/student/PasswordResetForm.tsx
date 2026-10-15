"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url";

/** mode "request": ask for a reset email. mode "update": set a new password from the emailed link. */
export function PasswordResetForm({ mode }: { mode: "request" | "update" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // null = still checking whether the emailed link produced a recovery session
  const [ready, setReady] = useState<boolean | null>(mode === "update" ? null : true);

  useEffect(() => {
    if (mode !== "update") return;
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    // The link's code is exchanged automatically; give it a moment before declaring the link invalid.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setReady(!!data.session);
    }, 1500);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [mode]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const supabase = createClient();

    if (mode === "request") {
      const email = String(f.get("email") ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address");
      setBusy(true);
      try {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/reset-password` });
        if (err) return setError(err.message);
        // Same message whether or not the account exists, so emails cannot be probed.
        setNotice("If an account exists for that email, a reset link is on its way. Check your inbox (and spam).");
      } finally {
        setBusy(false);
      }
      return;
    }

    const password = String(f.get("password") ?? "");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== String(f.get("confirm") ?? "")) return setError("Passwords do not match");
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) return setError(err.message);
      await supabase.auth.signOut();
      setNotice("Password updated. Sign in with your new password.");
    } finally {
      setBusy(false);
    }
  }

  if (notice) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-6 text-center shadow-(--shadow-card)">
        <p className="font-semibold">{notice}</p>
        <Button asChild className="mt-4"><Link href="/login" onClick={() => router.refresh()}>Go to sign in</Link></Button>
      </div>
    );
  }

  if (mode === "update" && ready === false) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-6 text-center shadow-(--shadow-card)">
        <p className="font-semibold">This reset link is invalid or has expired.</p>
        <Button asChild className="mt-4"><Link href="/forgot-password">Request a new link</Link></Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "request" ? (
        <Field id="email" label="Email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      ) : (
        <>
          <Field id="password" label="New password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field id="confirm" label="Confirm new password">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || ready === null}>
        {busy ? "Please wait..." : mode === "request" ? "Send reset link" : "Update password"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}
