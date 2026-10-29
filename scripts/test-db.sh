#!/usr/bin/env bash
# Runs the database security tests.
#
#   npm run test:db
#
# With DATABASE_URL set (CI), it uses that empty PostgreSQL database.
# Without it, it starts a throwaway local PostgreSQL in a temp folder,
# runs the tests, and deletes it again. Needs PostgreSQL 15+ installed.
# (Database start-up is shared with perf-db.sh: scripts/lib/db.sh.)
set -euo pipefail

# shellcheck source=lib/db.sh
source "$(dirname "$0")/lib/db.sh"
start_db
export PL8_TESTS_DIR="$ROOT/supabase/tests"
apply_migrations

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
