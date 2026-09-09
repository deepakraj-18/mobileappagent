import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  HubConnectionState,
  type HubConnectionState as HubConnectionStateType,
} from '../constants/appConstants';
import { CompanionRuntime } from '../native/CompanionRuntime';
import { CompanionModeService } from '../services/CompanionModeService';
import { AgentRuntime } from '../agent/AgentRuntime';
import { DegradedMode } from '../agent/DegradedMode';
import { ProactivityRuntime } from '../proactivity/ProactivityRuntime';
import { AzureHubClient } from './AzureHubClient';
import { CompanionSettings } from './CompanionSettings';
import { companionRestClient } from './CompanionRestClient';
import { startFcmReceiver } from './fcmReceiver';
import { hubAuth, type HubSession } from './HubAuth';
import { HubConfig } from './HubConfig';
import type {
  CompanionConfig,
  HubCommandPayload,
  HubFrame,
  PairDeviceInfo,
} from './types';

const LAST_SYNC_KEY = 'pa.hub.lastSyncAt';

export type HubRuntimeSnapshot = {
  connectionState: HubConnectionStateType;
  lastSyncAt: string | null;
  lastError: string | null;
  deviceId: string | null;
  baseUrl: string;
};

type Listener = (snap: HubRuntimeSnapshot) => void;

/**
 * Hub connection status + pair/retry/sign-out (FD030) and
 * startup / FGS / FCM / CONFIG wiring (FI030).
 */
class HubRuntimeImpl {
  private connectionState: HubConnectionStateType = HubConnectionState.UNPAIRED;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private baseUrl = '';
  private client: AzureHubClient | null = null;
  private readonly listeners = new Set<Listener>();
  private unsubConn: (() => void) | null = null;
  private unsubCmd: (() => void) | null = null;
  private unsubFcm: (() => void) | null = null;
  private connecting = false;
  private started = false;
  /** FGS started by hub (independent of dock mode). */
  private hubOwnsFgs = false;

  getSnapshot(): HubRuntimeSnapshot {
    return {
      connectionState: this.connectionState,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      deviceId: hubAuth.getSession()?.deviceId ?? null,
      baseUrl: this.baseUrl,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const l of this.listeners) {
      l(snap);
    }
  }

  private setState(
    connectionState: HubConnectionStateType,
    err?: string | null,
  ): void {
    this.connectionState = connectionState;
    if (err !== undefined) {
      this.lastError = err;
    }
    DegradedMode.setHubConnectionState(connectionState);
    this.emit();
  }

