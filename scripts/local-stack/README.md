# Local test stack

A disposable Supabase-compatible stack for exercising the app and the migrations without touching a real project:
Postgres (`supabase/postgres` image) + GoTrue + PostgREST + a 40-line gateway, all started from images the Supabase CLI uses.

```bash
bash scripts/local-stack/up.sh     # starts, applies supabase/migrations/*.sql, seeds demo accounts
bash scripts/local-stack/down.sh   # removes the containers
```

Demo accounts (password `Test-pass-1234`): `admin@test.local`, `ayesha@test.local`, `bilal@test.local`, `chaman@test.local`.
`keys.json` (generated, git-ignored) holds the throwaway JWT secret and keys for this stack only.

Database-level tests (RLS, deadlines, approvals) run directly against the stack's Postgres:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/0006_deadlines.test.sql
```
