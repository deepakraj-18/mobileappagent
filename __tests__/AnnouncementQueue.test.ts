import { PresenceState } from '../src/constants/appConstants';
import {
  AnnouncementQueue,
  isWithinQuietHours,
} from '../src/proactivity/AnnouncementQueue';
import { MockHubClient } from '../src/hub/MockHubClient';
import { makeFrame } from '../src/hub/types';
import type { Embodiment } from '../src/embodiment/Embodiment';

function mockEmbodiment(): Embodiment & { spoken: string[] } {
  const spoken: string[] = [];
  return {
    spoken,
    speak: async (text: string) => {
      spoken.push(text);
    },
    express: async () => undefined,
    move: async () => undefined,
    present: async () => undefined,
  };
}

describe('isWithinQuietHours', () => {
  it('handles overnight window', () => {
    const night = new Date(2026, 8, 9, 23, 0);
    const morning = new Date(2026, 8, 9, 6, 0);
    const noon = new Date(2026, 8, 9, 12, 0);
    expect(isWithinQuietHours(night, '22:30', '07:00')).toBe(true);
    expect(isWithinQuietHours(morning, '22:30', '07:00')).toBe(true);
    expect(isWithinQuietHours(noon, '22:30', '07:00')).toBe(false);
  });
});

describe('AnnouncementQueue', () => {
  it('speaks and reports SPOKEN when gates pass', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const emb = mockEmbodiment();
    const q = new AnnouncementQueue({
      hub,
      embodiment: emb,
      getPresence: () => PresenceState.HOME,
      getConfig: () => ({}),
      now: () => new Date(2026, 8, 9, 12, 0),
    });

    const outcome = await q.enqueue({
      announcementId: 'a1',
      text: 'Hello',
      priority: 'NORMAL',
    });
    expect(outcome).toBe('SPOKEN');
    expect(emb.spoken).toEqual(['Hello']);
    expect(
      hub.sent.some(
        f =>
          f.type === 'event' &&
          (f.payload as { outcome: string }).outcome === 'SPOKEN',
      ),
    ).toBe(true);
  });

  it('suppresses during quiet hours unless URGENT or override', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const emb = mockEmbodiment();
    const q = new AnnouncementQueue({
      hub,
      embodiment: emb,
      getPresence: () => PresenceState.HOME,
      getConfig: () => ({
        quietHours: { start: '22:30', end: '07:00', tz: 'local' },
      }),
      now: () => new Date(2026, 8, 9, 23, 0),
    });

    expect(
      await q.enqueue({
        announcementId: 'q1',
        text: 'night',
        priority: 'NORMAL',
      }),
    ).toBe('SUPPRESSED_QUIET_HOURS');
    expect(emb.spoken).toHaveLength(0);

    expect(
      await q.enqueue({
        announcementId: 'q2',
        text: 'urgent',
        priority: 'URGENT',
      }),
    ).toBe('SPOKEN');
    expect(emb.spoken).toEqual(['urgent']);
  });

  it('queues when requiresPresence and not HOME, then speaks on HOME', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const emb = mockEmbodiment();
    let presence: (typeof PresenceState)[keyof typeof PresenceState] =
      PresenceState.AWAY;
    const q = new AnnouncementQueue({
      hub,
      embodiment: emb,
      getPresence: () => presence,
      getConfig: () => ({}),
      now: () => new Date(2026, 8, 9, 12, 0),
    });

    expect(
      await q.enqueue({
        announcementId: 'p1',
        text: 'welcome home',
        priority: 'NORMAL',
        requiresPresence: true,
      }),
    ).toBe('QUEUED_NOT_PRESENT');

    presence = PresenceState.HOME;
    await q.onPresenceChanged(PresenceState.HOME);
    expect(emb.spoken).toEqual(['welcome home']);
  });

  it('fire-once ignores duplicate speak', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const emb = mockEmbodiment();
    const q = new AnnouncementQueue({
      hub,
      embodiment: emb,
      getPresence: () => PresenceState.HOME,
      getConfig: () => ({}),
      now: () => new Date(2026, 8, 9, 12, 0),
    });
    await q.enqueue({
      announcementId: 'dup',
      text: 'once',
      priority: 'HIGH',
    });
    await q.enqueue({
      announcementId: 'dup',
      text: 'once',
      priority: 'HIGH',
    });
    expect(emb.spoken).toEqual(['once']);
  });

  it('handles inbound ANNOUNCE command', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const emb = mockEmbodiment();
    const q = new AnnouncementQueue({
      hub,
      embodiment: emb,
      getPresence: () => PresenceState.HOME,
      getConfig: () => ({}),
      now: () => new Date(2026, 8, 9, 12, 0),
    });
    q.start();
    await hub.pushCommand(
      makeFrame('command', {
        command: 'ANNOUNCE',
        announcementId: 'cmd1',
        text: 'from hub',
        priority: 'NORMAL',
      }),
    );
    await new Promise<void>(r => setTimeout(() => r(), 20));
    expect(emb.spoken).toContain('from hub');
  });

  it('ack and snooze report outcomes', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const emb = mockEmbodiment();
    const q = new AnnouncementQueue({
      hub,
      embodiment: emb,
      getPresence: () => PresenceState.HOME,
      getConfig: () => ({}),
    });
    await q.ack('a-ack');
    await q.snooze('a-sn', '2026-09-09T18:00:00Z');
    const outcomes = hub.sent
      .filter(f => f.type === 'event')
      .map(f => (f.payload as { outcome: string }).outcome);
    expect(outcomes).toContain('ACKED_BY_USER');
    expect(outcomes).toContain('SNOOZED');
  });
});
