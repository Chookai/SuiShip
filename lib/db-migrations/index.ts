import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Use process.cwd() as the anchor because __dirname is unreliable inside
// Next.js webpack compilation (it can resolve to "/" or the bundle root).
const MIGRATIONS_DIR = path.join(process.cwd(), "lib", "db-migrations");

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  const applied = new Set<number>(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(
      (r) => r.version
    )
  );

  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of sqlFiles) {
    const version = parseInt(file.split("_")[0], 10);
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
  }
}
