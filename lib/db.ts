import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import { runMigrations } from "./db-migrations/index";

const logger = pino({ name: "db" });

const DB_PATH =
  process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), "data", "suiship.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  logger.info({ path: DB_PATH }, "opening SQLite DB");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("wal_autocheckpoint = 100");
  _db.pragma("foreign_keys = ON");
  runMigrations(_db);
  const { count } = _db.prepare("SELECT COUNT(*) as count FROM shipments").get() as { count: number };
  logger.info({ shipmentCount: count }, "DB ready — WAL mode");
  return _db;
}
