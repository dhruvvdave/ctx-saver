import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CTX_DIR = join(homedir(), ".ctx");
if (!existsSync(CTX_DIR)) {
  mkdirSync(CTX_DIR, { recursive: true });
}

export const DB_PATH = join(CTX_DIR, "sessions.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      start_time  INTEGER,
      end_time    INTEGER,
      duration    INTEGER,
      tab_count   INTEGER,
      summary     TEXT,
      raw_data    TEXT,
      created_at  INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tabs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT,
      url          TEXT,
      domain       TEXT,
      title        TEXT,
      time_spent   INTEGER DEFAULT 0,
      scroll_depth INTEGER DEFAULT 0,
      highlights   TEXT,
      search_query TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT,
      text        TEXT,
      url         TEXT,
      title       TEXT,
      timestamp   INTEGER
    );
  `);

  return _db;
}
