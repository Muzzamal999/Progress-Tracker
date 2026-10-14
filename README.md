# Student Journey Atlas

A progress board for a coding bootcamp: students have a **track** and one of **10 badge levels** (Bronze → Legend). The public site lets anyone browse students, skills and projects; a login-protected admin panel manages them.

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
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | only for `scripts/seed.ts`; remove afterwards |

`.env.local` is git-ignored; `.env.example` lists the names with no values.

## Manual setup

### 1. Supabase
1. Create a project (closest region). Save the DB password.
2. **SQL Editor**: run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_save_student.sql`.
3. **Authentication → Providers → Email**: enable it and **disable "Allow new users to sign up"**.
4. **Authentication → Users → Add user**: create the admin (email + password, auto-confirm). Copy the user's UUID.
5. SQL Editor: `insert into public.admin_users (user_id) values ('<UUID>');`
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

## Adding an admin
Create the user in Supabase (Authentication → Users), then:
```sql
insert into public.admin_users (user_id) values ('<user uuid>');
```
To remove access: `delete from public.admin_users where user_id = '<user uuid>';`

## Seeding from the old data
```bash
# needs SUPABASE_SERVICE_ROLE_KEY + Cloudinary vars in .env.local
npx tsx scripts/seed.ts path/to/students.json --images-dir=path/to/old/public
```
- New uuids + slugs are generated; the old `stu-xxx` id goes into `legacy_id` (so `/student/stu-002` 308-redirects).
- Emails go to `student_private`; projects are inserted with `position` = array index.
- Local images (e.g. `/images/1756006546147.png`) are uploaded to Cloudinary; remote/expired URLs fall back to initials.
- `stu-001` (test junk) is **skipped** unless you pass `--include-junk`.
- Re-running is safe (already imported `legacy_id`s are skipped). Afterwards remove the service-role key from `.env.local` and any shared environment.

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
- Hero figures (students, projects, tracks), the "top of the ladder" student and card progress bars are all computed from real data. Nothing is hard-coded.
- Motion is CSS-only and switched off under `prefers-reduced-motion`.
- This replaces the dark theme in the original brief with a navy + off-white design, as requested later. Track colours use the `-600` shades for contrast on white.

## How it fits together
- **Public data** (`src/lib/students.ts`): one anon Supabase query (students + projects, never email) wrapped in `'use cache'` + `cacheTag('students')`. Admin mutations call `updateTag('students')`, so changes appear immediately.
- **Filters** live in the URL (`?q=&track=&badge=&sort=`), so back/refresh keep them. Filtering/sorting is client-side.
- **Admin auth**: `src/proxy.ts` (Next 16's replacement for `middleware`) redirects non-admins; the admin layout, server actions and API routes each re-check `admin_users` server-side, and RLS enforces it again in the database.
- **Saving** (`save_student` RPC): student + email + whole project list are written in one transaction.
- **Images**: browser gets a signature from `POST /api/cloudinary/sign` (admin only), uploads straight to Cloudinary, and the server action verifies the asset (own folder, ≤5 MB, jpg/png/webp). Replacing an image deletes the old asset only after the DB write succeeds; a failed save deletes the new asset. Deleting a student deletes its asset. Deletion is by `public_id` only and refuses anything outside the upload folder.
- **CSRF**: Server Actions are origin-checked by Next. **Rate limiting** of logins is provided by Supabase Auth; add a limiter on `/api/cloudinary/*` if you need one.

## Testing
- `npx tsx scripts/verify-live.ts`: live checks against your Supabase project (RLS, non-admin denial, atomic `save_student`, rollback, cascade delete, sign-up setting). Creates and removes its own temporary records.
- Demo data: `npx tsx scripts/seed.ts src/data/demo-students.json` (12 invented students; the junk `stu-001` row is skipped).
- Public pages are cached for up to 1 hour. Changes made through the admin panel show up immediately; changes made directly in the database (SQL editor, seed script) appear after the cache expires or after a redeploy.
- Optional `NEXT_PUBLIC_SITE_URL` sets the base URL for social-preview images (falls back to the Vercel production URL).

## Known open items (need the original source / owner decisions)
The original app source (`src/pages`, `src/index.css`, `src/data/students.json`, `server/`) was **not available** when this was built, so:
1. **Badge gradient colours** are placeholders in `src/app/globals.css` (`--gradient-bronze` … `--gradient-legend`). Paste the exact stops from the original `src/index.css`.
2. **Badges page copy** (`src/lib/badges.ts` → `BADGE_DESCRIPTIONS`) and **Tips copy** (`src/lib/tips.ts`) are placeholder text. Replace with the originals verbatim. The legend descriptions (`LEGEND_DESCRIPTIONS`) come from the brief.
3. Layout details were built from the brief's description, not from the original pages: compare side by side at 360/768/1280 px.
4. **Owner decisions pending**: keep or drop `stu-001`? Reconcile legend vs Badges-page wording (e.g. Silver)? 
5. No Supabase/Cloudinary/Vercel accounts were available, so the SQL, RPC, auth flow and Cloudinary upload have **not** been run against real services (the public pages were verified against a mock of the REST API).
6. Replace the generated OG image (`src/app/opengraph-image.tsx`) / icon (`src/app/icon.svg`) with real project artwork if desired; there is no Twitter handle set.

## Status of the brief's bug list (section 10)
Fixed by design: 1 (single Supabase source), 2 (all 10 badges), 3 (`mini/intermediate/real` chips), 4 (real 404), 5 (filters in URL), 6 (search trimmed), 7 (info pill, not a button), 8 (`Button asChild` + `Link`), 9 (collapsible legend on phones), 10 (initials helper), 12 (skills normalised + autocomplete), 13 (half-filled project blocks show an error; fully empty blocks are ignored), 14 (edit heading shows the name), 16 (auth; origin-checked actions), 17 (enums + zod on server), 18 (signed uploads, format pinned, size verified), 19 (delete by `public_id` only), 20 (uuid + slug), 21 (emails private + unique), 22 (controlled inputs), 23 (dialog + toasts), 24–27 (one lockfile, real README, nothing uploaded in git, no Lovable/App.css/unused tokens).
Pending: 11 (wording conflict, owner decision) and 15 (see seed notes). Item 28: see "Adding a track".
