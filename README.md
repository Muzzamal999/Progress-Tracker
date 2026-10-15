# Student Journey Atlas

A progress platform for a coding bootcamp. Students register, complete a profile, enrol in a batch, submit daily reports and projects (with image evidence), and earn **sequential achievement badges** (Bronze → Legend) when an Admin approves their work. Completing an eligible badge issues a **PDF certificate** with a QR code that links to a public verification page. A login-protected admin panel manages classes, batches, tasks, lab manuals, review, badge rules, certificates and branding. The public site lists students who have completed their profile.

**Nothing is pre-populated.** A fresh install has no students, reports, progress, achievements or certificates: the Admin is the starting point.

Stack: Next.js (App Router, Cache Components) · React · TypeScript · Tailwind CSS v4 · shadcn-style UI (Radix) · Supabase (Postgres, Auth, RLS) · Cloudinary (images) · Vercel.

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in the values (see "Environment variables")
npm run dev                    # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npx tsc --noEmit`.
Package manager: **npm** (`package-lock.json` is the only lockfile).

## Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | `anon` public key |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | browser + server | |
| `NEXT_PUBLIC_CLOUDINARY_API_KEY` | browser + server | |
| `CLOUDINARY_API_SECRET` | **server only** | never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | browser + server | Public base URL. Used for the QR code on certificates and social previews (falls back to the Vercel production URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Not used by the app at runtime. Only for provisioning/testing scripts; never deploy it |

`.env.local` is git-ignored; `.env.example` lists the names with no values.

## Manual setup

### 1. Supabase
1. Create a project (closest region). Save the DB password.
2. **SQL Editor**: run the migrations in order: `0001_init.sql`, `0002_save_student.sql`, `0003_student_progress.sql` (or just `setup_all.sql`, which is the three combined). `0003` is additive: it adds tables and columns and never drops or deletes existing data.
3. **Authentication → Providers → Email**: enable it and **enable "Allow new users to sign up"**, because students register themselves. Strongly recommended: turn on **Confirm email** and a CAPTCHA to limit spam sign-ups. Signing up only ever creates a *student*; it can never grant admin access.
4. **Provision the first Admin** (see "Adding an admin" below). There is no default admin and no default password.
6. **Authentication → URL Configuration**: Site URL = production URL; Redirect URLs: `http://localhost:3000/**` and the Vercel preview pattern.
7. **Project Settings → API**: copy the Project URL and `anon` key.
8. Verify RLS with `supabase/verify_rls.sql`: reads work, `student_private` returns 0 rows for `anon`, writes fail.

### 2. Cloudinary
1. Create an account; note the **cloud name**, API key and API secret (Settings → API Keys).
2. Uploads go to the folder `student-journey/avatars` (set in `src/lib/cloudinary-server.ts`). Signed uploads need no preset.
3. Optional: restrict allowed formats to jpg/png/webp in Settings → Upload. (The signature already pins `allowed_formats`, and the server re-checks size/format after upload.)

### 3. Vercel
1. Push to GitHub → **Add New → Project** → import (framework preset: Next.js).
2. Add the environment variables for Production, Preview and Development.
3. Deploy, then put the production URL into Supabase (step 1.6).

## Applying migration 0003 safely
- Apply `supabase/migrations/0003_student_progress.sql` **once**, as a single transaction, from the repo file itself. Do not copy SQL out of chat or email; use the file or the GitHub "Copy raw file" button and confirm it has 653 lines.
- Preferred (exact error messages, automatic rollback): `psql "<connection string from Supabase → Connect>" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/0003_student_progress.sql`.
- In the SQL Editor: wrap the file in `begin;` / `commit;`, select all, accept the "destructive query" warning (the file contains `drop policy` and `delete` inside functions) and check the result panel.
- Before: run `supabase/checks/pre_0003_readonly.sql`. After: run `supabase/checks/post_0003_readonly.sql`. Both are read-only and return one JSON row.
- Do **not** run `supabase/setup_all.sql` on an existing database (it recreates the base tables).

## Adding an admin
Admins are never created through the public sign-up form. In the Supabase dashboard:
1. **Authentication → Users → Add user**: enter the admin's email and a strong password you choose (auto-confirm). Do not reuse or share it; no credentials are stored in this repository.
2. Copy the user's UUID and run in the SQL editor:
```sql
insert into public.admin_users (user_id) values ('<user uuid>');
```
3. Sign in at `/admin/login`. Admin access is checked in the proxy, in every page/action, and again by Postgres RLS.

To remove access: `delete from public.admin_users where user_id = '<user uuid>';`

## First steps as Admin
1. **Classes & tasks**: create a class, then a batch (students can only enrol in an *active* batch of an *active* class), then tasks.
2. **Badge rules**: review the ladder (default: 10 badges, 3 approved projects each, certificates on for every badge except the first). Change names, order, required project counts and certificate eligibility. Saving re-evaluates students but never revokes an earned badge.
3. **Branding**: organisation name, logo, accent colour, signatory and footer, used on certificates and the verification page.
4. **Lab manuals**: publish instructions (with images) for a class or batch.
5. Students register at `/register`, complete their profile, enrol and start submitting. Review their work under **Review queue**.

## How progress, badges and certificates work
- Only projects with status `approved` count. Pending and rejected work never does, and a student cannot approve their own work: all student writes go through database functions that take the identity from the session, and RLS gives students read-only access to their own rows.
- Approved projects fill badges in order. With 3 required per badge: 1 approved = 33% (subtle glow), 2 = 67% (stronger glow), 3 = 100% (full glow, completion animation, unlocked). Extra approvals flow into the next badge, which becomes active.
- A submission needs evidence (at least one image). A student cannot have two live (pending/approved) submissions with the same title or link; a rejected submission can be fixed and resubmitted.
- Achievements are stored in `student_badges`; certificates in `certificates`. Both are written only by database functions. Withdrawing an approval (approved → rejected) re-opens the badge and revokes its certificate; re-approving restores the same certificate number.
- `GET /api/certificates/<number>/pdf` (owner or admin only) renders the PDF; `/verify/<number>` is public and shows only the holder's name, level, verified project count, issue date and validity.
- Deleting a student in the admin panel also deletes their login.

## Adding a track
Tracks are a Postgres enum:
```sql
alter type public.track add value 'NewTrack';
```
Then add it to `TRACKS` in `src/lib/types.ts` and a colour in `TRACK_COLORS` in `src/lib/student-utils.ts`.

## Design system
- **Tokens** live in `src/app/globals.css` (`:root`): navy/midnight brand surfaces (`--navy`, `--midnight`, `--gradient-brand`), off-white content surfaces, indigo/violet accents, card shadows. Change colours there only.
- **Fonts**: Plus Jakarta Sans (headings) and Inter (body) via `next/font`, set in `src/app/layout.tsx`.
- **Shared pieces**: `SiteHeader`/`SiteFooter` (public pages, in `src/app/(site)/layout.tsx`), `AdminSidebar` (admin), `PageHero`, `Badge`, `LevelProgress`, `StudentCard`, `JourneyCard`.
- Hero figures (students, projects, tracks), the "top of the ladder" student, dashboard statistics and progress bars are all computed from real data. Nothing is hard-coded.
- **Dark mode**: tokens are redefined under `:root.dark`; `ThemeToggle` stores the choice in `localStorage` and a tiny inline script in `layout.tsx` applies it before first paint (falls back to the OS preference).
- Motion is CSS-only and switched off under `prefers-reduced-motion`.
- This replaces the dark theme in the original brief with a navy + off-white design, as requested later. Track colours use the `-600` shades for contrast on white.

## How it fits together
- **Public data** (`src/lib/students.ts`): one anon Supabase query (students + projects, never email) wrapped in `'use cache'` + `cacheTag('students')`. Admin mutations call `updateTag('students')`, so changes appear immediately.
- **Filters** live in the URL (`?q=&track=&badge=&sort=`), so back/refresh keep them. Filtering/sorting is client-side.
- **Student auth**: standard Supabase sign-up with `registration: "student"` metadata; a trigger on `auth.users` creates the matching `students` row (so there is exactly one place that does this). `/dashboard/*` is guarded by the proxy and re-checked in the layout.
- **Admin auth**: `src/proxy.ts` (Next 16's replacement for `middleware`) redirects non-admins; the admin layout, server actions and API routes each re-check `admin_users` server-side, and RLS enforces it again in the database.
- **Saving** (`save_student` RPC): student + email + whole project list are written in one transaction.
- **Images**: browser gets a signature from `POST /api/cloudinary/sign` (admin only), uploads straight to Cloudinary, and the server action verifies the asset (own folder, ≤5 MB, jpg/png/webp). Replacing an image deletes the old asset only after the DB write succeeds; a failed save deletes the new asset. Deleting a student deletes its asset. Deletion is by `public_id` only and refuses anything outside the upload folder.
- **CSRF**: Server Actions are origin-checked by Next. **Rate limiting** of logins is provided by Supabase Auth; add a limiter on `/api/cloudinary/*` if you need one.

## Testing
- **Workflow tests (recommended, isolated):** `scripts/verify-workflow.ts` exercises registration, enrolment, submissions, review, 33/67/100% progress, sequential badges, certificates, public verification, revocation, configurable rules and access control (direct API cheating attempts). It reads `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY` and `TEST_SUPABASE_SERVICE_ROLE_KEY` (not `.env.local`) and refuses non-local URLs unless `ALLOW_REMOTE_TEST=1`. Run it against a local stack:
  ```bash
  supabase init && cp supabase/migrations/*.sql <your-supabase-dir>/migrations/   # or point the CLI at this folder
  supabase start                                                                  # prints the local URL and keys
  TEST_SUPABASE_URL=http://127.0.0.1:54321 TEST_SUPABASE_ANON_KEY=... TEST_SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/verify-workflow.ts
  ```
  It removes everything it creates.
- `npx tsx scripts/verify-live.ts`: older checks against the project in `.env.local` (RLS, non-admin denial, atomic `save_student`, rollback, cascade delete). It creates and removes temporary records in that project, so do not point it at production data you care about.
- Public pages are cached for up to 1 hour. Changes made through the admin panel show up immediately; changes made directly in the database (SQL editor) appear after the cache expires or after a redeploy.
- Optional `NEXT_PUBLIC_SITE_URL` sets the base URL for social-preview images (falls back to the Vercel production URL).

## Known open items (need the original source / owner decisions)
The original app source (`src/pages`, `src/index.css`, `src/data/students.json`, `server/`) was **not available** when this was built, so:
1. **Badge gradient colours** are placeholders in `src/app/globals.css` (`--gradient-bronze` … `--gradient-legend`). Paste the exact stops from the original `src/index.css`.
2. **Badges page copy** (`src/lib/badges.ts` → `BADGE_DESCRIPTIONS`) and **Tips copy** (`src/lib/tips.ts`) are placeholder text. Replace with the originals verbatim. The legend descriptions (`LEGEND_DESCRIPTIONS`) come from the brief.
3. Layout details were built from the brief's description, not from the original pages: compare side by side at 360/768/1280 px.
4. **Owner decisions pending**: keep or drop `stu-001`? Reconcile legend vs Badges-page wording (e.g. Silver)? 
5. Migrations `0001`-`0003`, the RPCs, RLS and the auth flow are exercised by `scripts/verify-workflow.ts` against a local Supabase stack, not against the production project. Apply `0003` to production deliberately (it is additive), after taking a backup.
6. Replace the generated OG image (`src/app/opengraph-image.tsx`) / icon (`src/app/icon.svg`) with real project artwork if desired; there is no Twitter handle set.

## Status of the brief's bug list (section 10)
Fixed by design: 1 (single Supabase source), 2 (all 10 badges), 3 (`mini/intermediate/real` chips), 4 (real 404), 5 (filters in URL), 6 (search trimmed), 7 (info pill, not a button), 8 (`Button asChild` + `Link`), 9 (collapsible legend on phones), 10 (initials helper), 12 (skills normalised + autocomplete), 13 (half-filled project blocks show an error; fully empty blocks are ignored), 14 (edit heading shows the name), 16 (auth; origin-checked actions), 17 (enums + zod on server), 18 (signed uploads, format pinned, size verified), 19 (delete by `public_id` only), 20 (uuid + slug), 21 (emails private + unique), 22 (controlled inputs), 23 (dialog + toasts), 24–27 (one lockfile, real README, nothing uploaded in git, no Lovable/App.css/unused tokens).
Pending: 11 (wording conflict, owner decision) and 15. Item 28: see "Adding a track".
