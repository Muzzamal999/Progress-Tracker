"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { issueCompletionCertificateAction } from "@/app/actions/admin-workflow";

/** Admin-triggered: the business rule for "batch complete" is a human judgement call, not a date or formula. */
export function IssueCompletionCertificateButton({
  studentId,
  batchId,
  batchName,
  alreadyIssued,
}: {
  studentId: string;
  batchId: string;
  batchName: string;
  alreadyIssued: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!confirm(`${alreadyIssued ? "Re-issue" : "Issue"} a program completion certificate for "${batchName}"?`)) return;
    setBusy(true);
    const res = await issueCompletionCertificateAction(studentId, batchId);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(alreadyIssued ? "Completion certificate re-issued" : "Completion certificate issued");
    router.refresh();
  }

  return (
    <Button size="sm" variant={alreadyIssued ? "outline" : "default"} disabled={busy} onClick={onClick}>
      <Award /> {busy ? "Issuing..." : alreadyIssued ? "Re-issue completion certificate" : `Mark "${batchName}" complete`}
    </Button>
  );
}
