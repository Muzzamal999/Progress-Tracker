import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CertificateActions } from "@/components/admin/workflow/CertificateActions";
import { EmptyState } from "@/components/ui/field";
import type { CertificateRow } from "@/lib/workflow-types";

export const metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("certificates").select("*").order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);
  const certs = data as CertificateRow[];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Certificates</h1>
        <p className="mt-1 text-muted-foreground">Skill certificates are issued automatically when a student completes a certificate-eligible badge. Program completion certificates are issued manually from a student&apos;s profile. Revoked certificates fail public verification.</p>
      </header>
      {certs.length === 0 ? (
        <EmptyState title="No certificates issued yet">They appear here once a student completes a certificate-eligible badge, or an admin issues a program completion certificate.</EmptyState>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-4">Student</th><th className="p-4">Type</th><th className="p-4">Achievement</th><th className="p-4">Number</th><th className="p-4">Issued</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id} className="border-b border-border/40 last:border-0">
                  <td className="p-4 font-medium">{c.student_name}</td>
                  <td className="p-4 capitalize">{c.certificate_type}</td>
                  <td className="p-4">{c.certificate_type === "completion" ? c.batch_name : c.badge_name}</td>
                  <td className="p-4"><Link className="text-primary hover:underline" href={`/verify/${c.certificate_number}`}>{c.certificate_number}</Link></td>
                  <td className="p-4">{new Date(c.issued_at).toLocaleDateString("en-GB")}</td>
                  <td className="p-4">{c.revoked_at ? <span className="text-destructive">Revoked</span> : "Valid"}</td>
                  <td className="p-4"><div className="flex gap-2"><CertificateActions id={c.id} revoked={!!c.revoked_at} />{!c.revoked_at && <a className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-secondary" href={`/api/certificates/${c.certificate_number}/pdf`}>PDF</a>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
