/**
 * End-to-end checks of the student workflow against a TEST Supabase stack
 * (badge progress, review flow, certificates, verification, access control).
 *
 *   TEST_SUPABASE_URL=http://127.0.0.1:54321 \
 *   TEST_SUPABASE_ANON_KEY=... TEST_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/verify-workflow.ts
 *
 * Uses its own variables on purpose (not .env.local) so it can never hit production by accident.
 * It refuses non-local URLs unless ALLOW_REMOTE_TEST=1. Everything it creates is removed at the end.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url) && process.env.ALLOW_REMOTE_TEST !== "1") {
  console.error(`Refusing to run against ${url}: not a local stack. Set ALLOW_REMOTE_TEST=1 to override.`);
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const mk = (key: string) => createClient(url, key, opts);
const service = mk(serviceKey);

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  checks++;
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

const run = Date.now().toString(36);
const createdUsers: string[] = [];
let classId: string | null = null;

async function newUser(email: string, password: string, meta?: Record<string, string>) {
  const c = mk(anonKey!);
  const { data, error } = await c.auth.signUp({ email, password, options: { data: meta } });
  if (error || !data.user) throw new Error(`signUp ${email}: ${error?.message}`);
  createdUsers.push(data.user.id);
  const login = await c.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error(`signIn ${email}: ${login.error.message}`);
  return { client: c, id: data.user.id };
}

const evidence = [{ url: "https://res.cloudinary.com/test/image/upload/test.png", public_id: "student-journey/evidence/test" }];
const proj = (title: string, extra: Record<string, unknown> = {}) => ({ title, type: "mini", stack: ["react"], attachments: evidence, ...extra });

async function progress(c: SupabaseClient) {
  const { data, error } = await c.rpc("my_progress");
  if (error) throw new Error(error.message);
  return data as { level: string; name: string; counted: number; required: number; percent: number; state: string; position: number; certificate_eligible: boolean }[];
}

async function main() {
  console.log(`Workflow checks against ${url} (run ${run})`);

  // ---- admin ----
  const adminEmail = `admin-${run}@example.test`;
  const adminPw = `Pw-${run}-Admin!1`;
  const a = await newUser(adminEmail, adminPw);
  await service.from("admin_users").insert({ user_id: a.id });
  const admin = a.client;
  check("admin registration through the student form does not create a student row", (await service.from("students").select("id").eq("user_id", a.id)).data?.length === 0);

  const { data: cls, error: clsErr } = await admin.from("classes").insert({ name: `Test class ${run}` }).select().single();
  check("admin can create a class", !!cls && !clsErr, clsErr);
  classId = cls?.id ?? null;
  const { data: batch } = await admin.from("batches").insert({ class_id: classId, name: `Batch ${run}` }).select().single();
  const { data: closed } = await admin.from("batches").insert({ class_id: classId, name: `Closed ${run}`, is_active: false }).select().single();
  check("admin can create a batch", !!batch);
  const { data: task } = await admin.from("tasks").insert({ class_id: classId, batch_id: batch!.id, title: "Build a landing page" }).select().single();
  check("admin can create a task", !!task);

  const { data: rules } = await admin.from("badge_definitions").select("*").order("position");
  check("10 badge rules configured, 3 projects each by default", rules?.length === 10 && rules.every((r) => r.required_projects === 3));
  check("lowest badge (Bronze) is not certificate-eligible by default", rules?.[0]?.level === "Bronze" && rules[0].certificate_eligible === false && rules[1].certificate_eligible === true);

  // ---- student registration ----
  const email = `student-${run}@example.test`;
  const s = await newUser(email, `Pw-${run}-Stu!1`, { registration: "student", full_name: `Test Student ${run}` });
  const sc = s.client;
  const { data: me } = await sc.from("students").select("*").eq("user_id", s.id).single();
  check("registration creates a student row", !!me);
  check("new student has no badge", me?.badge === null, me?.badge);
  check("new student profile is incomplete", me?.profile_completed_at === null);
  const { data: sp0 } = await sc.from("student_private").select("email");
  check("student cannot read private contact table", (sp0 ?? []).length === 0);
  let p = await progress(sc);
  check("new student: all 10 badges locked at 0%", p.length === 10 && p.every((x) => x.state === "locked" && x.counted === 0 && x.percent === 0), p.map((x) => x.state));
  check("new student: no verified progress, achievements or certificates",
    ((await sc.from("student_badges").select("*")).data ?? []).length === 0 && ((await sc.from("certificates").select("*")).data ?? []).length === 0);
  check("new student is hidden from the public board until the profile is complete",
    ((await mk(anonKey!).from("students").select("id").eq("id", me!.id)).data ?? []).length === 0);

  // ---- prerequisites ----
  let r = await sc.rpc("submit_project", { p: proj("Too early") });
  check("cannot submit before completing profile/enrolment", !!r.error, r.error?.message);
  r = await sc.rpc("update_my_profile", { p: { name: `Test Student ${run}`, track: "Web", batch_id: closed!.id } });
  check("cannot enrol in an inactive batch", !!r.error, r.error?.message);
  r = await sc.rpc("update_my_profile", { p: { name: `Test Student ${run}`, track: "Web", batch_id: batch!.id, skills: ["react"] } });
  check("profile completion succeeds", !r.error, r.error?.message);
  p = await progress(sc);
  check("after enrolment only the first badge is active", p[0].state === "active" && p.slice(1).every((x) => x.state === "locked"), p.map((x) => x.state));
  check("student sees their own task but is not an admin", ((await sc.from("tasks").select("id")).data ?? []).length === 1);

  // ---- evidence required, pending does not count ----
  r = await sc.rpc("submit_project", { p: proj("No evidence", { attachments: [] }) });
  check("submission without evidence is rejected", !!r.error, r.error?.message);
  const sub = async (title: string, extra: Record<string, unknown> = {}) => {
    const res = await sc.rpc("submit_project", { p: proj(title, extra) });
    return { id: res.data as string, error: res.error };
  };
  const p1 = await sub("Project One", { link: "https://example.com/one" });
  check("valid submission is accepted as pending", !p1.error && !!p1.id, p1.error?.message);
  p = await progress(sc);
  check("pending submission does not increase progress", p[0].counted === 0 && p[0].percent === 0);
  const dupTitle = await sub("  project one ");
  check("duplicate title is rejected", dupTitle.error?.code === "23505", dupTitle.error);
  const dupLink = await sub("Different title", { link: "https://example.com/one" });
  check("duplicate link is rejected", dupLink.error?.code === "23505", dupLink.error);

  // ---- access control on direct API requests ----
  const direct = await sc.from("submissions").insert({ student_id: me!.id, title: "Cheat", attachments: evidence, status: "approved" });
  check("student cannot insert an approved submission directly", !!direct.error, direct.error?.message);
  const upd = await sc.from("submissions").update({ status: "approved" }).eq("id", p1.id).select();
  check("student cannot approve their own submission", (upd.data ?? []).length === 0);
  const bd = await sc.from("students").update({ badge: "Legend" }).eq("id", me!.id).select();
  check("student cannot edit their own badge", (bd.data ?? []).length === 0);
  const sb = await sc.from("student_badges").insert({ student_id: me!.id, badge_id: rules![0].id });
  check("student cannot unlock a badge directly", !!sb.error, sb.error?.message);
  const ce = await sc.from("certificates").insert({ certificate_number: "CERT-FAKE", student_id: me!.id, badge_id: rules![1].id, student_name: "x", badge_name: "x", verified_projects: 3 });
  check("student cannot create a certificate directly", !!ce.error, ce.error?.message);
  const rv = await sc.rpc("review_item", { p_kind: "submission", p_id: p1.id, p_decision: "approved", p_feedback: null });
  check("student cannot call the admin review function", !!rv.error, rv.error?.message);
  const br = await sc.rpc("save_badge_rules", { rules: [] });
  check("student cannot change badge rules", !!br.error, br.error?.message);
  const ins = await sc.from("admin_users").insert({ user_id: s.id });
  check("student cannot make themselves admin", !!ins.error, ins.error?.message);
  const anon = mk(anonKey!);
  check("anonymous users cannot read submissions", ((await anon.from("submissions").select("id")).data ?? []).length === 0);
  check("anonymous users cannot read certificates table", ((await anon.from("certificates").select("id")).data ?? []).length === 0);
  check("anonymous users cannot call student RPCs", !!(await anon.rpc("submit_project", { p: proj("x") })).error);
  check("anonymous users cannot call internal sync function", !!(await anon.rpc("_sync_student_progress", { p_student: me!.id, p_allow_revoke: false })).error);
  check("student cannot call internal sync function", !!(await sc.rpc("_sync_student_progress", { p_student: me!.id, p_allow_revoke: false })).error);
  const other = await newUser(`other-${run}@example.test`, `Pw-${run}-Oth!1`, { registration: "student", full_name: "Other" });
  check("another student cannot read my submissions", ((await other.client.from("submissions").select("id").eq("id", p1.id)).data ?? []).length === 0);
  check("another student has an empty progress state", (await progress(other.client)).every((x) => x.counted === 0));

  // ---- rejection + resubmission ----
  let rr = await admin.rpc("review_item", { p_kind: "submission", p_id: p1.id, p_decision: "rejected", p_feedback: "" });
  check("rejecting requires feedback", !!rr.error, rr.error?.message);
  rr = await admin.rpc("review_item", { p_kind: "submission", p_id: p1.id, p_decision: "rejected", p_feedback: "Screenshots are unreadable" });
  check("admin can reject with feedback", !rr.error, rr.error?.message);
  p = await progress(sc);
  check("rejected submission does not count", p[0].counted === 0);
  const seen = await sc.from("submissions").select("status, feedback").eq("id", p1.id).single();
  check("student sees rejection feedback", seen.data?.status === "rejected" && seen.data.feedback === "Screenshots are unreadable");
  const reuse = await sub("Project One", { link: "https://example.com/one" });
  check("rejected title may be reused by a new submission", !reuse.error, reuse.error?.message);
  const rs = await sc.rpc("resubmit_project", { p_id: p1.id, p: proj("Project One v2") });
  check("rejected submission can be resubmitted", !rs.error, rs.error?.message);
  const rs2 = await sc.rpc("resubmit_project", { p_id: p1.id, p: proj("Project One v3") });
  check("a pending submission cannot be resubmitted", !!rs2.error, rs2.error?.message);

  // ---- badge progression: 1/3, 2/3, 3/3 ----
  const { data: pend } = await admin.from("submissions").select("id").eq("student_id", me!.id).eq("status", "pending");
  check("two pending submissions (v2 + reused)", pend?.length === 2);
  const approve = (id: string) => admin.rpc("review_item", { p_kind: "submission", p_id: id, p_decision: "approved", p_feedback: "Well done" });
  check("approve #1", !(await approve(pend![0].id)).error);
  p = await progress(sc);
  check("1 approved: 33% and badge still active", p[0].counted === 1 && p[0].percent === 33 && p[0].state === "active", p[0]);
  check("1 approved: public student record has no badge yet", (await service.from("students").select("badge").eq("id", me!.id).single()).data?.badge === null);
  check("approve #2", !(await approve(pend![1].id)).error);
  p = await progress(sc);
  check("2 approved: 67%", p[0].counted === 2 && p[0].percent === 67 && p[0].state === "active", p[0]);
  const p3 = await sub("Project Three");
  check("approve #3", !(await approve(p3.id)).error);
  p = await progress(sc);
  check("3 approved: first badge 100% and completed", p[0].percent === 100 && p[0].state === "completed", p[0]);
  check("next badge becomes active at 0%", p[1].state === "active" && p[1].counted === 0, p[1]);
  check("student badge column follows the earned badge", (await service.from("students").select("badge").eq("id", me!.id).single()).data?.badge === "Bronze");
  check("achievement is persisted", ((await sc.from("student_badges").select("*")).data ?? []).length === 1);
  check("no certificate for the non-eligible first badge", ((await sc.from("certificates").select("*")).data ?? []).length === 0);

  // ---- second badge -> certificate ----
  const ids: string[] = [];
  for (const t of ["Silver A", "Silver B", "Silver C"]) {
    const x = await sub(t);
    ids.push(x.id);
    if (t !== "Silver C") await approve(x.id);
  }
  p = await progress(sc);
  check("silver at 2/3 is 67%", p[1].counted === 2 && p[1].percent === 67);
  check("no certificate before the badge is complete", ((await sc.from("certificates").select("*")).data ?? []).length === 0);
  await approve(ids[2]);
  p = await progress(sc);
  check("silver completed, gold active", p[1].state === "completed" && p[2].state === "active", p.slice(0, 3).map((x) => x.state));
  const { data: certs } = await sc.from("certificates").select("*");
  check("certificate issued for the eligible badge", certs?.length === 1 && certs[0].badge_name === "Silver" && certs[0].verified_projects === 3, certs);
  const num = certs![0].certificate_number as string;
  const ver = await anon.rpc("verify_certificate", { p_number: num });
  check("public verification returns a valid certificate", ver.data?.[0]?.valid === true && ver.data[0].student_name === `Test Student ${run}`, ver.data);
  check("verification exposes no email/ids", !JSON.stringify(ver.data).includes("@") && !("student_id" in (ver.data?.[0] ?? {})) && !("id" in (ver.data?.[0] ?? {})));
  check("unknown certificate number is not found", ((await anon.rpc("verify_certificate", { p_number: "CERT-0000-NOPE" })).data ?? []).length === 0);
  check("another student cannot read my certificate", ((await other.client.from("certificates").select("*")).data ?? []).length === 0);
  check("public board now shows the student with their badge", (await anon.from("students").select("badge").eq("id", me!.id).single()).data?.badge === "Silver");
  const pub = await anon.from("public_student_projects").select("*").eq("student_id", me!.id);
  check("approved projects are public, without evidence/feedback", (pub.data?.length ?? 0) === 6 && !("attachments" in (pub.data?.[0] ?? {})) && !("feedback" in (pub.data?.[0] ?? {})), pub.data?.length);

  // ---- withdrawn approval revokes ----
  await admin.rpc("review_item", { p_kind: "submission", p_id: ids[2], p_decision: "rejected", p_feedback: "Plagiarised" });
  const v2 = await anon.rpc("verify_certificate", { p_number: num });
  check("withdrawing an approval revokes the certificate", v2.data?.[0]?.valid === false, v2.data);
  p = await progress(sc);
  check("withdrawing an approval reopens the badge", p[1].state === "active" && p[1].counted === 2, p[1]);
  await admin.rpc("review_item", { p_kind: "submission", p_id: ids[2], p_decision: "approved", p_feedback: null });
  check("re-approval reinstates the same certificate", (await anon.rpc("verify_certificate", { p_number: num })).data?.[0]?.valid === true);

  // ---- configurable rules ----
  const cfg = rules!.map((x) => ({ level: x.level, name: x.name, position: x.position, required_projects: x.level === "Gold" ? 1 : x.required_projects, certificate_eligible: x.certificate_eligible, is_active: true }));
  check("admin can change required project count", !(await admin.rpc("save_badge_rules", { rules: cfg })).error);
  const g = await sub("Gold A");
  await approve(g.id);
  p = await progress(sc);
  check("custom rule: gold (1 required) completes with one project", p[2].state === "completed" && p[2].percent === 100, p[2]);
  const swapped = cfg.map((x) => (x.level === "Silver" ? { ...x, position: 3 } : x.level === "Gold" ? { ...x, position: 2 } : x));
  check("admin can reorder badges in one save", !(await admin.rpc("save_badge_rules", { rules: swapped })).error);
  check("student cannot change badge rules (second check)", !!(await sc.rpc("save_badge_rules", { rules: swapped })).error);

  // ---- daily reports ----
  const rep = await sc.rpc("submit_daily_report", { p: { summary: "Learned RLS", hours_spent: 4, attachments: [] } });
  check("daily report submitted", !rep.error, rep.error?.message);
  check("only one report per day", !!(await sc.rpc("submit_daily_report", { p: { summary: "again" } })).error);
  check("future-dated report rejected", !!(await sc.rpc("submit_daily_report", { p: { summary: "x", report_date: "2999-01-01" } })).error);
  const rid = rep.data as string;
  check("admin rejects report with feedback", !(await admin.rpc("review_item", { p_kind: "report", p_id: rid, p_decision: "rejected", p_feedback: "Add detail" })).error);
  check("rejected report can be resubmitted for the same day", !(await sc.rpc("submit_daily_report", { p: { summary: "More detail" } })).error);
  check("student cannot approve a report", ((await sc.from("daily_reports").update({ status: "approved" }).eq("id", rid).select()).data ?? []).length === 0);
  check("reports do not change badge progress", (await progress(sc))[0].counted === 3);

  // ---- branding ----
  check("anyone can read organisation branding", !!(await anon.from("organization_settings").select("org_name").single()).data?.org_name);
  check("student cannot edit branding", ((await sc.from("organization_settings").update({ org_name: "Hacked" }).eq("id", true).select()).data ?? []).length === 0);
  check("admin can edit branding", ((await admin.from("organization_settings").update({ tagline: `t-${run}` }).eq("id", true).select()).data ?? []).length === 1);

  // ---- deleting a student also removes the login ----
  const del = await admin.from("students").delete().eq("id", me!.id);
  check("admin can delete a student", !del.error, del.error?.message);
  const gone = await service.auth.admin.getUserById(s.id);
  check("deleting a student removes their login", !gone.data.user);
}

async function cleanup() {
  console.log("Cleaning up test records...");
  // restore the default ladder (a test changed it)
  const defaults: Record<string, number> = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4, Diamond: 5, Obsidian: 6, Crystal: 7, Titanium: 8, Master: 9, Legend: 10 };
  // positions are unique per statement here (service-role updates are not batched), so move out of the way first
  const levels = Object.keys(defaults);
  for (let i = 0; i < levels.length; i++) await service.from("badge_definitions").update({ position: 1000 + i }).eq("level", levels[i]);
  for (const [level, position] of Object.entries(defaults)) {
    await service.from("badge_definitions").update({ position, required_projects: 3, certificate_eligible: level !== "Bronze", is_active: true, name: level }).eq("level", level);
  }
  await service.from("organization_settings").update({ tagline: null }).eq("id", true);
  if (classId) await service.from("classes").delete().eq("id", classId); // cascades batches + tasks
  for (const id of createdUsers) {
    await service.from("admin_users").delete().eq("user_id", id);
    await service.auth.admin.deleteUser(id); // cascades the student row and everything under it
  }
}

main()
  .catch((e) => {
    failures++;
    console.error("Unexpected error:", e);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
    console.log(`\n${checks - failures}/${checks} checks passed`);
    process.exit(failures ? 1 : 0);
  });
