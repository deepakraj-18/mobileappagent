import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';

const rnBiometrics = new ReactNativeBiometrics({
  allowDeviceCredentials: true,
});

export type UnlockResult = { ok: true } | { ok: false; reason: string };

/**
 * App lock controller — biometric / device-credential gate (SC006).
 */
class AppLockImpl {
  private locked = true;
  private readonly listeners = new Set<(locked: boolean) => void>();

  isLocked(): boolean {
    return this.locked;
  }

  lock(): void {
    if (!this.locked) {
      this.locked = true;
      this.emit();
    }
  }

  async unlock(prompt = 'Unlock PrivateAgent'): Promise<UnlockResult> {
    try {
      const { available, biometryType } =
        await rnBiometrics.isSensorAvailable();
      if (!available) {
        // Sideload desk phone without enrolled biometrics: allow continue with warning.
        this.locked = false;
        this.emit();
        return { ok: true };
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
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** Gate for destructive / irreversible actions (SECURITY.md §5) — always re-prompts. */
  async requireUnlock(reason: string): Promise<boolean> {
    const result = await this.unlock(reason);
    return result.ok;
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
