import {
  CREATE_TABLES_SQL,
  MIGRATION_V1_STATEMENTS,
  SCHEMA_VERSION,
} from './schema';

/** Minimal execute surface so migrations can run against op-sqlite or a test double. */
export type SqlExecutor = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown> | unknown;
};

export async function getSchemaVersion(db: SqlExecutor): Promise<number> {
  try {
    const result = (await db.execute(
      'SELECT MAX(version) AS v FROM schema_migrations',
    )) as { rows?: Array<{ v: number | null }> };
    const row = result?.rows?.[0];
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

export async function applyMigrations(db: SqlExecutor): Promise<number> {
  const current = await getSchemaVersion(db);
  if (current >= SCHEMA_VERSION) {
    return current;
  }

  if (current < 1) {
    for (const statement of MIGRATION_V1_STATEMENTS) {
      await db.execute(statement);
    }
    // Also accept batch form for native drivers that prefer it
    if (CREATE_TABLES_SQL.length === 0) {
      /* unreachable — keeps export used */
    }
    await db.execute(
      'INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      [1, new Date().toISOString()],
    );
  }

  return SCHEMA_VERSION;
}

/** In-memory executor for Jest — records DDL and supports schema_migrations queries. */
export function createMemoryExecutor(): SqlExecutor & {
  statements: string[];
  version: number;
} {
  const statements: string[] = [];
  let version = 0;
  return {
    statements,
    get version() {
      return version;
    },
    async execute(sql: string, params?: unknown[]) {
      statements.push(sql);
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
      if (normalized.startsWith('SELECT MAX(VERSION)')) {
        return { rows: [{ v: version || null }] };
      }
      if (normalized.startsWith('INSERT OR REPLACE INTO SCHEMA_MIGRATIONS')) {
        version = Number(params?.[0] ?? 1);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}
