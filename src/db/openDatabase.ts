import { open } from '@op-engineering/op-sqlite';
import { applyMigrations } from './migrations';
import { DB_NAME } from './schema';

export type CompanionDatabase = ReturnType<typeof open>;

let singleton: CompanionDatabase | null = null;

/**
 * Opens (or returns) the companion SQLite DB and applies migrations.
 * Call once at app startup before LocalStore DAOs (SC007).
 */
export async function openCompanionDatabase(): Promise<CompanionDatabase> {
  if (singleton) {
    return singleton;
  }
  const db = open({ name: DB_NAME });
  await applyMigrations({
    execute: async (sql, params) => db.execute(sql, params as never[]),
  });
  singleton = db;
  return db;
}

/** Test helper — clears the process singleton. */
export function resetCompanionDatabaseSingleton(): void {
  singleton = null;
}
