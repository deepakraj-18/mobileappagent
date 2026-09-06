import {
  applyMigrations,
  createMemoryExecutor,
  getSchemaVersion,
} from '../src/db/migrations';
import { SCHEMA_VERSION } from '../src/db/schema';

describe('DB001 migrations', () => {
  it('applies v1 schema and records version', async () => {
    const db = createMemoryExecutor();
    expect(await getSchemaVersion(db)).toBe(0);
    const next = await applyMigrations(db);
    expect(next).toBe(SCHEMA_VERSION);
    expect(db.version).toBe(1);
    expect(db.statements.some(s => s.includes('hub_outbox'))).toBe(true);
    expect(db.statements.some(s => s.includes('hub_cache'))).toBe(true);
    expect(db.statements.some(s => s.includes('event_log'))).toBe(true);
    expect(
      db.statements.some(s => s.includes('idx_hub_outbox_status_created')),
    ).toBe(true);
  });

  it('is idempotent when already at SCHEMA_VERSION', async () => {
    const db = createMemoryExecutor();
    await applyMigrations(db);
    const createsBefore = db.statements.filter(s =>
      s.toUpperCase().includes('CREATE TABLE'),
    ).length;
    await applyMigrations(db);
    const createsAfter = db.statements.filter(s =>
      s.toUpperCase().includes('CREATE TABLE'),
    ).length;
    expect(createsAfter).toBe(createsBefore);
  });
});
