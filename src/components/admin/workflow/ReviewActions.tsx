"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { reviewAction } from "@/app/actions/admin-workflow";
import type { ReviewStatus } from "@/lib/workflow-types";

/**
 * Approve / reject controls for one project or daily report. Approving asks for confirmation (it changes the
 * student's badge progress); rejecting requires written feedback, which the student sees.
 */
export function ReviewActions({ kind, id, status, title, size = "sm" }: { kind: "submission" | "report"; id: string; status: ReviewStatus; title: string; size?: "sm" | "default" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    const res = await reviewAction({ kind, id, decision, feedback });
    setBusy(false);
    if (!res.ok) {
      setConfirmApprove(false);
      return setError(res.error);
    }
    toast.success(decision === "approved" ? "Approved" : "Rejected with feedback");
    setRejecting(false);
    setConfirmApprove(false);
    setFeedback("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {rejecting && (
        <div className="space-y-2">
          <label htmlFor={`fb-${id}`} className="text-sm font-medium">Feedback for the student (required)</label>
          <Textarea id={`fb-${id}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} autoFocus />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {status !== "approved" && <Button size={size} disabled={busy} onClick={() => setConfirmApprove(true)}><Check /> Approve</Button>}
        {status !== "rejected" && !rejecting && <Button size={size} variant="outline" disabled={busy} onClick={() => setRejecting(true)}><X /> {status === "approved" ? "Withdraw approval" : "Reject"}</Button>}
        {rejecting && (
          <>
            <Button size={size} variant="destructive" disabled={busy || !feedback.trim()} onClick={() => decide("rejected")}>{status === "approved" ? "Confirm withdrawal" : "Confirm rejection"}</Button>
            <Button size={size} variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
          </>
        )}
      </div>
      <AlertDialog open={confirmApprove} onOpenChange={(o) => !o && !busy && setConfirmApprove(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "submission" ? "This project will count towards the student's badge progress exactly once. You can withdraw the approval later." : "The student will see this report as approved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void decide("approved"); }}>{busy ? "Approving..." : "Approve"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
