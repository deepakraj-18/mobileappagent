import type { SqlExecutor } from '../../db/migrations';

type Row = Record<string, unknown>;

/**
 * Lightweight in-memory SQL stand-in for LocalStore DAO tests.
 * Supports the subset of statements the DAOs issue.
 */
export function createFakeCompanionDb(): SqlExecutor & {
  tables: {
    hub_outbox: Row[];
    hub_cache: Row[];
    event_log: Row[];
    schema_migrations: Row[];
  };
} {
  const tables = {
    hub_outbox: [] as Row[],
    hub_cache: [] as Row[],
    event_log: [] as Row[],
    schema_migrations: [] as Row[],
  };

  function rowsOf(name: keyof typeof tables): Row[] {
    return tables[name];
  }

  return {
    tables,
    async execute(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      const upper = s.toUpperCase();

      if (upper.startsWith('SELECT MAX(VERSION)')) {
        const max = tables.schema_migrations.reduce(
          (m, r) => Math.max(m, Number(r.version ?? 0)),
          0,
        );
        return { rows: [{ v: max || null }] };
      }

      if (upper.startsWith('INSERT OR REPLACE INTO SCHEMA_MIGRATIONS')) {
        tables.schema_migrations = [{ version: params[0], applied_at: params[1] }];
        return { rows: [] };
      }

      if (upper.startsWith('CREATE TABLE') || upper.startsWith('CREATE INDEX')) {
        return { rows: [] };
      }

      if (upper.startsWith('INSERT INTO HUB_OUTBOX')) {
        tables.hub_outbox.push({
          id: params[0],
          payload: params[1],
          status: params[2],
          attempts: 0,
          created_at: params[3],
          updated_at: params[4],
        });
        return { rows: [] };
      }

      if (upper.startsWith('INSERT OR REPLACE INTO HUB_CACHE')) {
        const key = String(params[0]);
        const existing = tables.hub_cache.findIndex(r => r.key === key);
        const row = {
          key,
          value: params[1],
          kind: params[2],
          updated_at: params[3],
        };
        if (existing >= 0) {
          tables.hub_cache[existing] = row;
        } else {
          tables.hub_cache.push(row);
        }
        return { rows: [] };
      }

      if (upper.startsWith('INSERT INTO EVENT_LOG')) {
        tables.event_log.push({
          id: params[0],
          level: params[1],
          area: params[2],
          message: params[3],
          meta: params[4],
          created_at: params[5],
        });
        return { rows: [] };
      }

      if (upper.includes('FROM HUB_OUTBOX') && upper.includes('WHERE STATUS =')) {
        const status = params[0];
        const ordered = [...tables.hub_outbox]
          .filter(r => r.status === status)
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        const row = ordered[0];
        if (!row) {
          return { rows: [] };
        }
        return {
          rows: [
            {
              id: row.id,
              payload: row.payload,
              status: row.status,
              attempts: row.attempts,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
          ],
        };
      }

      if (upper.startsWith('UPDATE HUB_OUTBOX SET STATUS') && upper.includes('ATTEMPTS')) {
        const row = tables.hub_outbox.find(r => r.id === params[2]);
        if (row) {
          row.status = params[0];
          row.attempts = Number(row.attempts ?? 0) + 1;
          row.updated_at = params[1];
        }
        return { rows: [] };
      }

      if (upper.startsWith('UPDATE HUB_OUTBOX SET STATUS') && !upper.includes('ATTEMPTS')) {
        if (upper.includes('WHERE ID IN')) {
          // cap drop — params: DROPPED, ts, PENDING, IN_FLIGHT, FAILED, limit
          const limit = Number(params[5] ?? 0);
          const statuses = new Set([params[2], params[3], params[4]]);
          const victims = [...tables.hub_outbox]
            .filter(r => statuses.has(r.status))
            .sort((a, b) =>
              String(a.created_at).localeCompare(String(b.created_at)),
            )
            .slice(0, limit);
          for (const v of victims) {
            v.status = params[0];
            v.updated_at = params[1];
          }
          return { rows: [] };
        }
        const row = tables.hub_outbox.find(r => r.id === params[2]);
        if (row) {
          row.status = params[0];
          row.updated_at = params[1];
        }
        return { rows: [] };
      }

      if (upper.startsWith('SELECT COUNT(*) AS C FROM HUB_OUTBOX')) {
        const statuses = new Set(params);
        const c = tables.hub_outbox.filter(r => statuses.has(r.status)).length;
        return { rows: [{ c }] };
      }

      if (upper.startsWith('SELECT VALUE FROM HUB_CACHE')) {
        const row = tables.hub_cache.find(r => r.key === params[0]);
        return { rows: row ? [{ value: row.value }] : [] };
      }

      if (upper.startsWith('DELETE FROM HUB_CACHE')) {
        tables.hub_cache = tables.hub_cache.filter(r => r.key !== params[0]);
        return { rows: [] };
      }

      if (upper.includes('FROM HUB_CACHE WHERE KIND')) {
        return {
          rows: tables.hub_cache
            .filter(r => r.kind === params[0])
            .map(r => ({
              key: r.key,
              value: r.value,
              kind: r.kind,
              updatedAt: r.updated_at,
            })),
        };
      }

      if (upper.includes('FROM EVENT_LOG') && upper.includes('ORDER BY CREATED_AT DESC')) {
        const limit = Number(params[0] ?? 50);
        const rows = [...tables.event_log]
          .sort((a, b) =>
            String(b.created_at).localeCompare(String(a.created_at)),
          )
          .slice(0, limit)
          .map(r => ({
            id: r.id,
            level: r.level,
            area: r.area,
            message: r.message,
            meta: r.meta,
            createdAt: r.created_at,
          }));
        return { rows };
      }

      if (upper.startsWith('SELECT COUNT(*) AS C FROM EVENT_LOG')) {
        return { rows: [{ c: tables.event_log.length }] };
      }

      if (upper.startsWith('DELETE FROM EVENT_LOG')) {
        const drop = Number(params[0] ?? 0);
        if (drop > 0) {
          const ordered = [...tables.event_log].sort((a, b) =>
            String(a.created_at).localeCompare(String(b.created_at)),
          );
          const dropIds = new Set(ordered.slice(0, drop).map(r => r.id));
          tables.event_log = tables.event_log.filter(r => !dropIds.has(r.id));
        }
        return { rows: [] };
      }

      // fallback for migration DDL noise
      if (upper.includes('SCHEMA_MIGRATIONS') || upper.includes('HUB_')) {
        return { rows: [] };
      }

      throw new Error(`Fake DB unsupported SQL: ${s}`);
    },
  };
}
