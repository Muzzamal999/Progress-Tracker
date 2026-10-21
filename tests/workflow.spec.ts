/**
 * End-to-end workflow tests: deadlines, server-side enforcement, reports/PDFs, project review, secure files,
 * password recovery, privacy and mobile layout. They need the THROWAWAY local stack:
 *   bash scripts/local-stack/up.sh   (then start `npm run dev` with the env it prints)
 *   E2E_LOCAL=1 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npx playwright test workflow
 * They are skipped unless E2E_LOCAL=1, and they refuse to run against anything but 127.0.0.1.
 */
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUN = process.env.E2E_LOCAL === "1";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PASSWORD = "Test-pass-1234";
const REAL_IMAGE = process.env.E2E_REAL_IMAGE_URL; // a public image on the configured Cloudinary cloud (optional)

test.skip(!RUN, "needs the local stack (E2E_LOCAL=1)");
test.describe.configure({ mode: "serial" });

const sql = (q: string) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", q], { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" }).trim();
const pktToday = (offsetDays = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + offsetDays * 86_400_000));

async function token(email: string, password = PASSWORD): Promise<string> {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(j)}`);
  return j.access_token;
}
const rest = (jwt: string, path: string, init: RequestInit = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "content-type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });

const payload = (title: string) => ({
  title, description: "d", type: "mini", stack: ["ts"],
  attachments: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/a.png", public_id: "student-journey/evidence/a" }],
  lab_report: { url: "https://res.cloudinary.com/demo/image/upload/v1/a.pdf", public_id: "student-journey/lab-reports/a", name: "r.pdf", pages: 1, bytes: 10 },
});

function pdfText(body: Buffer): string {
  const f = join(mkdtempSync(join(tmpdir(), "e2e-pdf-")), "r.pdf");
  writeFileSync(f, body);
  return spawnSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }).stdout;
}
async function loginStudent(page: Page, email: string, to = "/dashboard") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(to);
}
async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@test.local");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

let ctxAdmin: BrowserContext, ctxAyesha: BrowserContext, ctxBilal: BrowserContext;
let admin: Page, ayesha: Page, bilal: Page;
let ids: { ayesha: string; bilal: string; todo: string; blog: string; weather: string };

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  if (!RUN) return;
  expect(SUPA).toContain("127.0.0.1"); // never run these against a real project
  sql("delete from public.submission_deadlines; delete from public.audit_log; update public.organization_settings set submission_default_policy='open'");
  sql("update public.submissions set status='pending', feedback=null, reviewed_by=null, reviewed_at=null where title in ('Todo App','Blog Engine','Weather Dashboard')");
  sql("delete from public.submissions where title like 'E2E %'");
  if (REAL_IMAGE) sql(`update public.submissions set attachments = jsonb_build_array(jsonb_build_object('url','${REAL_IMAGE}','public_id','student-journey/evidence/real')) where title='Todo App'`);
  ids = {
    ayesha: sql("select id from public.students where name='Ayesha Khan'"),
    bilal: sql("select id from public.students where name='Bilal Ahmed'"),
    todo: sql("select id from public.submissions where title='Todo App'"),
    blog: sql("select id from public.submissions where title='Blog Engine'"),
    weather: sql("select id from public.submissions where title='Weather Dashboard'"),
  };
  [ctxAdmin, ctxAyesha, ctxBilal] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  [admin, ayesha, bilal] = await Promise.all([ctxAdmin.newPage(), ctxAyesha.newPage(), ctxBilal.newPage()]);
  await loginAdmin(admin);
  await loginStudent(ayesha, "ayesha@test.local");
  await loginStudent(bilal, "bilal@test.local");
});
test.afterAll(async () => {
  if (!RUN) return;
  await Promise.all([ctxAdmin?.close(), ctxAyesha?.close(), ctxBilal?.close()]);
});

// ---------------------------------------------------------------------------------------------------------------
test("with no deadline configured the default policy (open) applies and the admin sees that status", async () => {
  await ayesha.goto("/dashboard/projects");
  await expect(ayesha.getByText("No deadline has been set, so submissions are open.")).toBeVisible();
  await expect(ayesha.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  await admin.goto("/admin/deadlines");
  await expect(admin.getByText("Not configured: default policy (open) applies").first()).toBeVisible();
  await expect(admin.getByText("No deadlines configured yet")).toBeVisible();
});

test("admin dashboard summary cards show today's real numbers", async () => {
  await admin.goto("/admin");
  const card = (label: RegExp) => admin.getByRole("link", { name: label });
  await expect(card(/^3\s*Active students/)).toBeVisible();
  await expect(card(/^1\s*Daily reports submitted today/)).toBeVisible();
  await expect(card(/^2\s*Not submitted today/)).toBeVisible();
  await expect(card(/^3\s*Projects submitted today/)).toBeVisible();
  await expect(card(/^3\s*Awaiting review/)).toBeVisible();
  await expect(card(/^0\s*Approved today/)).toBeVisible();
  await expect(card(/^0\s*Open submission windows/)).toBeVisible();
  await expect(admin.getByRole("link", { name: "Profile" }).first()).toBeVisible(); // student profiles are reachable
});

test("admin creates an expired project deadline; the student is locked out with the clear message", async () => {
  await admin.goto("/admin/deadlines");
  await admin.getByRole("button", { name: "New deadline" }).click();
  await admin.getByLabel("Start date").fill("2020-01-01");
  await admin.getByLabel("Start time").fill("09:00");
  await admin.getByLabel("Closing date").fill("2020-01-02");
  await admin.getByLabel("Closing time").fill("17:00");
  await admin.getByRole("button", { name: "Create deadline" }).click();
  const row = admin.locator("tbody tr", { hasText: "Projects" }).first();
  await expect(row).toContainText("Closed");
  await expect(row).toContainText("All students");
  await expect(row).toContainText("02 Jan 2020");

  await ayesha.goto("/dashboard/projects");
  await expect(ayesha.getByText("Submission deadline has expired. Contact your administrator if an extension is required.").first()).toBeVisible();
  await expect(ayesha.getByRole("button", { name: "Submissions locked" })).toBeDisabled();
  await expect(ayesha.getByLabel("Project title")).toBeDisabled();
  // previously submitted work is still visible
  await expect(ayesha.getByText("Todo App")).toBeVisible();
  await ayesha.goto("/dashboard");
  await expect(ayesha.getByText("Projects: locked")).toBeVisible();
});

test("direct API calls cannot bypass the deadline or change another student's records", async () => {
  const jwt = await token("ayesha@test.local");
  const rpc = await rest(jwt, "rpc/submit_project", { method: "POST", body: JSON.stringify({ p: payload("E2E Sneaky") }) });
  expect(rpc.status).toBe(400);
  expect(((await rpc.json()) as { message: string }).message).toContain("Submission deadline has expired");

  const insert = await rest(jwt, "submissions", { method: "POST", body: JSON.stringify({ student_id: ids.ayesha, title: "E2E Direct", attachments: payload("x").attachments }) });
  expect(insert.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(await insert.json())).toContain("row-level security");

  const approve = await rest(jwt, `submissions?id=eq.${ids.todo}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
  expect(await approve.json()).toEqual([]); // no rows are updatable by the owner
  expect(sql(`select status from public.submissions where id='${ids.todo}'`)).toBe("pending");
  const edit = await rest(jwt, `submissions?id=eq.${ids.todo}`, { method: "PATCH", body: JSON.stringify({ title: "Hacked" }) });
  expect(await edit.json()).toEqual([]);

  const other = await rest(jwt, `submissions?student_id=eq.${ids.bilal}&select=id`);
  expect(await other.json()).toEqual([]);
  const steal = await rest(jwt, `submissions?id=eq.${ids.weather}`, { method: "PATCH", body: JSON.stringify({ title: "Stolen" }) });
  expect(await steal.json()).toEqual([]);
  const mkDeadline = await rest(jwt, "submission_deadlines", { method: "POST", body: JSON.stringify({ kind: "project", opens_at: "2030-01-01T00:00:00Z", closes_at: "2030-02-01T00:00:00Z" }) });
  expect(mkDeadline.status).toBeGreaterThanOrEqual(400);
  const readDeadlines = await rest(jwt, "submission_deadlines?select=id");
  expect(await readDeadlines.json()).toEqual([]);
  const reopen = await rest(jwt, "rpc/reopen_deadline", { method: "POST", body: JSON.stringify({ p_id: "00000000-0000-0000-0000-000000000000", p_closes_at: "2031-01-01T00:00:00Z", p_reason: "x" }) });
  expect(((await reopen.json()) as { message: string }).message).toContain("not authorized");
  const audit = await rest(jwt, "audit_log?select=id");
  expect(await audit.json()).toEqual([]);
});

