import type { Metadata } from "next";
import { AuthForm } from "@/components/student/AuthForm";

export const metadata: Metadata = { title: "Student login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string }> }) {
  const { verified } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <h1 className="text-3xl font-extrabold">Student login</h1>
      <p className="mb-8 mt-1 text-muted-foreground">Sign in to submit work and track your badges.</p>
      {verified === "failed" && (
        <p role="alert" className="mb-4 rounded-xl border border-border bg-card p-4 text-sm">
          That email link is invalid or has expired. If you already confirmed your email, sign in below; otherwise sign in to get a new confirmation email.
        </p>
      )}
      <AuthForm mode="login" />
    </div>
  );
}
