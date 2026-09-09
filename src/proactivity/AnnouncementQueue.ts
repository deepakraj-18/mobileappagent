import { PresenceState, type PresenceState as PresenceStateType } from '../constants/appConstants';
import type { Embodiment } from '../embodiment/Embodiment';
import type { HubClient } from '../hub/HubClient';
import type { CompanionConfig, HubCommandPayload, HubFrame } from '../hub/types';
import { CompanionSettings } from '../hub/CompanionSettings';

export type AnnouncePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type AnnouncementOutcome =
  | 'EXPIRED'
  | 'SUPPRESSED_QUIET_HOURS'
  | 'QUEUED_NOT_PRESENT'
  | 'SPOKEN'
  | 'ACKED_BY_USER'
  | 'SNOOZED';

export type Announcement = {
  announcementId: string;
  text: string;
  priority: AnnouncePriority;
  requiresPresence?: boolean;
  quietHoursOverride?: boolean;
  expiresAt?: string;
  speakSsml?: string;
};

export type AnnouncementQueueDeps = {
  hub: HubClient;
  embodiment: Embodiment;
  getPresence: () => PresenceStateType;
  getConfig?: () => CompanionConfig;
  /** Injected clock for tests. */
  now?: () => Date;
};

const PRIORITY_RANK: Record<AnnouncePriority, number> = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 4,
};

const DEFAULT_QUIET = { start: '22:30', end: '07:00', tz: 'local' };

/**
 * hub-contract §8.3 — gate ANNOUNCE → speak once → report ANNOUNCEMENT_RESULT.
 */
export class AnnouncementQueue {
  private readonly hub: HubClient;
  private readonly embodiment: Embodiment;
  private readonly getPresence: () => PresenceStateType;
  private readonly getConfig: () => CompanionConfig;
  private readonly now: () => Date;
  private readonly spoken = new Set<string>();
  private readonly waitingForPresence: Announcement[] = [];
  private readonly heldQuiet: Announcement[] = [];
  private unsub: (() => void) | null = null;

  constructor(deps: AnnouncementQueueDeps) {
    this.hub = deps.hub;
    this.embodiment = deps.embodiment;
    this.getPresence = deps.getPresence;
    this.getConfig = deps.getConfig ?? (() => CompanionSettings.get());
    this.now = deps.now ?? (() => new Date());
  }

  start(): () => void {
    this.unsub?.();
    this.unsub = this.hub.onCommand(frame => {
      void this.onCommand(frame);
    });
    return () => {
      this.unsub?.();
      this.unsub = null;
    };
  }

  /** Call when presence becomes HOME to flush QUEUED_NOT_PRESENT. */
  async onPresenceChanged(state: PresenceStateType): Promise<void> {
    if (state !== PresenceState.HOME) {
      return;
    }
    const pending = this.waitingForPresence.splice(0);
    for (const ann of pending) {
      await this.enqueue(ann);
    }
  }

  /** Re-evaluate quiet-hours holds (e.g. on a timer tick). */
  async flushQuietHolds(): Promise<void> {
    if (this.isQuietHoursActive()) {
      return;
    }
    const held = this.heldQuiet.splice(0);
    for (const ann of held) {
      await this.enqueue(ann);
    }
  }

  async enqueue(ann: Announcement): Promise<AnnouncementOutcome> {
    if (this.spoken.has(ann.announcementId)) {
      // Fire-once: already spoken/finished — ignore duplicate deliveries
      return 'SPOKEN';
    }

    const now = this.now();
    if (ann.expiresAt && Date.parse(ann.expiresAt) <= now.getTime()) {
      await this.report(ann.announcementId, 'EXPIRED');
      return 'EXPIRED';
    }

    const priority = ann.priority ?? 'NORMAL';
    if (
      !ann.quietHoursOverride &&
      PRIORITY_RANK[priority] < PRIORITY_RANK.URGENT &&
      this.isQuietHoursActive()
    ) {
      this.heldQuiet.push(ann);
      await this.report(ann.announcementId, 'SUPPRESSED_QUIET_HOURS');
      return 'SUPPRESSED_QUIET_HOURS';
    }

    if (ann.requiresPresence && this.getPresence() !== PresenceState.HOME) {
      this.waitingForPresence.push(ann);
      await this.report(ann.announcementId, 'QUEUED_NOT_PRESENT');
      return 'QUEUED_NOT_PRESENT';
    }

    const speakText = ann.speakSsml || ann.text;
    await this.embodiment.speak(speakText);
    this.spoken.add(ann.announcementId);
    await this.report(ann.announcementId, 'SPOKEN');
    return 'SPOKEN';
  }

  async ack(announcementId: string): Promise<void> {
    this.spoken.add(announcementId);
    await this.report(announcementId, 'ACKED_BY_USER');
  }

  async snooze(announcementId: string, snoozeUntil: string): Promise<void> {
    this.spoken.add(announcementId);
    await this.hub.sendEvent({
      event: 'ANNOUNCEMENT_RESULT',
      announcementId,
      outcome: 'SNOOZED',
      snoozeUntil,
    });
  }

  /** Test helper — whether fire-once already recorded. */
  hasSpoken(announcementId: string): boolean {
    return this.spoken.has(announcementId);
  }

  isQuietHoursActive(at: Date = this.now()): boolean {
    const cfg = this.getConfig();
    const qh = cfg.quietHours ?? DEFAULT_QUIET;
    return isWithinQuietHours(at, qh.start, qh.end);
  }

  private async onCommand(
    frame: HubFrame<HubCommandPayload>,
  ): Promise<void> {
    if (frame.payload.command !== 'ANNOUNCE') {
      return;
    }
    const p = frame.payload;
    await this.enqueue({
      announcementId: String(p.announcementId ?? frame.id),
      text: String(p.text ?? ''),
      priority: (String(p.priority ?? 'NORMAL').toUpperCase() as AnnouncePriority),
      requiresPresence: Boolean(p.requiresPresence),
      quietHoursOverride: Boolean(p.quietHoursOverride),
      expiresAt: p.expiresAt ? String(p.expiresAt) : undefined,
      speakSsml: p.speakSsml ? String(p.speakSsml) : undefined,
    });
  }

  private async report(
    announcementId: string,
    outcome: AnnouncementOutcome,
  ): Promise<void> {
    await this.hub.sendEvent({
      event: 'ANNOUNCEMENT_RESULT',
      announcementId,
      outcome,
    });
  }
}

/** Quiet hours spanning midnight (e.g. 22:30–07:00). */
export function isWithinQuietHours(
  at: Date,
  start: string,
  end: string,
): boolean {
  const mins = at.getHours() * 60 + at.getMinutes();
  const startM = parseHm(start);
  const endM = parseHm(end);
  if (startM === endM) {
    return false;
  }
  if (startM < endM) {
    return mins >= startM && mins < endM;
  }
  // Overnight window
  return mins >= startM || mins < endM;
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