test("admin reopens the deadline with a reason; submissions resume and the change is audited", async () => {
  await admin.goto("/admin/deadlines");
  const row = admin.locator("tbody tr", { hasText: "Projects" }).first();
  await row.getByRole("button", { name: "Reopen" }).click();
  await admin.getByLabel("New closing date").fill(pktToday(2));
  await admin.getByLabel("New closing time").fill("17:00");
  await admin.getByLabel("Reason (recorded in the history)").fill("Power outage on deadline day");
  await admin.getByRole("button", { name: "Reopen submissions" }).click();
  await expect(admin.locator("tbody tr", { hasText: "Projects" }).first()).toContainText("Open");
  await expect(admin.getByText("Reopened").first()).toBeVisible();
  await expect(admin.getByText("Reason: Power outage on deadline day").first()).toBeVisible();

  await ayesha.goto("/dashboard/projects");
  await expect(ayesha.getByText("Project deadline: open")).toBeVisible();
  await expect(ayesha.getByText(/Time left:/)).toBeVisible();
  await expect(ayesha.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  const jwt = await token("ayesha@test.local");
  const ok = await rest(jwt, "rpc/submit_project", { method: "POST", body: JSON.stringify({ p: payload("E2E Reopened Project") }) });
  expect(ok.status).toBe(200);
  await ayesha.reload();
  await expect(ayesha.getByText("E2E Reopened Project")).toBeVisible();
});

test("daily reports: who submitted and who is missing, from the active roster", async () => {
  await admin.goto(`/admin/reports?date=${pktToday()}`);
  const ayeshaRow = admin.locator("tbody tr", { hasText: "Ayesha Khan" });
  await expect(ayeshaRow).toContainText(/pending/i);
  await expect(admin.locator("tbody tr", { hasText: "Bilal Ahmed" })).toContainText("Missing");
  await expect(admin.locator("tbody tr", { hasText: "Chaman Lal" })).toContainText("Missing");
  await admin.goto(`/admin/reports?date=${pktToday()}&status=missing`);
  await expect(admin.locator("tbody tr")).toHaveCount(2);
  await admin.goto(`/admin/reports?date=${pktToday()}&status=submitted`);
  await expect(admin.locator("tbody tr")).toHaveCount(1);
  // a day with no report at all lists everybody as missing
  await admin.goto(`/admin/reports?date=${pktToday(-1)}&status=missing`);
  await expect(admin.locator("tbody tr")).toHaveCount(3);
});

test("PDF exports contain real records: daily (all / student / class / batch), summary and date range", async () => {
  const today = pktToday();
  const get = (q: string) => admin.request.get(`/api/admin/reports/pdf?${q}`);

  const all = await get(`type=daily&scope=all&date=${today}`);
  expect(all.status()).toBe(200);
  expect(all.headers()["content-type"]).toContain("application/pdf");
  expect(all.headers()["content-disposition"]).toContain(`daily-report_${today}_all.pdf`);
  const t = pdfText(await all.body());
  for (const s of ["Daily Progress Report", "Ayesha Khan", "Bilal Ahmed", "Chaman Lal", "Todo App", "Blog Engine", "Weather Dashboard", "E2E Reopened Project", "Daily report NOT submitted (2)", "Daily report submitted (1)", "Worked on the Todo App API and fixed bugs.", "Web 101 / Batch A", "Pending", "Page 1 of"]) {
    expect(t, `daily PDF should contain "${s}"`).toContain(s);
  }
  expect(t).toMatch(/Generated \d{2} \w{3} \d{4}/);

  const one = pdfText(await (await get(`type=daily&scope=student&id=${ids.ayesha}&date=${today}`)).body());
  expect(one).toContain("Daily Student Progress Report");
  expect(one).toContain("Todo App");
  expect(one).toContain("ayesha@test.local");
  expect(one).not.toContain("Bilal Ahmed");

  const cls = sql("select id from public.classes limit 1");
  const batch = sql("select id from public.batches limit 1");
  expect(pdfText(await (await get(`type=daily&scope=class&id=${cls}&date=${today}`)).body())).toContain("Class: Web 101");
  expect(pdfText(await (await get(`type=daily&scope=batch&id=${batch}&date=${today}`)).body())).toContain("Batch: Web 101 / Batch A");

  const range = pdfText(await (await get(`type=range&scope=all&from=${pktToday(-6)}&to=${today}`)).body());
  expect(range).toContain("Student Progress Report");
  expect(range).toMatch(/Ayesha Khan\s+Web 101 \/ Batch A\s+1\/7/);
  const summary = pdfText(await (await get(`type=summary&scope=all&from=${pktToday(-2)}&to=${today}`)).body());
  expect(summary).toContain("Daily Submission Summary");
  expect(summary).toContain("Missing (2)");

  expect((await get("type=daily&scope=all&date=not-a-date")).status()).toBe(400);
  expect((await get(`type=daily&scope=class&date=${today}`)).status()).toBe(400); // class needs an id
  expect((await get(`type=range&scope=all&from=2020-01-01&to=${today}`)).status()).toBe(400); // longer than 92 days
});

test("PDF export is admin-only; a student can download only their own daily report", async ({ playwright }) => {
  const today = pktToday();
  const anon: APIRequestContext = await playwright.request.newContext({ baseURL: "http://localhost:3000" });
  expect((await anon.get(`/api/admin/reports/pdf?type=daily&scope=all&date=${today}`)).status()).toBe(403);
  expect((await ayesha.request.get(`/api/admin/reports/pdf?type=daily&scope=all&date=${today}`)).status()).toBe(403);
  expect((await anon.get(`/api/reports/mine/pdf?date=${today}`)).status()).toBe(401);
  await anon.dispose();

  const mine = await ayesha.request.get(`/api/reports/mine/pdf?date=${today}`);
  expect(mine.status()).toBe(200);
  const text = pdfText(await mine.body());
  expect(text).toContain("Ayesha Khan");
  expect(text).not.toContain("Bilal Ahmed");
  expect((await bilal.request.get(`/api/reports/mine/pdf?date=${today}`)).status()).toBe(404); // Bilal has no report: cannot see Ayesha's
  await ayesha.goto("/dashboard/reports");
  await expect(ayesha.getByRole("link", { name: /Download the report for .* as PDF/ })).toBeVisible();
});

test("project review: filters, details, approve once, reject with feedback; progress and profile update", async () => {
  await admin.goto("/admin/projects?status=pending");
  await expect(admin.locator("tbody tr")).toHaveCount(4); // Todo, Blog, Weather + the E2E project
  await admin.goto("/admin/projects?status=pending&q=weather");
  await expect(admin.locator("tbody tr")).toHaveCount(1);
  await admin.goto(`/admin/projects?studentId=${ids.ayesha}`);
  await expect(admin.locator("tbody tr")).toHaveCount(3);
  await admin.goto(`/admin/projects?type=real`);
  await expect(admin.getByText("No projects match these filters")).toBeVisible();

  await admin.goto(`/admin/projects/${ids.todo}`);
  await expect(admin.getByRole("heading", { name: "Todo App" })).toBeVisible();
  await expect(admin.getByText("A Todo App built for the course.")).toBeVisible();
  await expect(admin.getByText("react", { exact: true })).toBeVisible();
  await expect(admin.getByText("Lab report (PDF)")).toBeVisible();
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByRole("alertdialog")).toContainText("count towards the student's badge progress exactly once");
  await admin.getByRole("alertdialog").getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Reviewer:")).toBeVisible();
  await expect(admin.getByText("admin@test.local").first()).toBeVisible();
  await expect(admin.getByRole("button", { name: "Approve" })).toHaveCount(0); // cannot be approved twice
  await expect(admin.getByRole("button", { name: "Withdraw approval" })).toBeVisible();
  await expect(admin.getByText("Submission and review history")).toBeVisible();

  // exactly once
  const adminJwt = await token("admin@test.local");
  const again = await rest(adminJwt, "rpc/review_item", { method: "POST", body: JSON.stringify({ p_kind: "submission", p_id: ids.todo, p_decision: "approved", p_feedback: null }) });
  expect(((await again.json()) as { message: string }).message).toContain("already in that state");
  const mine = await (await rest(await token("ayesha@test.local"), "rpc/my_progress")).json() as { state: string; counted: number }[];
  expect(mine.find((b) => b.state === "active")?.counted).toBe(1);

  // reject another one with feedback: it must NOT count
  await admin.goto(`/admin/projects/${ids.blog}`);
  await admin.getByRole("button", { name: "Reject" }).click();
  await expect(admin.getByRole("button", { name: "Confirm rejection" })).toBeDisabled(); // feedback is required
  await admin.getByLabel("Feedback for the student (required)").fill("Please add a README and tests.");
  await admin.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(admin.getByText("Please add a README and tests.").first()).toBeVisible();
  const after = await (await rest(await token("ayesha@test.local"), "rpc/my_progress")).json() as { state: string; counted: number }[];
  expect(after.find((b) => b.state === "active")?.counted).toBe(1);

  // admin profile shows the approved project and the progress
  await admin.goto(`/admin/students/${ids.ayesha}`);
  await expect(admin.getByRole("heading", { name: "Ayesha Khan" })).toBeVisible();
  const approvedTile = admin.locator("dl div", { hasText: /^1\s*Approved/ });
  await expect(approvedTile.first()).toBeVisible();
  await expect(admin.getByRole("link", { name: "Todo App" })).toBeVisible();
  await expect(admin.getByText("Bronze").first()).toBeVisible();
  await expect(admin.getByRole("link", { name: "Last 30 days progress" })).toBeVisible();
  await expect(admin.getByText("Task completion")).toBeVisible();

  // student sees status, feedback and updated progress
  await ayesha.goto("/dashboard");
  await expect(ayesha.locator("dl div", { hasText: /^1\s*Verified projects/ })).toBeVisible();
  await ayesha.goto("/dashboard/projects");
  await expect(ayesha.getByText("Admin feedback: Please add a README and tests.")).toBeVisible();
  await expect(ayesha.getByRole("button", { name: "Fix and resubmit" })).toBeVisible();
  await ayesha.getByText("Review history").first().click();
});

