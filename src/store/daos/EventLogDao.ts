import { AppLimits, EventLogLevel } from '../../constants/appConstants';
import type { SqlExecutor } from '../../db/migrations';

type QueryResult = { rows?: Array<Record<string, unknown>> };

export type EventLogRow = {
  id: string;
  level: string;
  area: string;
  message: string;
  meta: string | null;
  createdAt: string;
};

export class EventLogDao {
  constructor(private readonly db: SqlExecutor) {}

  async append(
    level: (typeof EventLogLevel)[keyof typeof EventLogLevel],
    area: string,
    message: string,
    meta?: unknown,
  ): Promise<string> {
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const ts = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO event_log (id, level, area, message, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        level,
        area,
        message,
        meta === undefined ? null : JSON.stringify(meta),
        ts,
      ],
    );
    await this.trim();
    return id;
  }

  async recent(limit = 50): Promise<EventLogRow[]> {
    const result = (await this.db.execute(
      `SELECT id, level, area, message, meta, created_at AS createdAt
       FROM event_log
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit],
    )) as QueryResult;
    return (result.rows ?? []).map(row => ({
      id: String(row.id),
      level: String(row.level),
      area: String(row.area),
      message: String(row.message),
      meta: row.meta == null ? null : String(row.meta),
      createdAt: String(row.createdAt),
    }));
  }

  async trim(): Promise<void> {
    const countResult = (await this.db.execute(
      `SELECT COUNT(*) AS c FROM event_log`,
    )) as QueryResult;
    const count = Number(countResult.rows?.[0]?.c ?? 0);
    if (count <= AppLimits.EVENT_LOG_CAP) {
      return;
    }
    const drop = count - AppLimits.EVENT_LOG_CAP;
    await this.db.execute(
      `DELETE FROM event_log WHERE id IN (
         SELECT id FROM event_log ORDER BY created_at ASC LIMIT ?
       )`,
      [drop],
    );
  }
}
