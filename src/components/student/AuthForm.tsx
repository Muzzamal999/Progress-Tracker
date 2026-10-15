"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const name = String(f.get("name") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address");
    if (mode === "register") {
      if (!name) return setError("Enter your full name");
      if (password.length < 8) return setError("Password must be at least 8 characters");
      if (password !== String(f.get("confirm") ?? "")) return setError("Passwords do not match");
    } else if (!password) return setError("Enter your password");

    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === "register") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { registration: "student", full_name: name }, emailRedirectTo: `${location.origin}/login` },
        });
        if (err) return setError(err.message.toLowerCase().includes("signups not allowed") ? "Registration is currently closed. Contact your administrator." : err.message);
        if (data.session) {
          router.replace("/dashboard/profile");
          router.refresh();
        } else {
          setNotice("Almost there. Check your email and confirm your address, then sign in.");
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err || !data.user) return setError("Invalid email or password");
        const { data: me } = await supabase.from("students").select("id").eq("user_id", data.user.id).maybeSingle();
        if (me) {
          router.replace("/dashboard");
        } else {
          const { data: adm } = await supabase.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
          if (adm) router.replace("/admin");
          else {
            await supabase.auth.signOut();
            return setError("No student profile is linked to this account");
          }
        }
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (notice) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-6 text-center shadow-(--shadow-card)">
        <p className="font-semibold">{notice}</p>
        <Button asChild className="mt-4"><Link href="/login">Go to sign in</Link></Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "register" && (
        <Field id="name" label="Full name"><Input id="name" name="name" autoComplete="name" maxLength={120} required /></Field>
      )}
      <Field id="email" label="Email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field id="password" label="Password" hint={mode === "register" ? "At least 8 characters." : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required />
      </Field>
      {mode === "register" && (
        <Field id="confirm" label="Confirm password"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}</Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "register" ? (
          <>Already registered? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></>
        ) : (
          <>New here? <Link href="/register" className="font-medium text-primary hover:underline">Create a student account</Link></>
        )}
      </p>
    </form>
  );
}
