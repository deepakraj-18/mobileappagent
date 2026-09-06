import { CompanionSettings } from '../src/hub/CompanionSettings';

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

describe('CompanionSettings', () => {
  beforeEach(async () => {
    await CompanionSettings.replace({});
  });

  it('merges CONFIG patches and persists', async () => {
    await CompanionSettings.apply({ wakePhrase: 'hey tess', heartbeatSec: 30 });
    expect(CompanionSettings.get().wakePhrase).toBe('hey tess');
    await CompanionSettings.apply({
      dock: { theme: 'dark', showClock: true, cardLimit: 5 },
    });
    expect(CompanionSettings.get().wakePhrase).toBe('hey tess');
    expect(CompanionSettings.get().dock?.theme).toBe('dark');
  });
});
