import {
  AppLimits,
  EventLogLevel,
  OutboxStatus,
} from '../src/constants/appConstants';
import { LocalStore } from '../src/store/LocalStore';
import { createFakeCompanionDb } from '../src/store/testing/fakeDb';

describe('LocalStore DAOs', () => {
  it('enqueues outbox FIFO and acks', async () => {
    const fake = createFakeCompanionDb();
    const store = await LocalStore.fromExecutorMigrated(fake);
    const a = await store.outbox.enqueue({ n: 1 });
    const b = await store.outbox.enqueue({ n: 2 });
    const first = await store.outbox.nextPending();
    expect(first?.id).toBe(a);
    await store.outbox.markInFlight(a);
    await store.outbox.ack(a);
    const second = await store.outbox.nextPending();
    expect(second?.id).toBe(b);
    expect(fake.tables.hub_outbox.find(r => String(r.id) === a)?.status).toBe(
      OutboxStatus.ACKED,
    );
  });

  it('stores cache kv and dock cards', async () => {
    const store = await LocalStore.fromExecutorMigrated(
      createFakeCompanionDb(),
    );
    await store.cache.set('cfg', { x: 1 });
    expect(await store.cache.get('cfg')).toEqual({ x: 1 });
    await store.cache.setCards([{ id: 'c1', kind: 'INFO' }]);
    expect(await store.cache.getCards()).toEqual([{ id: 'c1', kind: 'INFO' }]);
  });

  it('appends event log and returns recent', async () => {
    const store = await LocalStore.fromExecutorMigrated(
      createFakeCompanionDb(),
    );
    await store.events.append(EventLogLevel.INFO, 'boot', 'hello');
    const recent = await store.events.recent(10);
    expect(recent[0]?.message).toBe('hello');
    expect(AppLimits.EVENT_LOG_CAP).toBeGreaterThan(0);
  });
});
