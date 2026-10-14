import type { BadgeLevel } from "./types";

export interface TipSection {
  from: BadgeLevel;
  to: BadgeLevel;
  title: string;
  description: string;
  steps: string[];
  focus: string[];
}

/*
 * PLACEHOLDER COPY. The brief asks for the original text from Tips.tsx to be
 * copied verbatim. That file was not available, so the wording below is
 * provisional and must be replaced.
 */
export const TIPS: TipSection[] = [
  { from: "Bronze", to: "Silver", title: "Start shipping small projects", description: "Move from setup to your first finished mini projects.", steps: ["Finish the beginner modules in your track", "Build and publish two mini projects", "Write a short README for each"], focus: ["Fundamentals", "Git basics", "Consistency"] },
  { from: "Silver", to: "Gold", title: "Take on a guided intermediate project", description: "Work with a mentor on something bigger than a mini project.", steps: ["Pick a project with a mentor", "Break it into milestones", "Ask for a review after each milestone"], focus: ["Project planning", "Code review", "Communication"] },
  { from: "Gold", to: "Platinum", title: "Go independent", description: "Repeat the intermediate level without hand-holding.", steps: ["Choose and scope a project yourself", "Make design decisions and justify them", "Debug using logs and docs first"], focus: ["Problem solving", "Self-direction", "Clean code"] },
  { from: "Platinum", to: "Diamond", title: "Join a real project", description: "Work on a real codebase alongside senior developers.", steps: ["Ask to join a live project", "Follow the team's Git workflow", "Deliver one feature end to end"], focus: ["Teamwork", "Pull requests", "Reading existing code"] },
  { from: "Diamond", to: "Obsidian", title: "Own a real project", description: "Deliver a substantial real project by yourself.", steps: ["Gather requirements", "Design, build and deploy it", "Write handover documentation"], focus: ["Ownership", "Deployment", "Documentation"] },
  { from: "Obsidian", to: "Crystal", title: "Learn a second stack", description: "Show that you can transfer skills to a new technology.", steps: ["Pick a stack you have not used", "Rebuild a familiar project in it", "Write down what was different"], focus: ["Adaptability", "Comparing tools", "Fast learning"] },
  { from: "Crystal", to: "Titanium", title: "Think in systems", description: "Learn to split a product into services and run it reliably.", steps: ["Design a service-based architecture", "Add CI/CD and monitoring", "Handle failure between services"], focus: ["Microservices", "Observability", "Architecture"] },
  { from: "Titanium", to: "Master", title: "Scale it", description: "Make large projects fast and dependable under load.", steps: ["Load-test your system", "Fix the top bottlenecks", "Mentor a junior on the project"], focus: ["Performance", "Scaling", "Mentoring"] },
  { from: "Master", to: "Legend", title: "Become full spectrum", description: "Combine breadth across stacks with system-design depth.", steps: ["Reach production quality in 3-4 stacks", "Lead a system design review", "Share knowledge publicly"], focus: ["System design", "Leadership", "Breadth"] },
];
