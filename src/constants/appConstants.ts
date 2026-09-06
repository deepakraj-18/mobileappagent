/**
 * Central companion-runtime constants (Phase 1 SC001).
 * Wire enums use UPPER_SNAKE_CASE per hub-contract.md.
 */

/** Docked companion vs operator (phone) UI mode. */
export const CompanionMode = {
  OPERATOR: 'OPERATOR',
  DOCKED: 'DOCKED',
} as const;
export type CompanionMode = (typeof CompanionMode)[keyof typeof CompanionMode];

/** Presence — matches hub PRESENCE / PRESENCE_LOCAL `state`. */
export const PresenceState = {
  HOME: 'HOME',
  AWAY: 'AWAY',
  UNKNOWN: 'UNKNOWN',
} as const;
export type PresenceState = (typeof PresenceState)[keyof typeof PresenceState];

export const PresenceSource = {
  HUB: 'HUB',
  BLE: 'BLE',
  MANUAL: 'MANUAL',
  VOICE: 'VOICE',
} as const;
export type PresenceSource =
  (typeof PresenceSource)[keyof typeof PresenceSource];

/** Local wake-word / voice session state (Phase 2 will drive transitions). */
export const WakeState = {
  SLEEPING: 'SLEEPING',
  LISTENING_FOR_WAKE: 'LISTENING_FOR_WAKE',
  AWAKE: 'AWAKE',
  CAPTURING: 'CAPTURING',
  SPEAKING: 'SPEAKING',
} as const;
export type WakeState = (typeof WakeState)[keyof typeof WakeState];

/** Hub / brain realtime channel state. */
export const HubConnectionState = {
  UNPAIRED: 'UNPAIRED',
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  DEGRADED: 'DEGRADED',
} as const;
export type HubConnectionState =
  (typeof HubConnectionState)[keyof typeof HubConnectionState];

/** Dock card kinds pushed by the brain (`card_push`) — hub-contract §6.2. */
export const CardKind = {
  REMINDER: 'REMINDER',
  TASK: 'TASK',
  HEALTH: 'HEALTH',
  CALENDAR: 'CALENDAR',
  INFO: 'INFO',
  ALERT: 'ALERT',
} as const;
export type CardKind = (typeof CardKind)[keyof typeof CardKind];

/** Local outbox / event_log status values (DB001). */
export const OutboxStatus = {
  PENDING: 'PENDING',
  IN_FLIGHT: 'IN_FLIGHT',
  ACKED: 'ACKED',
  FAILED: 'FAILED',
  DROPPED: 'DROPPED',
} as const;
export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];

export const EventLogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;
export type EventLogLevel = (typeof EventLogLevel)[keyof typeof EventLogLevel];

/** Soft caps / timings used by LocalStore and companion runtime. */
export const AppLimits = {
  /** Max rows retained in hub_outbox before oldest PENDING/FAILED are dropped. */
  OUTBOX_CAP: 500,
  /** Max event_log rows retained. */
  EVENT_LOG_CAP: 1000,
  /** Default hub presence stale window (seconds) — mirrors contract default. */
  PRESENCE_STALE_AFTER_SEC: 300,
  /** Minimum length for the app-lock backup password (SC006). */
  APP_LOCK_PASSWORD_MIN_LEN: 4,
} as const;

/** Default spoken wake phrase (plan.md). BPE line lives in assets/kws/keywords.txt. */
export const WakeWord = {
  DEFAULT_PHRASE: 'Hey Genie',
  SAMPLE_RATE: 16000,
} as const;

/** Bundled sherpa-onnx KWS model file names under assets/kws/. */
export const KwsModelFiles = {
  ENCODER: 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  DECODER: 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  JOINER: 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  TOKENS: 'tokens.txt',
  KEYWORDS: 'keywords.txt',
  MODEL_TYPE: 'zipformer2',
} as const;

export const WakeEventSource = {
  KEYWORD: 'KEYWORD',
  TAP: 'TAP',
} as const;
export type WakeEventSource =
  (typeof WakeEventSource)[keyof typeof WakeEventSource];

/** How VoiceSession routes a transcript (hub stubbed until Phase 3). */
export const VoiceRoute = {
  HUB: 'HUB',
  LOCAL_FALLBACK: 'LOCAL_FALLBACK',
  COMMAND: 'COMMAND',
} as const;
export type VoiceRoute = (typeof VoiceRoute)[keyof typeof VoiceRoute];

/** Built-in voice power commands (BD004). */
export const VoicePowerCommand = {
  WAKE: 'WAKE',
  SLEEP: 'SLEEP',
} as const;
export type VoicePowerCommand =
  (typeof VoicePowerCommand)[keyof typeof VoicePowerCommand];

/**
 * Target dock canvas (Vivo Y17 logical size from plan.md):
 * 720×1544 px @ 320 dpi ≈ 360×772 dp.
 */
export const DockLayout = {
  WIDTH_DP: 360,
  HEIGHT_DP: 772,
} as const;
