# Shared by test-db.sh and perf-db.sh: get an empty PostgreSQL database with
# the Supabase shim and all migrations applied.
#
# With DATABASE_URL set (CI), that empty database is used. Without it, a
# throwaway local PostgreSQL is started in a temp folder and deleted on exit.
# Sets: DATABASE_URL, PSQL (array), ROOT.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

start_db() {
  if [ -n "${DATABASE_URL:-}" ]; then
    return
  fi
  local pgbin
  pgbin="$(pg_config --bindir 2>/dev/null || true)"
  if [ ! -x "$pgbin/initdb" ]; then
    pgbin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  fi
  if [ ! -x "$pgbin/initdb" ]; then
    echo "PostgreSQL not found. Install it or set DATABASE_URL." >&2
    exit 1
  fi

  DB_TMP="$(mktemp -d)"
  local port="${PGTEST_PORT:-54329}"
  DB_RUN=()
  if [ "$(id -u)" = "0" ]; then
    # initdb refuses to run as root; use the postgres system user.
    chown postgres "$DB_TMP"
    DB_RUN=(runuser -u postgres --)
  fi
  DB_BIN="$pgbin"

  "${DB_RUN[@]}" "$pgbin/initdb" -D "$DB_TMP/data" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
  "${DB_RUN[@]}" "$pgbin/pg_ctl" -D "$DB_TMP/data" -o "-p $port -k $DB_TMP -c listen_addresses=''" -l "$DB_TMP/log" -w start >/dev/null
  trap '"${DB_RUN[@]}" "$DB_BIN/pg_ctl" -D "$DB_TMP/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$DB_TMP"' EXIT

  psql "postgresql://postgres@/postgres?host=$DB_TMP&port=$port" -qc "create database pl8_test" >/dev/null
  DATABASE_URL="postgresql://postgres@/pl8_test?host=$DB_TMP&port=$port"
}

apply_migrations() {
  PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
  echo "▸ Applying Supabase shim"
  "${PSQL[@]}" -f "$ROOT/supabase/tests/_shim.sql" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "▸ Applying migration $(basename "$f")"
    "${PSQL[@]}" -f "$f" >/dev/null
  done
}
