import type { Metadata } from "next";
import { AuthForm } from "@/components/student/AuthForm";

export const metadata: Metadata = { title: "Student login" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <h1 className="text-3xl font-extrabold">Student login</h1>
      <p className="mb-8 mt-1 text-muted-foreground">Sign in to submit work and track your badges.</p>
      <AuthForm mode="login" />
    </div>
  );
}
