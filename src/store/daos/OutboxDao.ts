import type { SqlExecutor } from '../../db/migrations';
import { AppLimits, OutboxStatus } from '../../constants/appConstants';

export type OutboxRow = {
  id: string;
  payload: string;
  status: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

type QueryResult = { rows?: Array<Record<string, unknown>> };

export class OutboxDao {
  constructor(private readonly db: SqlExecutor) {}

  async enqueue(payload: unknown): Promise<string> {
    const id = newId('obx');
    const ts = nowIso();
    await this.db.execute(
      `INSERT INTO hub_outbox (id, payload, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [id, JSON.stringify(payload), OutboxStatus.PENDING, ts, ts],
    );
    await this.enforceCap();
    return id;
  }

  async nextPending(): Promise<OutboxRow | null> {
    const result = (await this.db.execute(
      `SELECT id, payload, status, attempts, created_at AS createdAt, updated_at AS updatedAt
       FROM hub_outbox
       WHERE status = ?
       ORDER BY created_at ASC
       LIMIT 1`,
      [OutboxStatus.PENDING],
    )) as QueryResult;
    const row = result.rows?.[0];
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      payload: String(row.payload),
      status: String(row.status),
      attempts: Number(row.attempts),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }

  async markInFlight(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE hub_outbox SET status = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?`,
      [OutboxStatus.IN_FLIGHT, nowIso(), id],
    );
  }

  async ack(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE hub_outbox SET status = ?, updated_at = ? WHERE id = ?`,
      [OutboxStatus.ACKED, nowIso(), id],
    );
  }

  async markFailed(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE hub_outbox SET status = ?, updated_at = ? WHERE id = ?`,
      [OutboxStatus.FAILED, nowIso(), id],
    );
  }

  async enforceCap(): Promise<void> {
    const countResult = (await this.db.execute(
      `SELECT COUNT(*) AS c FROM hub_outbox WHERE status IN (?, ?, ?)`,
      [OutboxStatus.PENDING, OutboxStatus.IN_FLIGHT, OutboxStatus.FAILED],
    )) as QueryResult;
    const count = Number(countResult.rows?.[0]?.c ?? 0);
    if (count <= AppLimits.OUTBOX_CAP) {
      return;
    }
    const drop = count - AppLimits.OUTBOX_CAP;
    await this.db.execute(
      `UPDATE hub_outbox SET status = ?, updated_at = ?
       WHERE id IN (
         SELECT id FROM hub_outbox
         WHERE status IN (?, ?, ?)
         ORDER BY created_at ASC
         LIMIT ?
       )`,
      [
        OutboxStatus.DROPPED,
        nowIso(),
        OutboxStatus.PENDING,
        OutboxStatus.IN_FLIGHT,
        OutboxStatus.FAILED,
        drop,
      ],
    );
  }
}
