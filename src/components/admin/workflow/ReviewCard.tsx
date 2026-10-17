"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { reviewAction } from "@/app/actions/admin-workflow";
import { PdfViewer } from "@/components/PdfViewer";
import type { Attachment, PdfDoc, ReviewStatus } from "@/lib/workflow-types";

export interface ReviewItem {
  kind: "submission" | "report";
  id: string;
  studentName: string;
  title: string;
  meta: string;
  body: string | null;
  link: string | null;
  attachments: Attachment[];
  labReport?: PdfDoc | null;
  status: ReviewStatus;
  feedback: string | null;
}

export function ReviewCard({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    const res = await reviewAction({ kind: item.kind, id: item.id, decision, feedback });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(decision === "approved" ? "Approved" : "Rejected with feedback");
    setRejecting(false);
    setFeedback("");
    router.refresh();
  }

  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.studentName} · {item.meta}</p>
          <h3 className="mt-0.5 text-lg font-bold">{item.title}</h3>
        </div>
        <StatusPill status={item.status} />
      </div>
      {item.body && <p className="mt-3 whitespace-pre-wrap text-sm">{item.body}</p>}
      {item.link && (
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> {item.link}
        </a>
      )}
      {item.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.attachments.map((a) => (
            <a key={a.public_id} href={a.url} target="_blank" rel="noopener noreferrer" aria-label="Open evidence image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="Evidence" className="h-24 w-32 rounded-lg border border-border object-cover" />
            </a>
          ))}
        </div>
      )}
      {item.labReport && <div className="mt-3"><PdfViewer pdf={item.labReport} label="Lab report (PDF)" /></div>}
      {item.feedback && <p className="mt-3 rounded-lg bg-secondary p-2 text-sm"><span className="font-medium">Feedback:</span> {item.feedback}</p>}

      {rejecting && (
        <div className="mt-4 space-y-2">
          <label htmlFor={`fb-${item.id}`} className="text-sm font-medium">Feedback for the student (required)</label>
          <Textarea id={`fb-${item.id}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} autoFocus />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {item.status !== "approved" && <Button size="sm" disabled={busy} onClick={() => decide("approved")}><Check /> Approve</Button>}
        {item.status !== "rejected" && !rejecting && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}><X /> {item.status === "approved" ? "Withdraw approval" : "Reject"}</Button>}
        {rejecting && (
          <>
            <Button size="sm" variant="destructive" disabled={busy || !feedback.trim()} onClick={() => decide("rejected")}>Confirm rejection</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
          </>
        )}
      </div>
    </li>
  );
}
