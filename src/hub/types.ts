import { CardKind } from '../constants/appConstants';

/** hub-contract.md §4.1 frame envelope */
export type HubFrameType =
  | 'hello'
  | 'welcome'
  | 'ping'
  | 'pong'
  | 'ack'
  | 'event'
  | 'command'
  | 'error';

export type HubFrame<TPayload = Record<string, unknown>> = {
  v: 1;
  id: string;
  type: HubFrameType;
  ts: string;
  ack?: string;
  payload: TPayload;
};

export type HubApiError = {
  code: string;
  message: string;
  details: Array<{ field?: string; message: string }>;
};

export type HubErrorEnvelope = { error: HubApiError };

export type HubDataEnvelope<T> = { data: T };

export type CompanionEventName =
  | 'HEARTBEAT'
  | 'VOICE_INPUT'
  | 'WAKE_TRIGGERED'
  | 'AGENT_SCREEN'
  | 'AGENT_STEP_RESULT'
  | 'GOAL_FINISHED'
  | 'GOAL_REJECTED'
  | 'PRESENCE_LOCAL'
  | 'ANNOUNCEMENT_RESULT'
  | 'NOTIFICATION_SEEN'
  | 'NOTIFICATION_FORWARDED'
  | 'SCREEN_POWER_CHANGED'
  | 'COMPANION_ERROR'
  | 'CONFIG_APPLIED'
  | 'CARD_ACTION';

export type CompanionCommandName =
  | 'SPEAK'
  | 'RUN_GOAL'
  | 'AGENT_ACTION'
  | 'CANCEL_GOAL'
  | 'ANNOUNCE'
  | 'CARD_PUSH'
  | 'CARD_CLEAR'
  | 'PRESENCE'
  | 'WAKE'
  | 'SLEEP'
  | 'CONFIG'
  | 'REQUEST_SCREENSHOT'
  | 'PING_DIAG'
  | 'REVOKE';

export type HubEventPayload = {
  event: CompanionEventName;
  [key: string]: unknown;
};

export type HubCommandPayload = {
  command: CompanionCommandName;
  [key: string]: unknown;
};

export type HubCard = {
  id: string;
  kind: (typeof CardKind)[keyof typeof CardKind] | string;
  title: string;
  subtitle?: string;
  body?: string;
  accent?: string;
  icon?: string;
  at?: string;
  expiresAt?: string;
  actions?: Array<{ id: string; label: string }>;
};

export type CompanionConfig = {
  wakePhrase?: string;
  wakeWordEnabled?: boolean;
  quietHours?: { start: string; end: string; tz: string };
  presence?: { staleAfterSec: number; trustLocalFallback: boolean };
  screenPower?: {
    autoSleepOnAwaySec: number;
    stayAwakeWhileCharging: boolean;
  };
  agent?: {
    maxSteps: number;
    stepDelayMs: number;
    sendScreenshots: string;
  };
  heartbeatSec?: number;
  localFallback?: { enabled: boolean };
  dock?: { theme: string; showClock: boolean; cardLimit: number };
  notificationForwarding?: { enabled: boolean; packages: string[] };
  [key: string]: unknown;
};

export type PairDeviceInfo = {
  platform: 'ANDROID';
  model: string;
  osVersion: string;
  appVersion: string;
  fcmToken?: string;
};

export type PairResponse = {
  deviceId: string;
  deviceToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  wsUrl: string;
  config?: CompanionConfig;
};

export type TokenRefreshResponse = {
  deviceToken: string;
  refreshToken?: string;
  tokenExpiresAt: string;
};

export function newMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeFrame<T extends Record<string, unknown>>(
  type: HubFrameType,
  payload: T,
  ack?: string,
): HubFrame<T> {
  return {
    v: 1,
    id: newMessageId(),
    type,
    ts: new Date().toISOString(),
    ...(ack ? { ack } : {}),
    payload,
  };
}
