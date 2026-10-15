import type { Metadata } from "next";
import { PasswordResetForm } from "@/components/student/PasswordResetForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <h1 className="text-3xl font-extrabold">Choose a new password</h1>
      <p className="mb-8 mt-1 text-muted-foreground">Open this page from the link in your reset email, then set a new password.</p>
      <PasswordResetForm mode="update" />
    </div>
  );
}
