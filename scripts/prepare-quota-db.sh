#!/usr/bin/env bash
# Creates the database tests/quota.test.mjs expects (QUOTA_DB, default quota_test).
# The quota migrations reference Supabase roles and auth.users. This stubs those
# and applies only the two quota migrations. The other migrations need storage.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
db="${QUOTA_DB:-quota_test}"
user="$(id -un)"

if ! [[ "$user" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "OS user name cannot be used as a Postgres role." >&2
  exit 1
fi
if ! [[ "$db" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "QUOTA_DB must be a plain identifier." >&2
  exit 1
fi

if ! pg_isready -q 2>/dev/null; then
  if command -v service >/dev/null 2>&1; then
    sudo service postgresql start || true
  fi
fi
if ! pg_isready -q 2>/dev/null; then
  if command -v pg_ctlcluster >/dev/null 2>&1; then
    ver=""
    for dir in /etc/postgresql/*; do
      ver="$(basename "$dir")"
      break
    done
    if [ -z "$ver" ]; then
      echo "PostgreSQL is installed but no cluster version was found." >&2
      exit 1
    fi
    sudo pg_ctlcluster "$ver" main start
  fi
fi
if ! pg_isready -q 2>/dev/null; then
  echo "PostgreSQL is not accepting connections." >&2
  exit 1
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${user}') THEN
    CREATE ROLE "${user}" SUPERUSER LOGIN;
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -qx 1; then
  sudo -u postgres createdb -O "$user" "$db"
fi

psql -v ON_ERROR_STOP=1 -d "$db" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
\$\$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);
INSERT INTO auth.users (id)
VALUES ('11111111-1111-4111-8111-111111111111')
ON CONFLICT (id) DO NOTHING;
SQL

psql -v ON_ERROR_STOP=1 -d "$db" -f "$root/supabase/migrations/20261002000000_food_ai_usage.sql"
psql -v ON_ERROR_STOP=1 -d "$db" -f "$root/supabase/migrations/20261004120000_ai_quota.sql"
echo "quota database ${db} is ready"
