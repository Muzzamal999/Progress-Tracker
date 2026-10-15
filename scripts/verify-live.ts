/**
 * Live checks against the real Supabase project (RLS, admin RPC, atomicity).
 *   npx tsx scripts/verify-live.ts
 * Needs .env.local with the anon key, service-role key and TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD.
 * Creates and removes its own temporary records and one temporary non-admin user.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const mk = (key: string) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

async function count(c: SupabaseClient, table: string) {
  const { count: n, error } = await c.from(table).select("*", { count: "exact", head: true });
  return { n: n ?? 0, error };
}

async function main() {
  const anon = mk(anonKey);
  const svc = mk(svcKey);
  const stamp = Date.now();

  console.log("== Anonymous (public) access ==");
  const pubStudents = await count(anon, "students");
  check("anon can read students (public columns)", !pubStudents.error, `count=${pubStudents.n} ${pubStudents.error?.message ?? ""}`);
  const pubProjects = await count(anon, "projects");
  check("anon can read projects", !pubProjects.error);
  const svcPrivate = await count(svc, "student_private");
  const anonPrivate = await count(anon, "student_private");
  check("student_private is readable by the service role", !svcPrivate.error, `count=${svcPrivate.n}`);
  check("anon sees ZERO student_private rows", anonPrivate.n === 0 && !anonPrivate.error, `count=${anonPrivate.n} ${anonPrivate.error?.message ?? ""}`);
  // After migration 0003 anon may only read public columns, so `select *` must be refused (no email, no auth user id).
  const emailLeak = await anon.from("students").select("*").limit(1);
  check("anon cannot select all columns of students (no email / user_id leak)", !!emailLeak.error || !emailLeak.data?.[0] || (!("email" in emailLeak.data[0]) && !("user_id" in emailLeak.data[0])));
  const anonAdmins = await count(anon, "admin_users");
  check("anon sees zero admin_users", anonAdmins.n === 0);

  const before = await svc.from("students").select("id,name").order("id");
  const ins = await anon.from("students").insert({ slug: `x-${stamp}`, name: "Hacker" });
  check("anon INSERT students is rejected", !!ins.error, "insert succeeded!");
  await anon.from("students").update({ name: "Hacked" }).neq("slug", "");
  await anon.from("students").delete().neq("slug", "");
  await anon.from("projects").delete().neq("title", "");
  const after = await svc.from("students").select("id,name").order("id");
  check("anon UPDATE/DELETE changed nothing", JSON.stringify(before.data) === JSON.stringify(after.data));
  const anonRpc = await anon.rpc("save_student", { student: { name: "X", slug: `y-${stamp}`, track: "Web", badge: "Bronze", skills: [] }, projects: [] });
  check("anon cannot call save_student", !!anonRpc.error, "rpc succeeded!");

  console.log("\n== Signed-in NON-admin user ==");
  const naEmail = `non-admin-${stamp}@example.com`;
  const naPass = `Na-${stamp}-pw`;
  const created = await svc.auth.admin.createUser({ email: naEmail, password: naPass, email_confirm: true });
  const naId = created.data.user?.id;
  check("created temporary non-admin user", !!naId, created.error?.message);
  const na = mk(anonKey);
  const naLogin = await na.auth.signInWithPassword({ email: naEmail, password: naPass });
  check("non-admin can sign in to Supabase", !naLogin.error, naLogin.error?.message);
  const naRow = await na.from("admin_users").select("user_id");
  check("non-admin is NOT in admin_users", (naRow.data ?? []).length === 0);
  const naIns = await na.from("students").insert({ slug: `na-${stamp}`, name: "Nope" });
  check("non-admin INSERT rejected", !!naIns.error, "insert succeeded!");
  const naRpc = await na.rpc("save_student", { student: { name: "X", slug: `na2-${stamp}`, track: "Web", badge: "Bronze", skills: [] }, projects: [] });
  check("non-admin save_student rejected", !!naRpc.error, "rpc succeeded!");
  const naPriv = await count(na, "student_private");
  check("non-admin sees zero student_private rows", naPriv.n === 0);
  if (naId) await svc.auth.admin.deleteUser(naId);

  console.log("\n== Admin ==");
  const admin = mk(anonKey);
  const login = await admin.auth.signInWithPassword({ email: process.env.TEST_ADMIN_EMAIL!, password: process.env.TEST_ADMIN_PASSWORD! });
  check("admin signs in", !login.error, login.error?.message);
  const adminRow = await admin.from("admin_users").select("user_id");
  check("admin is in admin_users", (adminRow.data ?? []).length === 1);
  const adminPriv = await count(admin, "student_private");
  check("admin can read student_private", adminPriv.n > 0, `count=${adminPriv.n}`);

  const email = `Verify-${stamp}@Example.com`;
  const slug = `verify-${stamp}`;
  const proj = (title: string, type = "mini") => ({ title, type, solo: true, stack: ["A", "B"], link: null });
  const created1 = await admin.rpc("save_student", {
    student: { slug, name: "Verify Person", email, track: "Backend", badge: "Gold", skills: ["Go", "SQL"], image_url: null, image_public_id: null },
    projects: [proj("P1"), proj("P2", "real"), proj("P3", "intermediate")],
  });
  const sid = created1.data as string;
  check("admin create via save_student", !created1.error && !!sid, created1.error?.message);

  const read1 = await admin.from("students").select("slug,name,track,badge,skills,projects(title,position),student_private(email)").eq("id", sid).single();
  const r1 = read1.data as unknown as { slug: string; projects: { title: string; position: number }[]; student_private: { email: string } | null } | null;
  check("created record has 3 projects in order", JSON.stringify(r1?.projects.sort((a, b) => a.position - b.position).map((p) => p.title)) === '["P1","P2","P3"]');
  check("email stored in student_private", r1?.student_private?.email === email);
  const anonSees = await anon.from("students").select("id").eq("id", sid);
  check("new student is publicly visible", (anonSees.data ?? []).length === 1);

  const dup = await admin.rpc("save_student", {
    student: { slug: `dup-${stamp}`, name: "Dup", email: email.toLowerCase(), track: "Web", badge: "Bronze", skills: [] },
    projects: [proj("D1")],
  });
  check("duplicate email (different case) rejected (23505)", dup.error?.code === "23505", JSON.stringify(dup.error));
  const dupLeft = await svc.from("students").select("id").eq("slug", `dup-${stamp}`);
  check("failed create left no half-saved student", (dupLeft.data ?? []).length === 0);

  const upd = await admin.rpc("save_student", {
    student: { id: sid, slug: "SHOULD-BE-IGNORED", name: "Verify Renamed", email: null, track: "Web", badge: "Master", skills: ["Rust"] },
    projects: [proj("Only")],
  });
  check("admin update via save_student", !upd.error, upd.error?.message);
  const read2 = await admin.from("students").select("slug,name,badge,projects(title),student_private(email)").eq("id", sid).single();
  const r2 = read2.data as unknown as { slug: string; name: string; badge: string; projects: unknown[]; student_private: unknown } | null;
  check("slug unchanged after rename", r2?.slug === slug && r2?.name === "Verify Renamed", JSON.stringify(r2));
  check("project list replaced (3 -> 1)", r2?.projects.length === 1);
  check("email removed when cleared", r2?.student_private == null);

  const bad = await admin.rpc("save_student", {
    student: { id: sid, name: "Should Roll Back", track: "Web", badge: "Legend", skills: [] },
    projects: [proj("Good1"), { title: "Bad", type: "NOT_A_TYPE", solo: true, stack: [], link: null }],
  });
  check("invalid project type rejected", !!bad.error);
  const read3 = await admin.from("students").select("name,badge,projects(title)").eq("id", sid).single();
  const r3 = read3.data as unknown as { name: string; badge: string; projects: { title: string }[] } | null;
  check("failed update rolled back atomically", r3?.name === "Verify Renamed" && r3?.badge === "Master" && r3?.projects.length === 1 && r3?.projects[0].title === "Only", JSON.stringify(r3));

  const del = await admin.from("students").delete().eq("id", sid);
  check("admin delete", !del.error, del.error?.message);
  const orphan = await svc.from("projects").select("id").eq("student_id", sid);
  check("projects cascade-deleted", (orphan.data ?? []).length === 0);

  // Student sign-ups are enabled on purpose since migration 0003 (students register themselves); admins are never created by sign-up.

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
