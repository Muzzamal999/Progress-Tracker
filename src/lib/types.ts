export const TRACKS = ["Web", "Android", "Backend", "Frontend"] as const;
export type Track = (typeof TRACKS)[number];

export const BADGE_ORDER = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Obsidian",
  "Crystal",
  "Titanium",
  "Master",
  "Legend",
] as const;
export type BadgeLevel = (typeof BADGE_ORDER)[number];

export const PROJECT_TYPES = ["mini", "intermediate", "real"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface Project {
  id: string;
  title: string;
  type: ProjectType;
  solo: boolean;
  stack: string[];
  link: string | null;
  position: number;
}

/** Public shape. Deliberately has no email (emails are admin-only). */
export interface Student {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  track: Track;
  /** null until the student earns their first badge (registered students start with none). */
  badge: BadgeLevel | null;
  skills: string[];
  created_at: string;
  projects: Project[];
}

/** Admin shape: public fields plus the private email. */
export interface AdminStudent extends Student {
  email: string | null;
  image_public_id: string | null;
}