  /**
   * App / navigator boot: hydrate tokens, apply cached settings, connect if paired,
   * hold FGS for WSS, listen for FCM reconnect.
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await CompanionSettings.hydrate();
    await this.hydrate();
    this.unsubFcm = startFcmReceiver({
      onForceReconnect: () => this.retry().catch(() => undefined),
      onCompactCommand: payload => this.handleCompactCommand(payload),
    });
    if (hubAuth.isPaired()) {
      try {
        await this.connect();
      } catch {
        // LifeOSAPI hub may not exist yet — stay DISCONNECTED with lastError
      }
      void this.pullConfigQuiet();
    }
  }

  async stop(): Promise<void> {
    this.unsubFcm?.();
    this.unsubFcm = null;
    await this.teardownClient();
    await this.releaseHubFgs();
    this.started = false;
  }

  async hydrate(): Promise<HubRuntimeSnapshot> {
    this.baseUrl = await HubConfig.getBaseUrl();
    this.lastSyncAt = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const session = await hubAuth.hydrate();
    if (!session) {
      this.setState(HubConnectionState.UNPAIRED, null);
      return this.getSnapshot();
    }
    this.setState(HubConnectionState.DISCONNECTED, null);
    return this.getSnapshot();
  }

  async setBaseUrl(url: string): Promise<void> {
    await HubConfig.setBaseUrl(url);
    this.baseUrl = await HubConfig.getBaseUrl();
    this.emit();
  }

  defaultDeviceInfo(): PairDeviceInfo {
    return {
      platform: 'ANDROID',
      model: Platform.OS === 'android' ? 'android' : Platform.OS,
      osVersion: String(Platform.Version),
      appVersion: '0.0.1',
    };
  }

  async pair(pairingCode: string, device?: PairDeviceInfo): Promise<void> {
    const code = pairingCode.trim();
    if (!code) {
      throw new Error('Pairing code required');
    }
    this.setState(HubConnectionState.CONNECTING, null);
    try {
      await hubAuth.pair(code, device ?? this.defaultDeviceInfo());
      await this.markSynced();
      await this.connect();
      void this.pullConfigQuiet();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (hubAuth.isPaired()) {
        this.setState(HubConnectionState.DISCONNECTED, msg);
      } else {
        this.setState(HubConnectionState.UNPAIRED, msg);
      }
      throw e;
    }
  }

  async connect(): Promise<void> {
    if (this.connecting) {
      return;
    }
    let session = hubAuth.getSession();
    if (!session) {
      session = await hubAuth.hydrate();
    }
    if (!session) {
      this.setState(HubConnectionState.UNPAIRED, 'Not paired');
      return;
    }

    this.connecting = true;
    this.setState(
      this.connectionState === HubConnectionState.CONNECTED
        ? HubConnectionState.RECONNECTING
        : HubConnectionState.CONNECTING,
      null,
    );

    try {
      await this.ensureHubFgs();
      await this.teardownClient();
      const client = new AzureHubClient({ session });
      this.client = client;
      AgentRuntime.attach(client);
      void ProactivityRuntime.start(client);
      this.unsubConn = client.onConnectionChange(connected => {
        if (connected) {
          void this.markSynced();
          this.setState(HubConnectionState.CONNECTED, null);
        } else if (hubAuth.isPaired()) {
          this.setState(HubConnectionState.RECONNECTING, null);
        }
      });
      this.unsubCmd = client.onCommand(frame => {
        void this.onCommand(frame);
      });
      await client.connect();
      await this.markSynced();
      this.setState(HubConnectionState.CONNECTED, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setState(HubConnectionState.DISCONNECTED, msg);
      throw e;
    } finally {
      this.connecting = false;
    }
  }

  async retry(): Promise<void> {
    await this.connect();
  }

  async signOut(): Promise<void> {
    await this.teardownClient();
    await this.releaseHubFgs();
    await hubAuth.clear();
    this.lastError = null;
    this.setState(HubConnectionState.UNPAIRED, null);
  }

  getClient(): AzureHubClient | null {
    return this.client;
  }

  getSession(): HubSession | null {
    return hubAuth.getSession();
  }

  /** Apply CONFIG payload (command or REST). Exported for tests. */
  async applyConfig(patch: CompanionConfig): Promise<void> {
    await CompanionSettings.apply(patch);
    await this.markSynced();
  }

  private async onCommand(frame: HubFrame<HubCommandPayload>): Promise<void> {
    const cmd = frame.payload?.command;
    if (cmd === 'CONFIG') {
      const { command: _c, ...rest } = frame.payload;
      await this.applyConfig(rest as CompanionConfig);
      return;
    }
    if (cmd === 'REVOKE') {
      await this.signOut();
    }
  }

  private async handleCompactCommand(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const command = String(payload.command ?? '').toUpperCase();
    if (command === 'CONFIG') {
      const { command: _c, ...rest } = payload;
      await this.applyConfig(rest as CompanionConfig);
      return;
    }
    // Other compact commands: force reconnect so WSS delivers the real frame
    await this.retry().catch(() => undefined);
  }

  private async pullConfigQuiet(): Promise<void> {
    try {
      const cfg = await companionRestClient.getConfig();
      await this.applyConfig(cfg);
    } catch {
      // Expected until LifeOSAPI GET /v1/companion/config exists
    }
  }

  private async ensureHubFgs(): Promise<void> {
    // WSS rides the companion FGS (BD032 / FI030). Dock mode may already own it.
    const ok = await CompanionRuntime.start();
    if (ok) {
      this.hubOwnsFgs = true;
    }
  }

  private async releaseHubFgs(): Promise<void> {
    if (!this.hubOwnsFgs) {
      return;
    }
    this.hubOwnsFgs = false;
    // Keep FGS if user is still in docked companion mode
    if (!CompanionModeService.isDocked()) {
      await CompanionRuntime.stop();
    }
  }

  private async markSynced(): Promise<void> {
    this.lastSyncAt = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNC_KEY, this.lastSyncAt);
    this.emit();
  }

  private async teardownClient(): Promise<void> {
    ProactivityRuntime.stop();
    AgentRuntime.detach();
    this.unsubConn?.();
    this.unsubConn = null;
    this.unsubCmd?.();
    this.unsubCmd = null;
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }
}

export const HubRuntime = new HubRuntimeImpl();
