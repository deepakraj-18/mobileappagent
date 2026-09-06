import type {
  HubClient,
  HubCommandListener,
  HubConnectionListener,
  HubFrameListener,
} from './HubClient';
import { makeFrame, type HubCommandPayload, type HubEventPayload, type HubFrame } from './types';

export type MockHubScenario = {
  /** Frames the mock "brain" pushes after connect (commands / welcome). */
  onConnect?: HubFrame[];
  /** Map event name → reply command frames. */
  replies?: Record<string, HubFrame<HubCommandPayload>[]>;
};

/**
 * In-memory hub for tests and offline UI work.
 */
export class MockHubClient implements HubClient {
  private connected = false;
  private readonly commandListeners = new Set<HubCommandListener>();
  private readonly frameListeners = new Set<HubFrameListener>();
  private readonly connListeners = new Set<HubConnectionListener>();
  private readonly seenIds = new Set<string>();
  readonly sent: HubFrame[] = [];

  constructor(private readonly scenario: MockHubScenario = {}) {}

  async connect(): Promise<void> {
    this.connected = true;
    this.emitConn(true);
    for (const frame of this.scenario.onConnect ?? []) {
      await this.deliver(frame);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emitConn(false);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendEvent(payload: HubEventPayload): Promise<string> {
    const frame = makeFrame('event', payload);
    await this.sendFrame(frame);
    const replies = this.scenario.replies?.[payload.event] ?? [];
    for (const reply of replies) {
      await this.deliver(reply);
    }
    return frame.id;
  }

  async sendFrame(frame: HubFrame): Promise<void> {
    if (!this.connected) {
      throw new Error('MockHubClient: not connected');
    }
    this.sent.push(frame);
    for (const listener of this.frameListeners) {
      await listener(frame);
    }
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

  /** Test helper — push a brain command with idempotent delivery. */
  async pushCommand(frame: HubFrame<HubCommandPayload>): Promise<void> {
    await this.deliver(frame);
  }

  private async deliver(frame: HubFrame): Promise<void> {
    if (this.seenIds.has(frame.id)) {
      // Idempotent: ack-shaped ignore
      return;
    }
    this.seenIds.add(frame.id);
    for (const listener of this.frameListeners) {
      await listener(frame);
    }
    if (frame.type === 'command') {
      for (const listener of this.commandListeners) {
        await listener(frame as HubFrame<HubCommandPayload>);
      }
    }
  }

  private emitConn(v: boolean): void {
    for (const listener of this.connListeners) {
      listener(v);
    }
  }
}
