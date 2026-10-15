import type { Metadata } from "next";
import { AuthForm } from "@/components/student/AuthForm";

export const metadata: Metadata = { title: "Create a student account" };

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <h1 className="text-3xl font-extrabold">Create your student account</h1>
      <p className="mb-8 mt-1 text-muted-foreground">After signing up you will complete your profile and choose your batch. You start with zero progress and earn each badge by getting projects approved.</p>
      <AuthForm mode="register" />
    </div>
  );
}
