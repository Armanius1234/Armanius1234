// Puts all database files (supabase/migrations, in date order) into ONE file
// for setting up a NEW Supabase project in a single step:
//   dist-sql/PL8-Datenbank-komplett.sql
// npm run test:db:combined checks that this file gives the same database.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const header = `-- =============================================================================
-- PL8 – komplette Datenbank / complete database (${files.length} Dateien / files)
--
-- NUR für ein NEUES Supabase-Projekt. Einmal ausführen:
--   1. Database -> Extensions: "pg_net" und "pg_cron" einschalten.
--   2. SQL Editor -> New query -> diese ganze Datei einfügen -> Run.
-- Wenn du früher schon einzelne Dateien aus supabase/migrations ausgeführt
-- hast, NICHT diese Datei nehmen, sondern nur die fehlenden einzelnen Dateien.
--
-- ONLY for a NEW Supabase project. Run once (enable pg_net and pg_cron first).
-- =============================================================================
`;
const body = files.map((f) => `\n-- ---------------------------------------------------------------- ${f}\n${readFileSync(join(dir, f), 'utf8')}`).join('\n');

mkdirSync(join(root, 'dist-sql'), { recursive: true });
const out = join(root, 'dist-sql', 'PL8-Datenbank-komplett.sql');
writeFileSync(out, header + body);
console.log(`Wrote dist-sql/PL8-Datenbank-komplett.sql (${files.length} files)`);
