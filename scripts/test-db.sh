#!/usr/bin/env bash
# Runs the database security tests.
#
#   npm run test:db
#
# With DATABASE_URL set (CI), it uses that empty PostgreSQL database.
# Without it, it starts a throwaway local PostgreSQL in a temp folder,
# runs the tests, and deletes it again. Needs PostgreSQL 15+ installed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLEANUP=""

if [ -z "${DATABASE_URL:-}" ]; then
  PGBIN="$(pg_config --bindir 2>/dev/null || true)"
  if [ ! -x "$PGBIN/initdb" ]; then
    PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  fi
  if [ ! -x "$PGBIN/initdb" ]; then
    echo "PostgreSQL not found. Install it or set DATABASE_URL." >&2
    exit 1
  fi

  TMP="$(mktemp -d)"
  PORT="${PGTEST_PORT:-54329}"
  RUN=()
  if [ "$(id -u)" = "0" ]; then
    # initdb refuses to run as root; use the postgres system user.
    chown postgres "$TMP"
    RUN=(runuser -u postgres --)
  fi

  "${RUN[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
  "${RUN[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
  CLEANUP="$TMP"
  trap '"${RUN[@]}" "$PGBIN/pg_ctl" -D "$CLEANUP/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$CLEANUP"' EXIT

  createdb_url="postgresql://postgres@/postgres?host=$TMP&port=$PORT"
  psql "$createdb_url" -qc "create database pl8_test" >/dev/null
  DATABASE_URL="postgresql://postgres@/pl8_test?host=$TMP&port=$PORT"
fi

PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

echo "▸ Applying Supabase shim"
"${PSQL[@]}" -f "$ROOT/supabase/tests/_shim.sql" >/dev/null

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "▸ Applying migration $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done

PASS=0
FAIL=0
for f in "$ROOT"/supabase/tests/*.test.sql; do
  echo "▸ Running $(basename "$f")"
  if OUT="$("${PSQL[@]}" -f "$f" 2>&1)"; then
    N="$(grep -c 'NOTICE:  ok - ' <<<"$OUT" || true)"
    grep 'NOTICE:  ok - ' <<<"$OUT" | sed 's/.*NOTICE:  ok - /   ✓ /'
    PASS=$((PASS + N))
  else
    grep 'NOTICE:  ok - ' <<<"$OUT" | sed 's/.*NOTICE:  ok - /   ✓ /' || true
    grep 'ERROR' <<<"$OUT" | sed 's/.*ERROR:  /   ✗ /'
    FAIL=$((FAIL + 1))
  fi
done

echo
echo "Database tests: $PASS passed, $FAIL file(s) failed"
[ "$FAIL" -eq 0 ]
