import { PresenceState } from '../src/constants/appConstants';
import { MockHubClient } from '../src/hub/MockHubClient';
import { makeFrame, type HubCommandPayload, type HubFrame } from '../src/hub/types';
import { ProactivityRuntime } from '../src/proactivity/ProactivityRuntime';

jest.mock('../src/store/LocalStore', () => ({
  LocalStore: {
    open: async () => {
      throw new Error('no store in test');
    },
  },
}));

jest.mock('../src/embodiment/PhoneEmbodiment', () => ({
  phoneEmbodiment: {
    speak: jest.fn(async () => undefined),
    express: jest.fn(async () => undefined),
    move: jest.fn(async () => undefined),
    present: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/native/ScreenPower', () => ({
  ScreenPower: {
    sleep: jest.fn(async () => undefined),
  },
}));

describe('ProactivityRuntime', () => {
  afterEach(() => {
    ProactivityRuntime.stop();
  });

  it('starts presence, cards, announcements together', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    await ProactivityRuntime.start(hub);

    expect(ProactivityRuntime.isStarted()).toBe(true);
    expect(ProactivityRuntime.getPresence()).not.toBeNull();
    expect(ProactivityRuntime.getCards()).not.toBeNull();
    expect(ProactivityRuntime.getAnnouncements()).not.toBeNull();
    expect(ProactivityRuntime.getCards()?.getSnapshot().offline).toBe(false);
  });

  it('marks cards offline when hub disconnects', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    await ProactivityRuntime.start(hub);
    await hub.disconnect();
    expect(ProactivityRuntime.getCards()?.getSnapshot().offline).toBe(true);
  });

  it('flushes announcements when presence becomes HOME', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    await ProactivityRuntime.start(hub);

    const announce: HubFrame<HubCommandPayload> = makeFrame('command', {
      command: 'ANNOUNCE',
      announcementId: 'a1',
      text: 'Hello',
      priority: 'NORMAL',
      requiresPresence: true,
      quietHoursOverride: true,
    });
    await hub.pushCommand(announce);

    const presence = ProactivityRuntime.getPresence()!;
    await presence.setManual(PresenceState.HOME, 'test');

    await new Promise<void>(r => {
      setTimeout(() => r(), 50);
    });

    const spoken = hub.sent.some(
      f =>
        f.type === 'event' &&
        (f.payload as { event?: string; outcome?: string }).event ===
          'ANNOUNCEMENT_RESULT' &&
        (f.payload as { outcome?: string }).outcome === 'SPOKEN',
    );
    expect(spoken).toBe(true);
  });

  it('notifies onReady listeners when started', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const ready = jest.fn();
    const unsub = ProactivityRuntime.onReady(ready);
    await ProactivityRuntime.start(hub);
    expect(ready).toHaveBeenCalled();
    unsub();
  });
});
