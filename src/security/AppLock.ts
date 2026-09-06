import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import * as Keychain from 'react-native-keychain';
import { AppLimits } from '../constants/appConstants';

const rnBiometrics = new ReactNativeBiometrics({
  allowDeviceCredentials: true,
});

const KEYCHAIN_SERVICE = 'com.privateagent.app-lock';
const KEYCHAIN_USERNAME = 'app-lock';

export type UnlockResult =
  | { ok: true; method: 'biometric' | 'password' | 'open' }
  | { ok: false; reason: string };

export type BiometricAvailability = {
  available: boolean;
  biometryType: string | null;
};

export type AppLockPasswordStore = {
  hasPassword(): Promise<boolean>;
  setPassword(password: string): Promise<void>;
  verifyPassword(password: string): Promise<boolean>;
  clearPassword(): Promise<void>;
};

const defaultPasswordStore: AppLockPasswordStore = {
  async hasPassword() {
    try {
      const creds = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
      });
      return Boolean(creds && creds.password);
    } catch {
      return false;
    }
  },
  async setPassword(password: string) {
    await Keychain.setGenericPassword(KEYCHAIN_USERNAME, password, {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async verifyPassword(password: string) {
    const creds = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE,
    });
    if (!creds || !creds.password) {
      return false;
    }
    return creds.password === password;
  },
  async clearPassword() {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  },
};

/**
 * App lock controller — biometric gate with Keystore-backed password fallback (SC006).
 */
class AppLockImpl {
  private locked = true;
  private readonly listeners = new Set<(locked: boolean) => void>();
  private passwords: AppLockPasswordStore = defaultPasswordStore;

  /** Test seam — inject a fake password store. */
  setPasswordStore(store: AppLockPasswordStore): void {
    this.passwords = store;
  }

  isLocked(): boolean {
    return this.locked;
  }

  lock(): void {
    if (!this.locked) {
      this.locked = true;
      this.emit();
    }
  }

  async getBiometricAvailability(): Promise<BiometricAvailability> {
    try {
      const { available, biometryType } =
        await rnBiometrics.isSensorAvailable();
      return {
        available: Boolean(available),
        biometryType: biometryType ?? null,
      };
    } catch {
      return { available: false, biometryType: null };
    }
  }

  async hasPassword(): Promise<boolean> {
    return this.passwords.hasPassword();
  }

  async setPassword(
    password: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const trimmed = password.trim();
    if (trimmed.length < AppLimits.APP_LOCK_PASSWORD_MIN_LEN) {
      return {
        ok: false,
        reason: `Password must be at least ${AppLimits.APP_LOCK_PASSWORD_MIN_LEN} characters`,
      };
    }
    try {
      await this.passwords.setPassword(trimmed);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async unlockWithPassword(password: string): Promise<UnlockResult> {
    try {
      const has = await this.passwords.hasPassword();
      if (!has) {
        return { ok: false, reason: 'no_password_set' };
      }
      const match = await this.passwords.verifyPassword(password.trim());
      if (!match) {
        return { ok: false, reason: 'wrong_password' };
      }
      this.locked = false;
      this.emit();
      return { ok: true, method: 'password' };
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async unlock(prompt = 'Unlock PrivateAgent'): Promise<UnlockResult> {
    try {
      const { available } = await this.getBiometricAvailability();
      if (!available) {
        return { ok: false, reason: 'biometric_unavailable' };
      }
      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: prompt,
        cancelButtonText: 'Cancel',
      });
      if (!success) {
        return { ok: false, reason: 'cancelled' };
      }
      this.locked = false;
      this.emit();
      return { ok: true, method: 'biometric' };
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** Gate for destructive / irreversible actions (SECURITY.md §5) — always re-prompts. */
  async requireUnlock(reason: string): Promise<boolean> {
    const bio = await this.unlock(reason);
    if (bio.ok) {
      return true;
    }
    // Caller UI should fall back to password; keep API boolean for existing hooks.
    return false;
  }

  subscribe(listener: (locked: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.locked);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.locked);
    }
  }
}

export const AppLock = new AppLockImpl();
export { BiometryTypes };
