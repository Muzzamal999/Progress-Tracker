import type { BadgeLevel, ProjectType } from "./types";

export type ReviewStatus = "pending" | "approved" | "rejected";
export interface Attachment {
  url: string;
  public_id: string;
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
export interface CertificateRow {
  id: string;
  certificate_number: string;
  student_id: string;
  student_name: string;
  badge_name: string;
  verified_projects: number;
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
  signatory_name: string | null;
  signatory_title: string | null;
  certificate_footer: string | null;
}
export const DEFAULT_ORG: OrgSettings = {
  org_name: "Student Journey Atlas",
  tagline: null,
  logo_url: null,
  logo_public_id: null,
  accent_color: "#4f46e5",
  signatory_name: null,
  signatory_title: null,
  certificate_footer: null,
};
