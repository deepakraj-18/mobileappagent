import { AppLimits } from '../src/constants/appConstants';
import {
  AppLock,
  type AppLockPasswordStore,
} from '../src/security/AppLock';

function memoryStore(): AppLockPasswordStore & { value: string | null } {
  const store = {
    value: null as string | null,
    async hasPassword() {
      return store.value != null && store.value.length > 0;
    },
    async setPassword(password: string) {
      store.value = password;
    },
    async verifyPassword(password: string) {
      return store.value === password;
    },
    async clearPassword() {
      store.value = null;
    },
  };
  return store;
}

describe('AppLock password fallback', () => {
  beforeEach(() => {
    AppLock.setPasswordStore(memoryStore());
    AppLock.lock();
  });

  it('rejects short passwords', async () => {
    const result = await AppLock.setPassword('ab');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(String(AppLimits.APP_LOCK_PASSWORD_MIN_LEN));
    }
  });

  it('unlocks with the correct password and rejects wrong ones', async () => {
    const set = await AppLock.setPassword('secret1');
    expect(set.ok).toBe(true);
    expect(AppLock.isLocked()).toBe(true);

    const wrong = await AppLock.unlockWithPassword('nope');
    expect(wrong.ok).toBe(false);
    expect(AppLock.isLocked()).toBe(true);

    const ok = await AppLock.unlockWithPassword('secret1');
    expect(ok).toEqual({ ok: true, method: 'password' });
    expect(AppLock.isLocked()).toBe(false);
  });

  it('reports no_password_set when none enrolled', async () => {
    const result = await AppLock.unlockWithPassword('anything');
    expect(result).toEqual({ ok: false, reason: 'no_password_set' });
  });
});
