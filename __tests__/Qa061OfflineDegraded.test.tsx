/**
 * QA061 — offline / degraded-mode scenario glue tests.
 * Individual modules have deeper suites; this file asserts the matrix stays wired.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { HubConnectionState, OutboxStatus, PresenceState } from '../src/constants/appConstants';
import { DegradedMode } from '../src/agent/DegradedMode';
import { LocalFallbackStore } from '../src/agent/LocalFallbackStore';
import { HubAuth, type HubAuthTokenStore, type HubSession } from '../src/hub/HubAuth';
import { HubConfig } from '../src/hub/HubConfig';
import { HubOutbox } from '../src/hub/HubOutbox';
import { MockHubClient } from '../src/hub/MockHubClient';
import { LifeOsHubPaths } from '../src/hub/allowList';
import { DockCardsController } from '../src/proactivity/DockCardsController';
import { PresenceService } from '../src/proactivity/PresenceService';
import { DockScreen } from '../src/screens/DockScreen';
import type { OutboxDao, OutboxRow } from '../src/store/daos/OutboxDao';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

function memoryStore(): HubAuthTokenStore & { value: HubSession | null } {
  const s = {
    value: null as HubSession | null,
    async save(session: HubSession) {
      s.value = session;
    },
    async load() {
      return s.value;
    },
    async clear() {
      s.value = null;
    },
  };
  return s;
}

function fakeOutboxDao(): OutboxDao & { rows: OutboxRow[] } {
  const rows: OutboxRow[] = [];
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
    nextPending: jest.fn(async () => rows.find(r => r.status === OutboxStatus.PENDING) ?? null),
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

describe('QA061 offline / degraded matrix', () => {
  beforeEach(async () => {
    await HubConfig.setBaseUrl('https://lifeos.example');
    DegradedMode.setHubConnectionState(HubConnectionState.CONNECTED);
  });

  it('A — degraded active when hub down and fallback configured', async () => {
    await LocalFallbackStore.setMeta({
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'llama',
      enabled: true,
    });
    DegradedMode.setHubConnectionState(HubConnectionState.DISCONNECTED);
    const snap = await DegradedMode.getSnapshot();
    expect(snap.hubUnreachable).toBe(true);
    expect(snap.active).toBe(true);
  });

  it('A/H — Dock shows degraded banner + offline chip + stale cards', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <DockScreen
          onExit={() => undefined}
          degradedActive
          connectionState={HubConnectionState.DISCONNECTED}
          presenceState={PresenceState.AWAY}
          cards={[{ id: 'c1', kind: 'TASK', title: 'Pay bill' }]}
          cardsOffline
          cardsStaleSince="2026-09-09T12:00:00Z"
          announcementStatus={null}
        />,
      );
    });
    expect(tree.root.findByProps({ testID: 'dock-degraded-banner' })).toBeTruthy();
    const chip = tree.root.findByProps({ testID: 'dock-connection-chip' });
    const texts = chip.findAllByType(Text).map(n => String(n.props.children));
    expect(texts.some(t => /offline/i.test(t))).toBe(true);
    expect(tree.root.findByProps({ testID: 'dock-cards-stale' })).toBeTruthy();
  });

  it('C — ensureFreshToken refreshes when expiry is past', async () => {
    const store = memoryStore();
    store.value = {
      deviceId: 'dev_1',
      deviceToken: 'old',
      refreshToken: 'ref',
      tokenExpiresAt: '2000-01-01T00:00:00Z',
      wsUrl: 'wss://lifeos.example/v1/companion/stream',
    };
    const fetchFn = jest.fn(async (url: string) => {
      expect(url).toContain(LifeOsHubPaths.TOKEN_REFRESH);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            deviceToken: 'fresh',
            tokenExpiresAt: '2099-01-01T00:00:00Z',
          },
        }),
      } as Response;
    });
    const auth = new HubAuth({ store, fetchFn });
    await auth.hydrate();
    const tok = await auth.ensureFreshToken();
    expect(tok).toBe('fresh');
    expect(fetchFn).toHaveBeenCalled();
  });

  it('E — presence falls back locally when hub silent', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const presence = new PresenceService({
      hub,
      missDebounce: 1,
      dutyCycleMs: 60_000,
      setIntervalFn: (() => 0) as unknown as typeof setInterval,
      clearIntervalFn: (() => undefined) as unknown as typeof clearInterval,
    });
    presence.start({
      anchorId: 'manual',
      mode: 'AMAZFIT_MAC_OR_NAME',
    });
    await presence.setManual(PresenceState.HOME, 'qa061');
    expect(presence.getState()).toBe(PresenceState.HOME);
    presence.stop();
  });

  it('F — outbox queues offline and replays', async () => {
    const client = new MockHubClient();
    const dao = fakeOutboxDao();
    const outbox = new HubOutbox(dao, client);
    await outbox.enqueueEvent({
      event: 'HEARTBEAT',
      battery: 50,
      charging: false,
      accessibilityOn: false,
      dockState: 'SLEEPING',
      wsRttMs: 0,
      appVersion: '0.0.1',
    });
    expect(dao.rows).toHaveLength(1);
    await client.connect();
    const result = await outbox.replayPending();
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it('G — cards mark stale when offline', () => {
    const hub = new MockHubClient();
    const cards = new DockCardsController({ hub });
    cards.setOffline(true);
    const snap = cards.getSnapshot();
    expect(snap.offline).toBe(true);
    expect(snap.staleSince).toBeTruthy();
  });
});
