import { BADGE_ORDER, TRACKS, type BadgeLevel, type Student, type Track } from "./types";
import { badgeRank } from "./badges";

/** First letters of the first two words, upper-cased. Safe for empty names and extra spaces. */
export function getInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join("")
    .toUpperCase();
}

/** Lower-case, hyphenated, ASCII-only. Returns "student" if nothing usable remains. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "student";
}

/** Picks `base`, or `base-2`, `base-3`... given the slugs already taken. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Collapse whitespace, drop empties, de-duplicate case-insensitively (first casing wins). */
export function normalizeList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.replace(/\s+/g, " ").trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function splitCommaList(value: string): string[] {
  return normalizeList(value.split(","));
}

export type SortKey = "name" | "badge" | "track" | "projects";
export const SORT_KEYS: SortKey[] = ["name", "badge", "track", "projects"];

export interface Filters {
  q: string;
  track: string; // "" = all
  badge: string; // "" = all
  sort: SortKey;
}

export const isSortKey = (v: string | null): v is SortKey =>
  !!v && (SORT_KEYS as string[]).includes(v);

export function filterAndSort(students: Student[], f: Filters): Student[] {
  const q = f.q.trim().toLowerCase();
  const list = students.filter((s) => {
    if (q) {
      const hit =
        s.name.toLowerCase().includes(q) ||
        s.skills.some((k) => k.toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (f.track && s.track !== f.track) return false;
    if (f.badge && s.badge !== f.badge) return false;
    return true;
  });
  const byName = (a: Student, b: Student) => a.name.localeCompare(b.name);
  return list.sort((a, b) => {
    switch (f.sort) {
      case "badge":
        return badgeRank(b.badge) - badgeRank(a.badge) || byName(a, b);
      case "track":
        return a.track.localeCompare(b.track) || byName(a, b);
      case "projects":
        return b.projects.length - a.projects.length || byName(a, b);
      default:
        return byName(a, b);
    }
  });
}

/** Track options that exist in the data, in the canonical order. */
export function availableTracks(students: Student[]): Track[] {
  const present = new Set(students.map((s) => s.track));
  return TRACKS.filter((t) => present.has(t));
}

/** Badge options that exist in the data, sorted by badge order. */
export function availableBadges(students: Student[]): BadgeLevel[] {
  const present = new Set(students.map((s) => s.badge).filter(Boolean));
  return BADGE_ORDER.filter((b) => present.has(b));
}

export const TRACK_COLORS: Record<Track, string> = {
  Web: "text-blue-600 dark:text-blue-400",
  Android: "text-green-600 dark:text-green-400",
  Backend: "text-purple-600 dark:text-purple-400",
  Frontend: "text-pink-600 dark:text-pink-400",
};
// // Text colours are the -600 shades (the -400 shades of the dark theme are too faint on white).
// A new track added to the enum falls back to a neutral colour until it is mapped above.
export const trackColor = (t: string) =>
  (TRACK_COLORS as Record<string, string>)[t] ?? "text-muted-foreground";

export const PROJECT_TYPE_CHIP: Record<string, string> = {
  mini: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
  intermediate: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  real: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
};
