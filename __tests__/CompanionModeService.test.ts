import { CompanionMode } from '../src/constants/appConstants';
import { CompanionModeService } from '../src/services/CompanionModeService';

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

describe('CompanionModeService', () => {
  beforeEach(async () => {
    await CompanionModeService.setMode(CompanionMode.OPERATOR);
  });

  it('persists docked mode and notifies subscribers', async () => {
    const seen: CompanionMode[] = [];
    const unsub = CompanionModeService.subscribe(m => seen.push(m));
    await CompanionModeService.enterDocked();
    expect(CompanionModeService.isDocked()).toBe(true);
    expect(seen).toContain(CompanionMode.DOCKED);
    await CompanionModeService.hydrate();
    expect(CompanionModeService.getMode()).toBe(CompanionMode.DOCKED);
    unsub();
  });
});
