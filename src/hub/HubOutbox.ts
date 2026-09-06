import type { OutboxDao } from '../store/daos/OutboxDao';
import type { HubClient } from './HubClient';
import type { HubEventPayload, HubFrame } from './types';
import { makeFrame } from './types';

/**
 * FIFO outbox: enqueue when offline; replay PENDING on reconnect.
 */
export class HubOutbox {
  constructor(
    private readonly dao: OutboxDao,
    private readonly client: HubClient,
  ) {}

  async enqueueEvent(payload: HubEventPayload): Promise<string> {
    const frame = makeFrame('event', payload);
    if (this.client.isConnected()) {
      try {
        await this.client.sendFrame(frame);
        return frame.id;
      } catch {
        // fall through to queue
      }
    }
    return this.dao.enqueue(frame);
  }

  async enqueueFrame(frame: HubFrame): Promise<string> {
    if (this.client.isConnected()) {
      try {
        await this.client.sendFrame(frame);
        return frame.id;
      } catch {
        // queue
      }
    }
    return this.dao.enqueue(frame);
  }

  /** Replay all PENDING rows over the live client; ack or mark failed. */
  async replayPending(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    // Drain FIFO one-by-one
    for (;;) {
      const row = await this.dao.nextPending();
      if (!row) {
        break;
      }
      await this.dao.markInFlight(row.id);
      try {
        const frame = JSON.parse(row.payload) as HubFrame;
        await this.client.sendFrame(frame);
        await this.dao.ack(row.id);
        sent += 1;
      } catch {
        await this.dao.markFailed(row.id);
        failed += 1;
      }
    }
    return { sent, failed };
  }
}
