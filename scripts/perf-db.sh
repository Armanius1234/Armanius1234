#!/usr/bin/env bash
# Performance check for the database: fills a throwaway database with a busy
# beta's worth of data (supabase/perf/seed.sql) and times the queries the app
# uses most (supabase/perf/measure.sql). Fails if one is over its budget.
#
#   npm run perf:db
set -euo pipefail

# shellcheck source=lib/db.sh
source "$(dirname "$0")/lib/db.sh"
start_db
apply_migrations

echo "▸ Seeding test data (takes a minute)"
SECONDS=0
"${PSQL[@]}" -f "$ROOT/supabase/perf/seed.sql"
echo "  seeded in ${SECONDS}s"

echo "▸ Timing the app's queries"
"${PSQL[@]}" -f "$ROOT/supabase/perf/measure.sql"
