#!/usr/bin/env bash
# Starts a throwaway local Supabase-compatible stack (Postgres + GoTrue + PostgREST + a tiny gateway) from the
# Docker images the Supabase CLI uses, applies every migration and seeds demo data. Nothing here touches a real project.
#   ports: db 54329, gateway 54321 (/rest/v1, /auth/v1), gotrue 9998, postgrest 3010
set -euo pipefail
cd "$(dirname "$0")/../.."
HERE=scripts/local-stack
export PGPASSWORD=postgres
PSQL="psql -h 127.0.0.1 -p 54329 -v ON_ERROR_STOP=1 -q"

[ -f $HERE/keys.json ] || node $HERE/keys.mjs > $HERE/keys.json
SECRET=$(node -e "console.log(require('./$HERE/keys.json').secret)")

docker rm -f sja-testdb sja-gotrue sja-postgrest >/dev/null 2>&1 || true
docker run -d --name sja-testdb -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:54329:5432 public.ecr.aws/supabase/postgres:17.11.0.004 >/dev/null
until $PSQL -U supabase_admin -d postgres -c "select 1" >/dev/null 2>&1; do sleep 1; done
sleep 3
$PSQL -U supabase_admin -d postgres -c "alter role authenticator with password 'postgres'; alter role supabase_auth_admin with password 'postgres';"
for f in supabase/migrations/*.sql; do echo "applying $f"; $PSQL -U postgres -d postgres -1 -f "$f"; done

docker run -d --name sja-gotrue --network host \
  -e GOTRUE_API_HOST=127.0.0.1 -e GOTRUE_API_PORT=9998 -e API_EXTERNAL_URL=http://127.0.0.1:54321 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:54329/postgres" \
  -e GOTRUE_SITE_URL=http://localhost:3000 -e GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**" \
  -e GOTRUE_JWT_SECRET="$SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
  -e GOTRUE_SMTP_HOST=127.0.0.1 -e GOTRUE_SMTP_PORT=1025 -e GOTRUE_SMTP_ADMIN_EMAIL=noreply@test.local \
  -e GOTRUE_PASSWORD_MIN_LENGTH=8 -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
  public.ecr.aws/supabase/gotrue:v2.197.0 >/dev/null
docker run -d --name sja-postgrest --network host \
  -e PGRST_DB_URI="postgres://authenticator:postgres@127.0.0.1:54329/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$SECRET" -e PGRST_SERVER_HOST=127.0.0.1 -e PGRST_SERVER_PORT=3010 -e PGRST_DB_MAX_ROWS=1000 \
  public.ecr.aws/supabase/postgrest:v16.4 >/dev/null
until curl -sf http://127.0.0.1:9998/health >/dev/null && curl -sf -o /dev/null http://127.0.0.1:3010/; do sleep 1; done

pkill -f "local-stack/proxy.mjs" 2>/dev/null || true
nohup node $HERE/proxy.mjs > $HERE/proxy.log 2>&1 &
sleep 1
node $HERE/seed.mjs

ANON=$(node -e "console.log(require('./$HERE/keys.json').anon)")
cat <<MSG

Local stack is up. Run the app against it with:
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON npm run dev
and the end-to-end tests with:
  E2E_LOCAL=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON npx playwright test
MSG
