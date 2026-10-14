import { BADGE_ORDER, type BadgeLevel } from "./types";

export const badgeRank = (b: BadgeLevel) => BADGE_ORDER.indexOf(b);

/** Short descriptions used by the legend sidebar. */
export const LEGEND_DESCRIPTIONS: Record<BadgeLevel, string> = {
  Bronze: "First step",
  Silver: "Mini projects",
  Gold: "Intermediate projects (guided)",
  Platinum: "Intermediate projects (independent)",
  Diamond: "Real projects with seniors",
  Obsidian: "Real project solo (heavy)",
  Crystal: "Different tech stack",
  Titanium: "Microservices & advanced architecture",
  Master: "Big projects with scaling & performance",
  Legend: "Master of 3-4 tech stacks + system design",
};

export interface BadgeDescription {
  level: BadgeLevel;
  title: string;
  criteria: [string, string, string];
}

/*
 * PLACEHOLDER COPY. The brief asks for the original text from Badges.tsx to be
 * copied verbatim. That file was not available, so the wording below is
 * provisional and must be replaced. Titles and criteria only live here.
 */
export const BADGE_DESCRIPTIONS: BadgeDescription[] = [
  { level: "Bronze", title: "Getting Started", criteria: ["Joined the programme and set up the dev environment", "Completed the onboarding tasks", "Picked a learning track"] },
  { level: "Silver", title: "Building Foundations", criteria: ["Completed 2-3 beginner modules", "Shipped at least one mini project", "Can explain the basics of the chosen stack"] },
  { level: "Gold", title: "Guided Builder", criteria: ["Built an intermediate project with mentor guidance", "Used version control with meaningful commits", "Handled mentor code-review feedback"] },
  { level: "Platinum", title: "Independent Builder", criteria: ["Built an intermediate project without guidance", "Wrote clean, structured code", "Debugged problems independently"] },
  { level: "Diamond", title: "Team Contributor", criteria: ["Contributed to a real project with senior developers", "Followed a team workflow (branches, PRs, reviews)", "Delivered assigned features on time"] },
  { level: "Obsidian", title: "Solo Professional", criteria: ["Delivered a heavy real project solo", "Handled design, build and deployment", "Documented the work for others"] },
  { level: "Crystal", title: "Stack Explorer", criteria: ["Built a project in a different tech stack", "Compared trade-offs between stacks", "Shipped it to production"] },
  { level: "Titanium", title: "Architect", criteria: ["Designed and built a microservices-based system", "Applied advanced architecture patterns", "Set up monitoring and CI/CD"] },
  { level: "Master", title: "Scale Specialist", criteria: ["Delivered a large project with scaling needs", "Profiled and improved performance", "Mentored other students"] },
  { level: "Legend", title: "Full-Spectrum Expert", criteria: ["Mastered 3-4 tech stacks", "Can design systems end to end", "Recognised as a leader in the community"] },
];
