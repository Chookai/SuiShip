/**
 * Wipes the SQLite database before a test run for determinism.
 * The migration runner re-creates the schema on first getDb() call.
 */
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

export function resetDb(): void {
  const dbPath = process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), "data", "suiship.db");
  let removed = 0;
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = `${dbPath}${suffix}`;
    if (existsSync(p)) {
      unlinkSync(p);
      removed++;
    }
  }
  console.log(`[db-reset] Removed ${removed} DB file(s) at ${dbPath}`);
}
