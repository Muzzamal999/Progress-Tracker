/**
 * One-off migration: loads the old students.json into Supabase.
 *
 *   npx tsx scripts/seed.ts [path/to/students.json] [--include-junk] [--images-dir=path]
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env.local (remove it again afterwards).
 * Safe to re-run: students whose legacy_id already exists are skipped.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import { normalizeList, slugify, uniqueSlug } from "../src/lib/student-utils";

config({ path: ".env.local" });

interface OldProject {
  title: string;
  type: "mini" | "intermediate" | "real";
  solo: boolean;
  stack: string[];
  link: string | null;
}
interface OldStudent {
  id: string;
  name: string;
  email?: string | null;
  image?: string | null;
  track: string;
  badge: string;
  skills?: string[];
  projects?: OldProject[];
}

const JUNK_ID = "stu-001"; // test record: skipped unless --include-junk
const args = process.argv.slice(2);
const includeJunk = args.includes("--include-junk");
const imagesDir = args.find((a) => a.startsWith("--images-dir="))?.split("=")[1] ?? "public";
const jsonPath = args.find((a) => !a.startsWith("--")) ?? "src/data/students.json";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

async function main() {
  if (!existsSync(jsonPath)) throw new Error(`Cannot find ${jsonPath}. Pass the path to the old students.json.`);
  const old = JSON.parse(readFileSync(jsonPath, "utf8")) as OldStudent[];

  const supabase = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  // Cloudinary is only configured when a local image actually has to be uploaded.
  let cloudinaryReady = false;
  const ensureCloudinary = () => {
    if (cloudinaryReady) return;
    cloudinary.config({
      cloud_name: need("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"),
      api_key: need("NEXT_PUBLIC_CLOUDINARY_API_KEY"),
      api_secret: need("CLOUDINARY_API_SECRET"),
      secure: true,
    });
    cloudinaryReady = true;
  };

  const { data: existing, error: exErr } = await supabase.from("students").select("slug, legacy_id");
  if (exErr) throw exErr;
  const slugs = new Set((existing ?? []).map((r) => r.slug as string));
  const done = new Set((existing ?? []).map((r) => r.legacy_id as string | null).filter(Boolean));

  let created = 0;
  let skipped = 0;
  for (const s of old) {
    if (s.id === JUNK_ID && !includeJunk) {
      console.log(`skip ${s.id} (test record; use --include-junk to keep)`);
      skipped++;
      continue;
    }
    if (done.has(s.id)) {
      console.log(`skip ${s.id} (already imported)`);
      skipped++;
      continue;
    }

    const slug = uniqueSlug(slugify(s.name), slugs);
    slugs.add(slug);

    // Only local files are uploaded; expired remote URLs (e.g. the Facebook CDN one) fall back to initials.
    let imageUrl: string | null = null;
    let imagePublicId: string | null = null;
    if (s.image && s.image.startsWith("/")) {
      const file = path.join(imagesDir, s.image);
      if (existsSync(file)) {
        ensureCloudinary();
        const up = await cloudinary.uploader.upload(file, { folder: "student-journey/avatars" });
        imageUrl = up.secure_url;
        imagePublicId = up.public_id;
      } else {
        console.warn(`  image not found for ${s.id}: ${file}`);
      }
    }

    const { data: row, error } = await supabase
      .from("students")
      .insert({
        slug,
        legacy_id: s.id,
        name: s.name.trim(),
        image_url: imageUrl,
        image_public_id: imagePublicId,
        track: s.track,
        badge: s.badge,
        skills: normalizeList(s.skills ?? []),
      })
      .select("id")
      .single();
    if (error) throw new Error(`${s.id}: ${error.message}`);

    if (s.email?.trim()) {
      const { error: pe } = await supabase.from("student_private").insert({ student_id: row.id, email: s.email.trim() });
      if (pe) throw new Error(`${s.id} email: ${pe.message}`);
    }
    const projects = (s.projects ?? []).filter((p) => p.title?.trim()).map((p, i) => ({
      student_id: row.id,
      title: p.title.trim(),
      type: p.type,
      solo: p.solo,
      stack: normalizeList(p.stack ?? []),
      link: p.link || null,
      position: i,
    }));
    if (projects.length) {
      const { error: pr } = await supabase.from("projects").insert(projects);
      if (pr) throw new Error(`${s.id} projects: ${pr.message}`);
    }
    created++;
    console.log(`ok   ${s.id} -> /student/${slug}`);
  }
  console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
  console.log("Now remove SUPABASE_SERVICE_ROLE_KEY from .env.local and any shared environment.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
