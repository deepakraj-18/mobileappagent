/** Schema version and DDL for companion local store (DB001). No user-data tables. */

export const DB_NAME = 'privateagent.db';
export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hub_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hub_outbox_status_created
  ON hub_outbox (status, created_at);

CREATE TABLE IF NOT EXISTS hub_cache (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  kind TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hub_cache_kind
  ON hub_cache (kind);

CREATE TABLE IF NOT EXISTS event_log (
  id TEXT PRIMARY KEY NOT NULL,
  level TEXT NOT NULL,
  area TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_log_created
  ON event_log (created_at);
CREATE INDEX IF NOT EXISTS idx_event_log_level_created
  ON event_log (level, created_at);
`;

/** Statements used by the pure migration test helper (split for clarity). */
export const MIGRATION_V1_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS hub_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_hub_outbox_status_created
  ON hub_outbox (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS hub_cache (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  kind TEXT,
  updated_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_hub_cache_kind ON hub_cache (kind)`,
  `CREATE TABLE IF NOT EXISTS event_log (
  id TEXT PRIMARY KEY NOT NULL,
  level TEXT NOT NULL,
  area TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_event_log_level_created
  ON event_log (level, created_at)`,
] as const;
