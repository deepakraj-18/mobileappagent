import type { HubClient } from '../hub/HubClient';
import { PresenceState } from '../constants/appConstants';
import { phoneEmbodiment } from '../embodiment/PhoneEmbodiment';
import { LocalStore } from '../store/LocalStore';
import { ScreenPower } from '../native/ScreenPower';
import { AnnouncementQueue } from './AnnouncementQueue';
import { DockCardsController } from './DockCardsController';
import { NotificationForwarder } from './notificationForwarder';
import { PresenceService } from './PresenceService';

/**
 * Wires Phase 5 proactivity services onto a live hub client (FI050).
 */
class ProactivityRuntimeImpl {
  private presence: PresenceService | null = null;
  private announcements: AnnouncementQueue | null = null;
  private cards: DockCardsController | null = null;
  private stops: Array<() => void> = [];
  private started = false;
  private hub: HubClient | null = null;
  private announcementStatus: string | null = null;
  private readonly statusListeners = new Set<(s: string | null) => void>();
  private readonly readyListeners = new Set<() => void>();

  getPresence(): PresenceService | null {
    return this.presence;
  }

  getAnnouncements(): AnnouncementQueue | null {
    return this.announcements;
  }

  getCards(): DockCardsController | null {
    return this.cards;
  }

  getAnnouncementStatus(): string | null {
    return this.announcementStatus;
  }

  /** Fires when services attach/detach so Dock can (re)subscribe. */
  onReady(listener: () => void): () => void {
    this.readyListeners.add(listener);
    if (this.started) {
      listener();
    }
    return () => this.readyListeners.delete(listener);
  }

  onAnnouncementStatus(listener: (s: string | null) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.announcementStatus);
    return () => this.statusListeners.delete(listener);
  }

  async start(hub: HubClient): Promise<void> {
    if (this.hub === hub && this.started) {
      return;
    }
    this.stop();
    this.started = true;
    this.hub = hub;

    let cache = null;
    try {
      const store = await LocalStore.open();
      cache = store.cache;
    } catch {
      cache = null;
    }

    this.cards = new DockCardsController({ hub, cache });
    await this.cards.hydrateFromCache();
    this.stops.push(this.cards.start());
    this.cards.setOffline(!hub.isConnected());

    this.presence = new PresenceService({
      hub,
      onAutoSleep: async () => {
        try {
          await ScreenPower.sleep();
        } catch {
          // optional native
        }
      },
    });
    this.stops.push(this.presence.start());

    this.announcements = new AnnouncementQueue({
      hub,
      embodiment: {
        speak: async (text: string) => {
          this.setAnnouncementStatus('Speaking announcement…');
          try {
            await phoneEmbodiment.speak(text);
          } finally {
            this.setAnnouncementStatus(null);
          }
        },
        express: t => phoneEmbodiment.express(t),
        move: c => phoneEmbodiment.move(c),
        present: m => phoneEmbodiment.present(m),
      },
      getPresence: () => this.presence?.getState() ?? PresenceState.UNKNOWN,
    });
    this.stops.push(this.announcements.start());

    this.stops.push(
      this.presence.subscribe(state => {
        void this.announcements?.onPresenceChanged(state);
      }),
    );

    this.stops.push(NotificationForwarder.start(hub));

    this.stops.push(
      hub.onConnectionChange(connected => {
        this.cards?.setOffline(!connected);
      }),
    );

    this.emitReady();
  }

  stop(): void {
    for (const s of this.stops.splice(0)) {
      try {
        s();
      } catch {
        // ignore
      }
    }
    this.presence?.stop();
    this.presence = null;
    this.announcements = null;
    this.cards = null;
    this.hub = null;
    this.started = false;
    this.setAnnouncementStatus(null);
    this.emitReady();
  }

  isStarted(): boolean {
    return this.started;
  }

  private emitReady(): void {
    for (const l of this.readyListeners) {
      l();
    }
  }

  private setAnnouncementStatus(s: string | null): void {
    this.announcementStatus = s;
    for (const l of this.statusListeners) {
      l(s);
    }
  }
}

export const ProactivityRuntime = new ProactivityRuntimeImpl();
