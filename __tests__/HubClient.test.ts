import { OutboxStatus } from '../src/constants/appConstants';
import {
  LIFEOS_HUB_ALLOW_LIST,
  LifeOsHubPaths,
  assertHubPathAllowed,
} from '../src/hub/allowList';
import { HubOutbox } from '../src/hub/HubOutbox';
import { MockHubClient } from '../src/hub/MockHubClient';
import { makeFrame } from '../src/hub/types';
import type { OutboxDao, OutboxRow } from '../src/store/daos/OutboxDao';

describe('hub allow-list', () => {
  it('includes only companion hub paths', () => {
    expect(LIFEOS_HUB_ALLOW_LIST.has(LifeOsHubPaths.PAIR)).toBe(true);
    expect(LIFEOS_HUB_ALLOW_LIST.has('/v1/companion/stream')).toBe(true);
    expect(() => assertHubPathAllowed('/api/Password/reveal')).toThrow(
      /allow-list/,
    );
  });
});

describe('MockHubClient', () => {
  it('connects, sends events, and delivers scripted command replies', async () => {
    const client = new MockHubClient({
      onConnect: [
        makeFrame('welcome', { sessionId: 's1', config: {}, missed: [] }),
      ],
      replies: {
        VOICE_INPUT: [
          makeFrame('command', {
            command: 'SPEAK',
            text: 'Hello',
          }),
        ],
      },
    });

    const commands: string[] = [];
    client.onCommand(frame => {
      commands.push(String(frame.payload.command));
    });

    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.sendEvent({
      event: 'VOICE_INPUT',
      transcript: 'hi',
      wantsSpoken: true,
    });
    expect(client.sent.some(f => f.type === 'event')).toBe(true);
    expect(commands).toContain('SPEAK');

    // Idempotent re-delivery
    const cmd = makeFrame('command', {
      command: 'WAKE' as const,
    });
    await client.pushCommand(cmd);
    await client.pushCommand(cmd);
    expect(commands.filter(c => c === 'WAKE')).toHaveLength(1);
  });
});

describe('HubOutbox', () => {
  function fakeDao(seed: OutboxRow[] = []): OutboxDao & { rows: OutboxRow[] } {
    const rows = [...seed];
    return {
      rows,
      enqueue: jest.fn(async (payload: unknown) => {
        const id = `obx_${rows.length + 1}`;
        rows.push({
          id,
          payload: JSON.stringify(payload),
          status: OutboxStatus.PENDING,
          attempts: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return id;
      }),
      nextPending: jest.fn(async () => {
        const row = rows.find(r => r.status === OutboxStatus.PENDING);
        return row ?? null;
      }),
      markInFlight: jest.fn(async (id: string) => {
        const row = rows.find(r => r.id === id);
        if (row) {
          row.status = OutboxStatus.IN_FLIGHT;
          row.attempts += 1;
        }
      }),
      ack: jest.fn(async (id: string) => {
        const row = rows.find(r => r.id === id);
        if (row) {
          row.status = OutboxStatus.ACKED;
        }
      }),
      markFailed: jest.fn(async (id: string) => {
        const row = rows.find(r => r.id === id);
        if (row) {
          row.status = OutboxStatus.FAILED;
        }
      }),
      enforceCap: jest.fn(async () => undefined),
      count: jest.fn(async () => rows.length),
    } as unknown as OutboxDao & { rows: OutboxRow[] };
  }

  it('queues when disconnected and replays on reconnect', async () => {
    const client = new MockHubClient();
    const dao = fakeDao();
    const outbox = new HubOutbox(dao, client);

    const id = await outbox.enqueueEvent({
      event: 'HEARTBEAT',
      battery: 80,
      charging: true,
      accessibilityOn: true,
      dockState: 'AWAKE',
      wsRttMs: 0,
      appVersion: '0.0.1',
    });
    expect(id).toMatch(/^obx_/);
    expect(dao.rows).toHaveLength(1);

    await client.connect();
    const result = await outbox.replayPending();
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(client.sent).toHaveLength(1);
    expect(dao.rows[0]?.status).toBe(OutboxStatus.ACKED);
  });
});
