import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  HubConnectionState,
  type HubConnectionState as HubConnectionStateType,
} from '../constants/appConstants';
import { AzureHubClient } from './AzureHubClient';
import { hubAuth, type HubSession } from './HubAuth';
import { HubConfig } from './HubConfig';
import type { PairDeviceInfo } from './types';

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
 * Hub connection status + pair/retry/sign-out surface (FD030).
 * FI030 wires startup, FGS, FCM, CONFIG apply, and Dock chip subscriptions.
 */
class HubRuntimeImpl {
  private connectionState: HubConnectionStateType = HubConnectionState.UNPAIRED;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private baseUrl = '';
  private client: AzureHubClient | null = null;
  private readonly listeners = new Set<Listener>();
  private unsubConn: (() => void) | null = null;
  private connecting = false;

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
    this.emit();
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Paired tokens may still exist if only WSS failed — re-read auth
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
      await this.teardownClient();
      const client = new AzureHubClient({ session });
      this.client = client;
      this.unsubConn = client.onConnectionChange(connected => {
        if (connected) {
          void this.markSynced();
          this.setState(HubConnectionState.CONNECTED, null);
        } else if (hubAuth.isPaired()) {
          this.setState(HubConnectionState.RECONNECTING, null);
        }
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

  /** Manual retry from the connection screen. */
  async retry(): Promise<void> {
    await this.connect();
  }

  async signOut(): Promise<void> {
    await this.teardownClient();
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

  private async markSynced(): Promise<void> {
    this.lastSyncAt = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNC_KEY, this.lastSyncAt);
    this.emit();
  }

  private async teardownClient(): Promise<void> {
    this.unsubConn?.();
    this.unsubConn = null;
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
