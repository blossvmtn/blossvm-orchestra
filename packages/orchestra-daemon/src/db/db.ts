import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { dbPath } from "../paths";
import * as schema from "./schema";

export type OrchestraDb = BunSQLiteDatabase<typeof schema>;

/**
 * Opens (creating if needed) the daemon's SQLite database and applies any
 * pending migrations. Pass an explicit path in tests to use an isolated file
 * or in-memory db instead of the real ~/.orchestra/orchestra.db.
 */
export function createDb(explicitPath?: string): OrchestraDb {
  const target = explicitPath ?? dbPath();
  if (target !== ":memory:") {
    // Fable review, 2026-07-18, F7: must mkdir the target's own parent, not
    // always ~/.orchestra — an explicitPath in a different directory (e.g. a
    // test fixture) would otherwise fail with ENOENT on the sqlite open.
    mkdirSync(path.dirname(target), { recursive: true });
  }
  const sqlite = new Database(target);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(import.meta.dir, "migrations") });
  return db;
}