test("admins preview and download submitted files securely; others cannot", async ({ playwright }) => {
  const f = (id: string, q: string) => `/api/submissions/${id}/file?${q}`;
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:3000" });
  expect((await anon.get(f(ids.todo, "which=0"))).status()).toBe(401);
  await anon.dispose();
  expect((await bilal.request.get(f(ids.todo, "which=0"))).status()).toBe(404); // another student's file: invisible
  expect((await admin.request.get(f(ids.todo, "which=9"))).status()).toBe(400);
  expect((await admin.request.get(f("not-a-uuid", "which=0"))).status()).toBe(400);
  expect((await admin.request.get(f(ids.todo, "which=lab"))).status()).toBe(404); // seeded lab report is on a different cloud
  if (REAL_IMAGE) {
    // 502 = our route could not reach Cloudinary (a transient network problem in the test environment): retry
    let view = await admin.request.get(f(ids.todo, "which=0"));
    for (let i = 0; i < 4 && view.status() === 502; i++) {
      await admin.waitForTimeout(1500);
      view = await admin.request.get(f(ids.todo, "which=0"));
    }
    expect(view.status()).toBe(200);
    expect(view.headers()["content-type"]).toMatch(/^image\//);
    expect(view.headers()["content-disposition"]).toContain("inline");
    expect((await view.body()).length).toBeGreaterThan(1000);
    const dl = await admin.request.get(f(ids.todo, "which=0&download=1"));
    expect(dl.headers()["content-disposition"]).toContain("attachment");
    expect((await ayesha.request.get(f(ids.todo, "which=0"))).status()).toBe(200); // the owner can
  }
});

test("forgot password: generic confirmation, recovery link, strength rules, one-time use, expired link", async ({ page, playwright }) => {
  // request: same message for a known and an unknown address
  for (const email of ["ayesha@test.local", "nobody@test.local"]) {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists for that email");
  }
  // the redirect target sent to Supabase points at this origin's callback
  let recover = "";
  await page.route("**/auth/v1/recover**", (route) => { recover = route.request().url() + (route.request().postData() ?? ""); return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("ayesha@test.local");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(decodeURIComponent(recover)).toContain("http://localhost:3000/auth/callback?next=/reset-password");
  await page.unroute("**/auth/v1/recover**");

  // a real recovery token (admin generate_link stands in for the email)
  const service = JSON.parse(readFileSync("scripts/local-stack/keys.json", "utf8")).service as string;
  const gen = async () => {
    const r = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "content-type": "application/json" }, body: JSON.stringify({ type: "recovery", email: "chaman@test.local" }) });
    return ((await r.json()) as { hashed_token: string }).hashed_token;
  };
  const NEWPW = `Brand-new-${Date.now()}-x`; // unique per run: Supabase refuses to reuse the current password
  const hashed = await gen();
  await page.goto(`/auth/callback?token_hash=${hashed}&type=recovery&next=/reset-password`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill("short1");
  await page.getByLabel("Confirm new password").fill("short1");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("at least 8 characters");
  await page.getByLabel("New password", { exact: true }).fill("onlyletters");
  await page.getByLabel("Confirm new password").fill("onlyletters");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("one letter and one number");
  await page.getByLabel("New password", { exact: true }).fill(NEWPW);
  await page.getByLabel("Confirm new password").fill("Different-pass-77");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("do not match");
  await page.getByLabel("Confirm new password").fill(NEWPW);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await expect(page.getByRole("link", { name: "Student sign in" })).toBeVisible();

  // the new password works, the old one does not
  await token("chaman@test.local", NEWPW);
  await expect(token("chaman@test.local", PASSWORD)).rejects.toThrow();

  // the same link cannot be used twice
  await page.goto(`/auth/callback?token_hash=${hashed}&type=recovery&next=/reset-password`);
  await expect(page).toHaveURL(/\/reset-password\?error=invalid$/);
  await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  // garbage / expired-style links
  await page.goto("/auth/callback?code=garbage&next=/reset-password");
  await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
  await page.goto("/auth/callback?error=access_denied&error_code=otp_expired&next=/reset-password");
  await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
  await page.goto("/auth/callback?next=//evil.example.com");
  await expect(page).toHaveURL(/\/login\?verified=failed/); // never an open redirect

  // a normally signed-in session (no recovery link) cannot use the reset page or action
  await bilal.goto("/reset-password");
  await expect(bilal.getByText("This reset link is invalid or has expired.")).toBeVisible();
  void playwright;

  // login flows keep working
  sql("update auth.users set encrypted_password = encrypted_password where email='chaman@test.local'");
  await loginStudent(page, "ayesha@test.local");
  await expect(page.getByText("Signed in as")).toBeVisible();
});

test("layouts fit a 390px phone without horizontal scrolling", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await loginAdmin(p);
  for (const path of ["/admin", "/admin/deadlines", "/admin/reports", "/admin/projects", `/admin/projects/${ids.todo}`, `/admin/students/${ids.ayesha}`, "/admin/review"]) {
    await p.goto(path);
    await expect(p.locator("main h1").first()).toBeVisible();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sp = await sctx.newPage();
  await loginStudent(sp, "ayesha@test.local");
  for (const path of ["/dashboard", "/dashboard/projects", "/dashboard/reports"]) {
    await sp.goto(path);
    await expect(sp.getByRole("navigation", { name: "Student" })).toBeVisible();
    const overflow = await sp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await sctx.close();
});

test("admin routes stay protected and the legacy admin login still works", async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:3000", maxRedirects: 0 });
  for (const path of ["/admin/deadlines", "/admin/reports", "/admin/projects", `/admin/students/${ids.ayesha}`]) {
    const r = await anon.get(path);
    expect([302, 303, 307, 308], path).toContain(r.status());
    expect(r.headers().location).toContain("/admin/login");
  }
  await anon.dispose();
  // a student is not an admin
  await ayesha.goto("/admin/deadlines");
  await expect(ayesha).toHaveURL(/\/admin\/login/);
});
