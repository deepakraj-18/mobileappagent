import type { CardKind } from '../../constants/appConstants';
import type { SqlExecutor } from '../../db/migrations';

type QueryResult = { rows?: Array<Record<string, unknown>> };

export type CacheEntry = {
  key: string;
  value: string;
  kind: string | null;
  updatedAt: string;
};

export class CacheDao {
  constructor(private readonly db: SqlExecutor) {}

  async set(key: string, value: unknown, kind?: string | null): Promise<void> {
    const ts = new Date().toISOString();
    await this.db.execute(
      `INSERT OR REPLACE INTO hub_cache (key, value, kind, updated_at) VALUES (?, ?, ?, ?)`,
      [key, JSON.stringify(value), kind ?? null, ts],
    );
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const result = (await this.db.execute(
      `SELECT value FROM hub_cache WHERE key = ?`,
      [key],
    )) as QueryResult;
    const raw = result.rows?.[0]?.value;
    if (raw == null) {
      return null;
    }
    return JSON.parse(String(raw)) as T;
  }

  async delete(key: string): Promise<void> {
    await this.db.execute(`DELETE FROM hub_cache WHERE key = ?`, [key]);
  }

  async setCards(cards: unknown[]): Promise<void> {
    await this.set('dock.cards', cards, 'CARDS');
  }

  async getCards<T = unknown>(): Promise<T[]> {
    return (await this.get<T[]>('dock.cards')) ?? [];
  }

  async listByKind(kind: CardKind | string): Promise<CacheEntry[]> {
    const result = (await this.db.execute(
      `SELECT key, value, kind, updated_at AS updatedAt FROM hub_cache WHERE kind = ?`,
      [kind],
    )) as QueryResult;
    return (result.rows ?? []).map(row => ({
      key: String(row.key),
      value: String(row.value),
      kind: row.kind == null ? null : String(row.kind),
      updatedAt: String(row.updatedAt),
    }));
  }
}
