import { z } from "zod";
import { BADGE_ORDER, PROJECT_TYPES, TRACKS } from "./types";
import { normalizeList } from "./student-utils";

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Enter a valid URL starting with http:// or https://")
  .refine((v) => {
    if (v === "") return true;
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid URL");

export const projectSchema = z
  .object({
  title: z.string().trim().max(120),
  type: z.enum(PROJECT_TYPES),
  solo: z.boolean(),
  stack: z.array(z.string().trim().max(40)).max(30).transform(normalizeList),
  link: optionalUrl,
  })
  .superRefine((p, ctx) => {
    // A completely empty block is just an unused row; a half-filled one needs a title.
    if (p.title === "" && (p.stack.length > 0 || p.link !== "")) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Project title is required" });
    }
  });

export const studentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address"),
  track: z.enum(TRACKS),
  badge: z.enum(BADGE_ORDER),
  skills: z.array(z.string().trim().max(40)).max(50).transform(normalizeList),
  projects: z
    .array(projectSchema)
    .max(50)
    .transform((list) => list.filter((p) => p.title !== "")),
});

/** Form values as typed by the user (before zod transforms). */
export type StudentFormInput = z.input<typeof studentSchema>;
export type StudentValues = z.output<typeof studentSchema>;

export const MAX_IMAGE_MB = 5;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
