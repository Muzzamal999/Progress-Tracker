import type { Metadata } from "next";
import { PasswordResetForm } from "@/components/student/PasswordResetForm";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <h1 className="text-3xl font-extrabold">Forgot your password?</h1>
      <p className="mb-8 mt-1 text-muted-foreground">Enter your account email and we will send you a link to choose a new password.</p>
      <PasswordResetForm mode="request" />
    </div>
  );
}
