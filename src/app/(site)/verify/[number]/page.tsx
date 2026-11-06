import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BadgeCheck, ShieldX } from "lucide-react";
import { createAnonClient } from "@/lib/supabase/anon";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Verify certificate", robots: { index: false, follow: false } };

interface Result {
  certificate_number: string;
  certificate_type: "skill" | "completion";
  student_name: string;
  badge_name: string | null;
  verified_projects: number;
  program_name: string | null;
  batch_name: string | null;
  completed_on: string | null;
  issued_at: string;
  valid: boolean;
  revoked_at: string | null;
  org_name: string;
}

async function Verification({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  let row: Result | null = null;
  let failed = false;
  if (/^[A-Za-z0-9-]{6,40}$/.test(number)) {
    const { data, error } = await createAnonClient().rpc("verify_certificate", { p_number: number });
    if (error) failed = true;
    else row = ((data ?? []) as Result[])[0] ?? null;
  }

  if (failed) {
    return <Card tone="warn" title="Verification is temporarily unavailable" body="We could not reach the certificate records. Please try again in a moment." />;
  }
  if (!row) {
    return <Card tone="bad" title="Certificate not found" body={`No certificate matches the number "${number.slice(0, 40)}". Check the number or scan the QR code on the certificate again.`} />;
  }
  if (!row.valid) {
    return <Card tone="bad" title="This certificate is no longer valid" body={`Certificate ${row.certificate_number} issued by ${row.org_name} was revoked on ${new Date(row.revoked_at!).toLocaleDateString("en-GB")}.`} />;
  }
  return (
    <div className="rounded-2xl border border-green-500/40 bg-card p-6 shadow-(--shadow-card) sm:p-8">
      <div className="flex items-center gap-3">
        <BadgeCheck className="h-9 w-9 text-green-600 dark:text-green-400" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-extrabold">Valid certificate</h1>
          <p className="text-sm text-muted-foreground">Issued by {row.org_name}</p>
        </div>
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {(row.certificate_type === "completion"
          ? [
              ["Awarded to", row.student_name],
              ["Program completed", row.batch_name],
              ["Class", row.program_name],
              ["Completed", row.completed_on ? new Date(row.completed_on).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null],
              ["Issued", new Date(row.issued_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })],
              ["Certificate number", row.certificate_number],
            ]
          : [
              ["Awarded to", row.student_name],
              ["Achievement level", row.badge_name],
              ["Verified projects", `${row.verified_projects} Admin-approved`],
              ["Issued", new Date(row.issued_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })],
              ["Certificate number", row.certificate_number],
            ]
        ).filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Card({ tone, title, body }: { tone: "bad" | "warn"; title: string; body: string }) {
  return (
    <div className={`rounded-2xl border bg-card p-6 shadow-(--shadow-card) ${tone === "bad" ? "border-red-500/40" : "border-amber-500/40"}`} role="alert">
      <ShieldX className={`h-9 w-9 ${tone === "bad" ? "text-red-600 dark:text-red-400" : "text-amber-600"}`} aria-hidden="true" />
      <h1 className="mt-3 text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{body}</p>
    </div>
  );
}

export default function VerifyPage({ params }: { params: Promise<{ number: string }> }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-14">
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Verification params={params} />
      </Suspense>
      <Link href="/" className="mt-6 inline-block text-sm text-muted-foreground hover:text-foreground">Back to the website</Link>
    </div>
  );
}
