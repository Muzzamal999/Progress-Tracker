import { formatPkt } from "./time";

export interface ReviewEvent {
  id: number;
  kind: "submission" | "report";
  item_id: string;
  from_status: "pending" | "approved" | "rejected" | null;
  to_status: "pending" | "approved" | "rejected";
  feedback: string | null;
  actor: string | null;
  title: string | null;
  snapshot: { title?: string; description?: string | null; link?: string | null; feedback?: string | null } | null;
  created_at: string;
}

/** One human-readable line per event, e.g. "Rejected" / "Resubmitted (original: “Todo app”)". */
export function describeEvent(e: ReviewEvent): string {
  if (e.from_status === null) return "Submitted";
  if (e.from_status === "rejected" && e.to_status === "pending") return `Resubmitted${e.snapshot?.title ? ` (previous version: “${e.snapshot.title}”)` : ""}`;
  if (e.to_status === "approved") return e.from_status === "rejected" ? "Approved (after rejection)" : "Approved";
  if (e.to_status === "rejected") return e.from_status === "approved" ? "Approval withdrawn" : "Rejected";
  return `Moved to ${e.to_status}`;
}
export const eventTime = (e: ReviewEvent) => formatPkt(e.created_at);
