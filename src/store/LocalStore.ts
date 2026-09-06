import type { SqlExecutor } from '../db/migrations';
import { applyMigrations } from '../db/migrations';
import { CacheDao } from './daos/CacheDao';
import { EventLogDao } from './daos/EventLogDao';
import { OutboxDao } from './daos/OutboxDao';

export class LocalStore {
  readonly outbox: OutboxDao;
  readonly cache: CacheDao;
  readonly events: EventLogDao;

  private constructor(private readonly executor: SqlExecutor) {
    this.outbox = new OutboxDao(executor);
    this.cache = new CacheDao(executor);
    this.events = new EventLogDao(executor);
  }

  /** Production path — opens op-sqlite DB and migrates. */
  static async open(): Promise<LocalStore> {
    const { openCompanionDatabase } = await import('../db/openDatabase');
    const db = await openCompanionDatabase();
    return new LocalStore({
      execute: (sql, params) => db.execute(sql, params as never[]),
    });
  }

  /** Test / inject path — caller supplies an executor (already migrated). */
  static fromExecutor(executor: SqlExecutor): LocalStore {
    return new LocalStore(executor);
  }

  static async fromExecutorMigrated(executor: SqlExecutor): Promise<LocalStore> {
    await applyMigrations(executor);
    return new LocalStore(executor);
  }
}
