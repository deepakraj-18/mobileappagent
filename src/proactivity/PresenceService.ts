import {
  PresenceState,
  type PresenceState as PresenceStateType,
} from '../constants/appConstants';
import type { HubClient } from '../hub/HubClient';
import type { CompanionConfig, HubCommandPayload, HubFrame } from '../hub/types';
import { CompanionSettings } from '../hub/CompanionSettings';
import {
  NoopBleAnchorScanner,
  sightingMatchesAnchor,
  type BleAnchorConfig,
  type BleAnchorScanner,
} from './BleAnchorScanner';

export type PresenceServiceDeps = {
  hub: HubClient;
  scanner?: BleAnchorScanner;
  getConfig?: () => CompanionConfig;
  /** Misses before flipping local HOME → AWAY. */
  missDebounce?: number;
  dutyCycleMs?: number;
  onAutoSleep?: (reason: string) => void | Promise<void>;
  now?: () => number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

type Listener = (state: PresenceStateType) => void;

/**
 * hub-contract §8.4 — hub PRESENCE authoritative; local BLE/manual/voice fallback.
 */
export class PresenceService {
  private readonly hub: HubClient;
  private readonly scanner: BleAnchorScanner;
  private readonly getConfig: () => CompanionConfig;
  private readonly missDebounce: number;
  private readonly dutyCycleMs: number;
  private readonly onAutoSleep?: (reason: string) => void | Promise<void>;
  private readonly now: () => number;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;

  private hubState: PresenceStateType | null = null;
  private hubTs = 0;
  private localState: PresenceStateType = PresenceState.UNKNOWN;
  private resolved: PresenceStateType = PresenceState.UNKNOWN;
  private missCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();
  private bleConfig: BleAnchorConfig | null = null;

  constructor(deps: PresenceServiceDeps) {
    this.hub = deps.hub;
    this.scanner = deps.scanner ?? new NoopBleAnchorScanner();
    this.getConfig = deps.getConfig ?? (() => CompanionSettings.get());
    this.missDebounce = deps.missDebounce ?? 3;
    this.dutyCycleMs = deps.dutyCycleMs ?? 15_000;
    this.onAutoSleep = deps.onAutoSleep;
    this.now = deps.now ?? (() => Date.now());
    this.setIntervalFn = deps.setIntervalFn ?? setInterval;
    this.clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  }

  getState(): PresenceStateType {
    return this.resolved;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.resolved);
    return () => this.listeners.delete(listener);
  }

  start(bleConfig?: BleAnchorConfig): () => void {
    this.bleConfig = bleConfig ?? this.bleConfigFromSettings();
    this.unsub?.();
    this.unsub = this.hub.onCommand(frame => {
      void this.onCommand(frame);
    });
    void this.scanner.start(this.bleConfig);
    if (this.timer) {
      this.clearIntervalFn(this.timer);
    }
    this.timer = this.setIntervalFn(() => {
      void this.dutyCycle();
    }, this.dutyCycleMs);
    this.recompute('start');
    return () => this.stop();
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
    if (this.timer) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    void this.scanner.stop();
  }

  /** Manual toggle from Dock / settings. */
  async setManual(state: PresenceStateType, source = 'manual'): Promise<void> {
    await this.applyLocal(state, source);
  }

  /** Voice "sleep" / go away. */
  async voiceSleep(): Promise<void> {
    await this.applyLocal(PresenceState.AWAY, 'voice_sleep');
  }

  private bleConfigFromSettings(): BleAnchorConfig {
    const cfg = this.getConfig();
    const anchorId = String(
      (cfg as { presenceAnchorId?: string }).presenceAnchorId ?? 'amazfit',
    );
    if (anchorId === 'galaxy_watch' || anchorId === 'bonded') {
      return { anchorId, mode: 'BONDED_DEVICE' };
    }
    return {
      anchorId,
      mode: 'AMAZFIT_MAC_OR_NAME',
      match: anchorId === 'amazfit' ? 'amazfit' : anchorId,
    };
  }

  private async onCommand(
    frame: HubFrame<HubCommandPayload>,
  ): Promise<void> {
    if (frame.payload.command !== 'PRESENCE') {
      return;
    }
    const state = String(frame.payload.state ?? '').toUpperCase();
    if (state !== PresenceState.HOME && state !== PresenceState.AWAY) {
      return;
    }
    this.hubState = state as PresenceStateType;
    this.hubTs = this.now();
    this.recompute('hub');
  }

  private async dutyCycle(): Promise<void> {
    if (!this.bleConfig || this.bleConfig.anchorId === 'none' || this.bleConfig.anchorId === 'manual') {
      return;
    }
    if (this.hubFresh()) {
      return;
    }
    const sightings = await this.scanner.poll();
    const seen = sightingMatchesAnchor(sightings, this.bleConfig);
    if (seen) {
      this.missCount = 0;
      await this.applyLocal(PresenceState.HOME, 'ble');
    } else {
      this.missCount += 1;
      if (this.missCount >= this.missDebounce) {
        await this.applyLocal(PresenceState.AWAY, 'ble_miss');
      }
    }
  }

  private hubFresh(): boolean {
    if (!this.hubState) {
      return false;
    }
    const staleAfter =
      (this.getConfig().presence?.staleAfterSec ?? 300) * 1000;
    return this.now() - this.hubTs < staleAfter;
  }

  private async applyLocal(
    state: PresenceStateType,
    source: string,
  ): Promise<void> {
    if (this.localState === state) {
      this.recompute(source);
      return;
    }
    this.localState = state;
    await this.hub.sendEvent({
      event: 'PRESENCE_LOCAL',
      state,
      source,
    });
    this.recompute(source);
  }

  private recompute(reason: string): void {
    const prev = this.resolved;
    if (this.hubFresh() && this.hubState) {
      this.resolved = this.hubState;
    } else if (this.localState !== PresenceState.UNKNOWN) {
      this.resolved = this.localState;
    } else {
      this.resolved = PresenceState.UNKNOWN;
    }
    if (this.resolved !== prev) {
      for (const l of this.listeners) {
        l(this.resolved);
      }
      if (this.resolved === PresenceState.AWAY) {
        void this.onAutoSleep?.(reason);
      }
    }
  }
}
