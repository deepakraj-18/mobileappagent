import { HubAuth, type HubAuthTokenStore, type HubSession } from '../src/hub/HubAuth';
import { HubConfig } from '../src/hub/HubConfig';
import { LifeOsHubPaths } from '../src/hub/allowList';

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

describe('HubAuth', () => {
  beforeEach(async () => {
    await HubConfig.setBaseUrl('https://lifeos.example');
  });

  it('pairs via allow-listed path and stores session', async () => {
    const store = memoryStore();
    const fetchFn = jest.fn(async (url: string) => {
      expect(url).toBe(`https://lifeos.example${LifeOsHubPaths.PAIR}`);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            deviceId: 'dev_1',
            deviceToken: 'tok',
            refreshToken: 'ref',
            tokenExpiresAt: '2099-01-01T00:00:00Z',
            wsUrl: 'wss://lifeos.example/v1/companion/stream',
          },
        }),
      } as Response;
    });

    const auth = new HubAuth({ store, fetchFn });
    const session = await auth.pair('7F3K-9Q2D', {
      platform: 'ANDROID',
      model: 'vivo 1902',
      osVersion: '9',
      appVersion: '0.0.1',
    });
    expect(session.deviceId).toBe('dev_1');
    expect(auth.isPaired()).toBe(true);
    expect(store.value?.deviceToken).toBe('tok');
  });

  it('refreshes via allow-listed path', async () => {
    const store = memoryStore();
    store.value = {
      deviceId: 'dev_1',
      deviceToken: 'old',
      refreshToken: 'ref',
      tokenExpiresAt: '2000-01-01T00:00:00Z',
      wsUrl: 'wss://x/v1/companion/stream',
    };
    const fetchFn = jest.fn(async (url: string) => {
      expect(url).toContain(LifeOsHubPaths.TOKEN_REFRESH);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            deviceToken: 'new',
            tokenExpiresAt: '2099-01-01T00:00:00Z',
          },
        }),
      } as Response;
    });
    const auth = new HubAuth({ store, fetchFn });
    await auth.hydrate();
    const next = await auth.refresh();
    expect(next.deviceToken).toBe('new');
  });

  it('clear wipes pairing', async () => {
    const store = memoryStore();
    const auth = new HubAuth({
      store,
      fetchFn: async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response,
    });
    store.value = {
      deviceId: 'd',
      deviceToken: 't',
      refreshToken: 'r',
      tokenExpiresAt: '2099-01-01T00:00:00Z',
      wsUrl: 'wss://x/v1/companion/stream',
    };
    await auth.hydrate();
    await auth.clear();
    expect(auth.isPaired()).toBe(false);
  });
});
