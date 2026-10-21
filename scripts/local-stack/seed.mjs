import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
// Seeds the THROWAWAY local stack only (see README.md in this folder). Never point this at a real project.
const k = JSON.parse(readFileSync(new URL("./keys.json", import.meta.url)));
const API = "http://127.0.0.1:54321/auth/v1";
const psql = (sql) => execFileSync("psql", ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql], { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" }).trim();
const PASSWORD = "Test-pass-1234";

async function adminUser(email, meta = {}) {
  const r = await fetch(`${API}/admin/users`, { method: "POST", headers: { apikey: k.service, Authorization: `Bearer ${k.service}`, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: meta }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${email}: ${JSON.stringify(j)}`);
  return j.id;
}
const adminId = await adminUser("admin@test.local");
psql(`insert into public.admin_users (user_id) values ('${adminId}')`);
for (const [email, name] of [["ayesha@test.local", "Ayesha Khan"], ["bilal@test.local", "Bilal Ahmed"], ["chaman@test.local", "Chaman Lal"]]) {
  await adminUser(email, { registration: "student", full_name: name });
}
psql(`insert into public.classes (id, name) values ('11111111-1111-4111-8111-111111111111', 'Web 101')`);
psql(`insert into public.batches (id, class_id, name) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Batch A')`);
psql(`insert into public.tasks (id, class_id, title) values ('33333333-3333-4333-8333-333333333331','11111111-1111-4111-8111-111111111111','Build a REST API'), ('33333333-3333-4333-8333-333333333332','11111111-1111-4111-8111-111111111111','Write tests')`);
psql(`update public.students set batch_id='22222222-2222-4222-8222-222222222222', profile_completed_at = now() - interval '10 days', track='Web' where user_id is not null`);
const att = `'[{"url":"https://res.cloudinary.com/demo/image/upload/v1/student-journey/evidence/a.png","public_id":"student-journey/evidence/a"}]'::jsonb`;
const lab = `'{"url":"https://res.cloudinary.com/demo/image/upload/v1/student-journey/lab-reports/a.pdf","public_id":"student-journey/lab-reports/a","name":"report.pdf","pages":2,"bytes":1000}'::jsonb`;
const sid = (n) => `(select id from public.students where name='${n}')`;
for (const [who, title, status] of [["Ayesha Khan", "Todo App", "pending"], ["Ayesha Khan", "Blog Engine", "pending"], ["Bilal Ahmed", "Weather Dashboard", "pending"]]) {
  psql(`insert into public.submissions (student_id, title, description, type, stack, attachments, lab_report, status) values (${sid(who)}, '${title}', 'A ${title} built for the course.', 'mini', '{react,node}', ${att}, ${lab}, '${status}')`);
}
psql(`insert into public.daily_reports (student_id, report_date, summary, hours_spent) values (${sid("Ayesha Khan")}, public.app_today(), 'Worked on the Todo App API and fixed bugs.', 5)`);
psql(`update public.organization_settings set reporting_days = '{1,2,3,4,5,6,7}'`); // every day counts, so results do not depend on the weekday the tests run
console.log("seeded; password for all accounts:", PASSWORD);
