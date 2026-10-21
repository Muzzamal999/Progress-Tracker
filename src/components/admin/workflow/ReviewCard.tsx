"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { StatusPill } from "@/components/ui/field";
import { PdfViewer } from "@/components/PdfViewer";
import { ReviewActions } from "@/components/admin/workflow/ReviewActions";
import type { Attachment, PdfDoc, ReviewStatus } from "@/lib/workflow-types";

export interface ReviewItem {
  kind: "submission" | "report";
  id: string;
  studentName: string;
  studentId?: string;
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
  const file = (which: string | number, download = false) => `/api/submissions/${item.id}/file?which=${which}${download ? "&download=1" : ""}`;
  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-(--shadow-card)">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.studentId ? <Link href={`/admin/students/${item.studentId}`} className="hover:underline">{item.studentName}</Link> : item.studentName} · {item.meta}
          </p>
          <h3 className="mt-0.5 text-lg font-bold">
            {item.kind === "submission" ? <Link href={`/admin/projects/${item.id}`} className="hover:underline">{item.title}</Link> : item.title}
          </h3>
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
          {item.attachments.map((a, i) => (
            <a key={a.public_id} href={item.kind === "submission" ? file(i) : a.url} target="_blank" rel="noopener noreferrer" aria-label={`Open evidence image ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.kind === "submission" ? file(i) : a.url} alt={`Evidence ${i + 1}`} className="h-24 w-32 rounded-lg border border-border object-cover" />
            </a>
          ))}
        </div>
      )}
      {item.labReport && <div className="mt-3"><PdfViewer pdf={item.labReport} label="Lab report (PDF)" openHref={file("lab")} downloadHref={file("lab", true)} /></div>}
      {item.feedback && <p className="mt-3 rounded-lg bg-secondary p-2 text-sm"><span className="font-medium">Feedback:</span> {item.feedback}</p>}
      <div className="mt-4"><ReviewActions kind={item.kind} id={item.id} status={item.status} title={item.title} /></div>
    </li>
  );
}
