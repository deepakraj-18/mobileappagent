import type { HubCommandPayload, HubEventPayload, HubFrame } from './types';

export type HubConnectionListener = (connected: boolean) => void;
export type HubCommandListener = (
  frame: HubFrame<HubCommandPayload>,
) => void | Promise<void>;
export type HubFrameListener = (frame: HubFrame) => void | Promise<void>;

/**
 * Thin realtime hub surface (hub-contract.md).
 * Auth tokens live in HubAuth; REST queries live in CompanionRestClient.
 */
export interface HubClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  /** Send a companion→brain event frame (queued to outbox if offline). */
  sendEvent(payload: HubEventPayload): Promise<string>;
  /** Send a raw frame (hello/ping/ack/…). */
  sendFrame(frame: HubFrame): Promise<void>;
  onCommand(listener: HubCommandListener): () => void;
  onFrame(listener: HubFrameListener): () => void;
  onConnectionChange(listener: HubConnectionListener): () => void;
}
