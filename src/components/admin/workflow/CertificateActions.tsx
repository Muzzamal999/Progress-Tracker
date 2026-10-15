"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setCertificateRevokedAction } from "@/app/actions/admin-workflow";

export function CertificateActions({ id, revoked }: { id: string; revoked: boolean }) {
  const router = useRouter();
  async function toggle() {
    let reason: string | undefined;
    if (!revoked) {
      const r = prompt("Reason for revoking this certificate (shown only to admins):");
      if (r === null) return;
      reason = r;
    }
    const res = await setCertificateRevokedAction(id, !revoked, reason);
    if (!res.ok) return toast.error(res.error);
    toast.success(revoked ? "Certificate restored" : "Certificate revoked");
    router.refresh();
  }
  return <Button size="sm" variant={revoked ? "outline" : "destructive"} onClick={toggle}>{revoked ? "Restore" : "Revoke"}</Button>;
}
