# Deadlines, daily reports, project review and password recovery

Everything below was added on top of the existing app (migrations 0001-0005 are untouched).

## Production rollout (Vercel + Supabase) - do these IN ORDER
1. **Back up** the production database (Supabase -> Database -> Backups, or `pg_dump`).
2. **Apply `supabase/migrations/0006_deadlines_reports_audit.sql` once**, as one transaction, BEFORE deploying the code:
   `psql "<prod connection string>" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/0006_deadlines_reports_audit.sql`
   (SQL editor: wrap in `begin; ... commit;`.) It is additive: no table dropped, no row deleted. It replaces three RPCs
   (`submit_project`, `resubmit_project`, `submit_daily_report`) and backfills review history from existing rows.
   Default behaviour is unchanged until an admin configures a deadline: with no deadline, submissions stay **open**.
3. **Supabase -> Authentication -> URL Configuration**
   - Site URL: your production URL (e.g. `https://your-app.vercel.app`)
   - Redirect URLs: `https://your-app.vercel.app/**`, `http://localhost:3000/**`, and the Vercel preview pattern `https://*-<team>.vercel.app/**`
4. **Supabase -> Authentication -> Email Templates -> Reset Password** (recommended; works in any browser, unlike the PKCE default):
   ```html
   <h2>Reset your password</h2>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Choose a new password</a></p>
   <p>The link works once and expires soon. If you did not ask for this, ignore this email.</p>
   ```
   (The default `{{ .ConfirmationURL }}` template also works: the app sends `redirectTo = <origin>/auth/callback?next=/reset-password`.)
   Keep "Secure password change" and email rate limits on; configure custom SMTP for production volume.
5. **Vercel env vars** (unchanged list): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (production URL),
   `NEXT_PUBLIC_CLOUDINARY_*`, `CLOUDINARY_API_SECRET`. **Do not** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel; nothing here uses it.
6. Deploy. Then in `/admin/deadlines` review the default policy (open/closed) and the reporting weekdays (default Mon-Fri).

Rollback: the migration only adds objects. To go back, redeploy the previous build; the old RPC bodies are in 0003-0005.

## Behaviour
- **Deadlines** (`/admin/deadlines`): types Projects, Tasks (all or one task), Daily reports, Lab reports; audience all / class / batch / student;
  start and closing date+time in Asia/Karachi. Status Scheduled / Open / Closed / Disabled (Disabled = switched off, not enforced).
  Window is `opens_at <= now < closes_at`. Most specific audience wins (student > batch > class > all; task-specific > generic); an open window beats a scheduled one.
  **Reopen** (new closing time + required reason) and **per-student extensions** are audited, as is every create/edit/deactivate/delete and policy change.
  A project submission needs the *project* (or *task*) window **and** the *lab report* window to be open (a lab-report PDF is part of every project).
- **Enforcement is in Postgres** (`_assert_window` inside the submit RPCs). Students have no write access to the tables, so direct API calls cannot bypass it.
  Student countdowns use the server time delivered with the page, not the device clock.
- **Default policy** when no deadline applies: `organization_settings.submission_default_policy` (`open` by default).
- **Daily reports**: link projects/tasks, admin review with feedback, missing = expected-and-absent from the active roster
  (registered, profile complete, active batch/class, reporting weekday, on/after enrolment, inside batch dates).
- **PDFs** (`/api/admin/reports/pdf`, admin only; students get only their own via `/api/reports/mine/pdf`): daily, submission summary, date range
  for all / class / batch / student. pdf-lib, A4, page numbers, generated-at stamp, org name/logo. Non-Latin characters are transliterated or shown as `?` (standard PDF fonts).
- **Files**: attachments open through `/api/submissions/<id>/file` (owner or admin only, inline or download). Note the underlying Cloudinary
  assets are still "upload"-type URLs (unguessable but public); making them truly private needs Cloudinary `authenticated` delivery for new uploads.
- **Password recovery**: the callback sets an httpOnly recovery cookie; the reset page and the `updatePasswordAction` server action require it plus a live session;
  expired / used / invalid links land on `/reset-password?error=invalid`. Rules: 8-72 chars, a letter and a number, not common, not containing the email name.

## Testing
```bash
npm run test:unit                 # 29 unit tests (time zone, deadline resolver, password rules, report model, PDFs)
bash scripts/local-stack/up.sh    # throwaway Supabase-compatible stack (see scripts/local-stack/README.md)
npm run test:db                   # with TEST_DB_URL pointing at that stack: 57 database assertions (RLS, deadlines, approvals)
E2E_LOCAL=1 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npx playwright test   # 18 browser/API tests
```
