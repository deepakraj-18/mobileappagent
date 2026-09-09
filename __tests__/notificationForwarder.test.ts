import { NotificationForwarder } from '../src/proactivity/notificationForwarder';
import { CompanionSettings } from '../src/hub/CompanionSettings';
import { MockHubClient } from '../src/hub/MockHubClient';

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

describe('NotificationForwarder', () => {
  beforeEach(async () => {
    await CompanionSettings.replace({});
    await NotificationForwarder.setOptedIn(false);
  });

  it('defaults to off and does not forward', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const sent = await NotificationForwarder.handlePosted(hub, {
      packageName: 'com.whatsapp',
      title: 'Hi',
      text: 'Hello',
      postedAt: Date.now(),
      key: 'k1',
    });
    expect(sent).toBe(false);
    expect(hub.sent).toHaveLength(0);
  });

  it('forwards when opted in', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    await NotificationForwarder.setOptedIn(true);
    const sent = await NotificationForwarder.handlePosted(hub, {
      packageName: 'com.whatsapp',
      title: 'Hi',
      text: 'Hello',
      postedAt: Date.now(),
      key: 'k2',
    });
    expect(sent).toBe(true);
    expect(
      hub.sent.some(
        f =>
          f.type === 'event' &&
          (f.payload as { event: string }).event === 'NOTIFICATION_FORWARDED',
      ),
    ).toBe(true);
  });
});
