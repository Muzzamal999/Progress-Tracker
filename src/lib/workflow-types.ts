import type { BadgeLevel, ProjectType } from "./types";

export type ReviewStatus = "pending" | "approved" | "rejected";
export interface Attachment {
  url: string;
  public_id: string;
}

/** A PDF uploaded through Cloudinary (stored with its page count so the viewer can render every page). */
export interface PdfDoc {
  url: string;
  public_id: string;
  name: string;
  pages: number;
  bytes: number;
}

export interface BadgeProgress {
  badge_id: string;
  level: BadgeLevel;
  name: string;
  position: number;
  required: number;
  certificate_eligible: boolean;
  counted: number;
  percent: number;
  state: "completed" | "active" | "locked";
  unlocked_at: string | null;
}

export interface SubmissionRow {
  id: string;
  student_id: string;
  task_id: string | null;
  title: string;
  description: string | null;
  type: ProjectType;
  stack: string[];
  link: string | null;
  attachments: Attachment[];
  lab_report: PdfDoc | null;
  status: ReviewStatus;
  feedback: string | null;
  reviewed_at: string | null;
  resubmit_count: number;
  submitted_at: string;
}

export interface ReportRow {
  id: string;
  student_id: string;
  report_date: string;
  summary: string;
  hours_spent: number | null;
  blockers: string | null;
  attachments: Attachment[];
  status: ReviewStatus;
  feedback: string | null;
  submitted_at: string;
}

export interface ClassRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}
export interface BatchRow {
  id: string;
  class_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
}
export interface TaskRow {
  id: string;
  class_id: string;
  batch_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  is_active: boolean;
}
export interface ManualRow {
  id: string;
  class_id: string;
  batch_id: string | null;
  title: string;
  description: string | null;
  body: string | null;
  images: Attachment[];
  pdf: PdfDoc | null;
  created_at: string;
}
export interface BadgeRule {
  id: string;
  level: BadgeLevel;
  name: string;
  position: number;
  required_projects: number;
  certificate_eligible: boolean;
  is_active: boolean;
}
export type CertificateType = "skill" | "completion";
export interface CertificateRow {
  id: string;
  certificate_number: string;
  certificate_type: CertificateType;
  student_id: string;
  student_name: string;
  badge_name: string | null;
  verified_projects: number;
  batch_id: string | null;
  program_name: string | null;
  batch_name: string | null;
  started_on: string | null;
  completed_on: string | null;
  issued_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}
export interface OrgSettings {
  org_name: string;
  tagline: string | null;
  logo_url: string | null;
  logo_public_id: string | null;
  accent_color: string;
  secondary_color: string;
  signatory_name: string | null;
  signatory_title: string | null;
  certificate_footer: string | null;
}
// ===== class exchange (anonymous provider/acceptor communication portal) =====
export type ExchangeStatus = "draft" | "open" | "closed";
export type ExchangeRole = "provider" | "acceptor";
export type ConnectionStatus = "pending" | "active" | "rejected" | "ended";
export interface ExchangeLink {
  label: string;
  url: string;
}
export interface ExchangeRow {
  id: string;
  title: string;
  description: string | null;
  status: ExchangeStatus;
  is_anonymous: boolean;
  requires_approval: boolean;
  max_connections_per_acceptor: number | null;
  max_connections_per_provider: number | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
}
export interface ExchangeParticipantRow {
  exchange_id: string;
  student_id: string;
  role: ExchangeRole;
  reveal_identity: boolean | null;
  added_at: string;
}
export interface ExchangeListingRow {
  id: string;
  exchange_id: string;
  provider_student_id: string;
  project_name: string;
  description: string | null;
  links: ExchangeLink[];
  pdf: PdfDoc | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface ExchangeConnectionRow {
  id: string;
  exchange_id: string;
  listing_id: string | null;
  provider_student_id: string;
  acceptor_student_id: string;
  status: ConnectionStatus;
  requested_at: string;
  decided_at: string | null;
  ended_at: string | null;
  ended_reason: string | null;
}
export interface ExchangeMessageRow {
  id: string;
  connection_id: string;
  sender_student_id: string;
  body: string;
  created_at: string;
}

export const DEFAULT_ORG: OrgSettings = {
  org_name: "DOONKHAV Technologies",
  tagline: null,
  logo_url: null,
  logo_public_id: null,
  accent_color: "#0B2D4A",
  secondary_color: "#D5A33B",
  signatory_name: null,
  signatory_title: null,
  certificate_footer: null,
};
