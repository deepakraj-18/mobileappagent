import {
  HubConnectionState,
  type HubConnectionState as HubConnectionStateType,
} from '../constants/appConstants';
import { CompanionSettings } from '../hub/CompanionSettings';
import { LocalFallbackStore } from './LocalFallbackStore';

export type DegradedSnapshot = {
  /** Hub unreachable (unpaired / disconnected / reconnecting). */
  hubUnreachable: boolean;
  /** Config allows local fallback. */
  localFallbackEnabled: boolean;
  /** Provider has a base URL configured. */
  providerConfigured: boolean;
  /** Active degraded mode: unreachable + enabled + configured. */
  active: boolean;
};

type Listener = (snap: DegradedSnapshot) => void;

/**
 * hub-contract §9 — degraded mode when brain unreachable and local fallback is on.
 */
class DegradedModeImpl {
  private hubState: HubConnectionStateType = HubConnectionState.UNPAIRED;
  private readonly listeners = new Set<Listener>();

  setHubConnectionState(state: HubConnectionStateType): void {
    this.hubState = state;
    void this.emit();
  }

  async getSnapshot(): Promise<DegradedSnapshot> {
    const meta = await LocalFallbackStore.getMeta();
    const settings = CompanionSettings.get();
    const configEnabled =
      settings.localFallback?.enabled !== false && meta.enabled !== false;
    const hubUnreachable =
      this.hubState === HubConnectionState.UNPAIRED ||
      this.hubState === HubConnectionState.DISCONNECTED ||
      this.hubState === HubConnectionState.RECONNECTING ||
      this.hubState === HubConnectionState.DEGRADED;
    const providerConfigured = Boolean(meta.baseUrl && meta.model);
    return {
      hubUnreachable,
      localFallbackEnabled: configEnabled,
      providerConfigured,
      active: hubUnreachable && configEnabled && providerConfigured,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.getSnapshot().then(listener);
    return () => this.listeners.delete(listener);
  }

  private async emit(): Promise<void> {
    const snap = await this.getSnapshot();
    for (const l of this.listeners) {
      l(snap);
    }
  }
}

export const DegradedMode = new DegradedModeImpl();
