import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { PasswordResetForm } from "@/components/student/PasswordResetForm";
import { Skeleton } from "@/components/ui/skeleton";
import { RECOVERY_COOKIE } from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

/** The recovery session is validated on the server: the emailed link must have produced both the marker cookie and a live session. */
async function ResetBody() {
  const jar = await cookies();
  const fromRecoveryLink = jar.get(RECOVERY_COOKIE)?.value === "1";
  let ready = false;
  if (fromRecoveryLink) {
    const { data } = await (await createClient()).auth.getUser();
    ready = !!data.user;
  }
  return <PasswordResetForm mode="update" ready={ready} />;
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <h1 className="text-3xl font-extrabold">Choose a new password</h1>
      <p className="mb-8 mt-1 text-muted-foreground">Open this page from the link in your reset email, then set a new password.</p>
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <ResetBody />
      </Suspense>
    </div>
  );
}
