import { assertHubPathAllowed, LifeOsHubPaths } from './allowList';
import type {
  HubClient,
  HubCommandListener,
  HubConnectionListener,
  HubFrameListener,
} from './HubClient';
import type { HubSession } from './HubAuth';
import {
  makeFrame,
  type HubCommandPayload,
  type HubEventPayload,
  type HubFrame,
} from './types';

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev?: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
};

export type WebSocketCtor = new (
  url: string,
  protocols?: string | string[],
) => WebSocketLike;

export type AzureHubClientOptions = {
  session: HubSession;
  /** Injected for tests; defaults to global WebSocket. */
  WebSocketImpl?: WebSocketCtor;
  heartbeatMs?: number;
  maxBackoffMs?: number;
  /** Disable auto-reconnect (tests). */
  autoReconnect?: boolean;
};

const WS_OPEN = 1;

/**
 * Dedicated raw WebSocket hub client (hub-contract §2/§4).
 *
 * **Decision: raw WSS, not SignalR.** LifeOSAPI's existing SignalR hub is the Passwords
 * event stream and carries a known plaintext-leak bug (parent BD001). Companion auth is
 * device-token/pairing, not user JWT — a dedicated `/v1/companion/stream` keeps the
 * security boundary and framing (hub-contract envelope) clean. When LifeOSAPI adds that
 * path, point `session.wsUrl` at it.
 */
export class AzureHubClient implements HubClient {
  private socket: WebSocketLike | null = null;
  private connected = false;
  private intentionalClose = false;
  private backoffMs = 1000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly seenIds = new Set<string>();
  private readonly commandListeners = new Set<HubCommandListener>();
  private readonly frameListeners = new Set<HubFrameListener>();
  private readonly connListeners = new Set<HubConnectionListener>();
  private readonly WebSocketImpl: WebSocketCtor;
  private readonly heartbeatMs: number;
  private readonly maxBackoffMs: number;
  private readonly autoReconnect: boolean;
  private session: HubSession;

  constructor(opts: AzureHubClientOptions) {
    this.session = opts.session;
    this.WebSocketImpl =
      opts.WebSocketImpl ??
      (globalThis.WebSocket as unknown as WebSocketCtor);
    this.heartbeatMs = opts.heartbeatMs ?? 30_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 30_000;
    this.autoReconnect = opts.autoReconnect !== false;
  }

  updateSession(session: HubSession): void {
    this.session = session;
  }

  async connect(): Promise<void> {
    this.intentionalClose = false;
    await this.openSocket();
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.clearTimers();
    this.socket?.close(1000, 'client disconnect');
    this.socket = null;
    this.setConnected(false);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendEvent(payload: HubEventPayload): Promise<string> {
    const frame = makeFrame('event', payload);
    await this.sendFrame(frame);
    return frame.id;
  }

  async sendFrame(frame: HubFrame): Promise<void> {
    if (!this.socket || this.socket.readyState !== WS_OPEN) {
      throw new Error('AzureHubClient: socket not open');
    }
    this.socket.send(JSON.stringify(frame));
  }

  onCommand(listener: HubCommandListener): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  onFrame(listener: HubFrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onConnectionChange(listener: HubConnectionListener): () => void {
    this.connListeners.add(listener);
    listener(this.connected);
    return () => this.connListeners.delete(listener);
  }

  private async openSocket(): Promise<void> {
    const url = this.resolveWsUrl();
    const socket = new this.WebSocketImpl(url);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => {
        void this.onOpen().then(resolve).catch(reject);
      };
      socket.onerror = () => {
        reject(new Error('AzureHubClient: WebSocket error'));
      };
      socket.onclose = ev => {
        this.onClose(ev?.code, ev?.reason);
      };
      socket.onmessage = ev => {
        void this.onMessage(String(ev.data));
      };
    });
  }

  private resolveWsUrl(): string {
    const url = this.session.wsUrl;
    if (!url) {
      throw new Error('AzureHubClient: missing wsUrl on session');
    }
    // Validate path against allow-list (raw WSS must be /v1/companion/stream).
    const pathMatch = url.match(/^wss?:\/\/[^/]+(\/[^?]*)/i);
    const path = pathMatch?.[1] ?? (url.startsWith('/') ? url.split('?')[0] : null);
    if (path) {
      assertHubPathAllowed(path);
    } else if (!url.includes(LifeOsHubPaths.STREAM)) {
      throw new Error(
        `AzureHubClient: wsUrl must target ${LifeOsHubPaths.STREAM}`,
      );
    }
    return url;
  }

  private async onOpen(): Promise<void> {
    this.backoffMs = 1000;
    this.setConnected(true);
    const hello = makeFrame('hello', {
      deviceId: this.session.deviceId,
      deviceToken: this.session.deviceToken,
      appVersion: '0.0.1',
    });
    await this.sendFrame(hello);
    this.startHeartbeat();
  }

  private onClose(_code?: number, _reason?: string): void {
    this.clearHeartbeat();
    this.setConnected(false);
    this.socket = null;
    if (!this.intentionalClose && this.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  private async onMessage(raw: string): Promise<void> {
    let frame: HubFrame;
    try {
      frame = JSON.parse(raw) as HubFrame;
    } catch {
      return;
    }
    if (!frame?.id || !frame?.type) {
      return;
    }
    if (this.seenIds.has(frame.id)) {
      // Idempotent: still ack commands so brain stops retrying
      if (frame.type === 'command') {
        await this.safeSend(
          makeFrame('ack', { ok: true }, frame.id),
        );
      }
      return;
    }
    this.seenIds.add(frame.id);
    // Bound memory: keep last ~500 ids
    if (this.seenIds.size > 500) {
      const first = this.seenIds.values().next().value;
      if (first) {
        this.seenIds.delete(first);
      }
    }

    for (const listener of this.frameListeners) {
      await listener(frame);
    }

    if (frame.type === 'ping') {
      await this.safeSend(makeFrame('pong', {}, frame.id));
      return;
    }
    if (frame.type === 'command') {
      for (const listener of this.commandListeners) {
        await listener(frame as HubFrame<HubCommandPayload>);
      }
      await this.safeSend(makeFrame('ack', { ok: true }, frame.id));
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.safeSend(makeFrame('ping', {}));
    }, this.heartbeatMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async safeSend(frame: HubFrame): Promise<void> {
    try {
      await this.sendFrame(frame);
    } catch {
      // drop during teardown
    }
  }

  private setConnected(v: boolean): void {
    if (this.connected === v) {
      return;
    }
    this.connected = v;
    for (const listener of this.connListeners) {
      listener(v);
    }
  }
}
