import type { HubClient } from '../hub/HubClient';
import type { HubCard, HubCommandPayload, HubFrame } from '../hub/types';
import type { CacheDao } from '../store/daos/CacheDao';

export type DockCardsSnapshot = {
  cards: HubCard[];
  /** ISO timestamp of last successful push/cache load; null if never. */
  lastUpdatedAt: string | null;
  /** When hub is offline, set so UI can show "stale since …". */
  staleSince: string | null;
  offline: boolean;
};

type Listener = (snap: DockCardsSnapshot) => void;

export type DockCardsControllerDeps = {
  hub: HubClient;
  cache?: CacheDao | null;
  cardLimit?: number;
};

/**
 * Display-only dock cards from CARD_PUSH / CARD_CLEAR (hub-contract §6).
 */
export class DockCardsController {
  private readonly hub: HubClient;
  private readonly cache: CacheDao | null;
  private readonly cardLimit: number;
  private cards: HubCard[] = [];
  private lastUpdatedAt: string | null = null;
  private offline = false;
  private staleSince: string | null = null;
  private readonly listeners = new Set<Listener>();
  private unsub: (() => void) | null = null;

  constructor(deps: DockCardsControllerDeps) {
    this.hub = deps.hub;
    this.cache = deps.cache ?? null;
    this.cardLimit = deps.cardLimit ?? 6;
  }

  getSnapshot(): DockCardsSnapshot {
    return {
      cards: [...this.cards],
      lastUpdatedAt: this.lastUpdatedAt,
      staleSince: this.staleSince,
      offline: this.offline,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async hydrateFromCache(): Promise<void> {
    if (!this.cache) {
      return;
    }
    const cached = await this.cache.getCards<HubCard>();
    if (cached.length) {
      this.cards = cached.slice(0, this.cardLimit);
      this.lastUpdatedAt = new Date().toISOString();
      this.emit();
    }
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
    if (offline) {
      this.staleSince = this.staleSince ?? new Date().toISOString();
    } else {
      this.staleSince = null;
    }
    this.emit();
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

  private async onCommand(
    frame: HubFrame<HubCommandPayload>,
  ): Promise<void> {
    const cmd = frame.payload.command;
    if (cmd === 'CARD_PUSH') {
      const incoming = (frame.payload.cards as HubCard[]) ?? [];
      const replace = Boolean(frame.payload.replace);
      if (replace) {
        this.cards = incoming.slice(0, this.cardLimit);
      } else {
        const byId = new Map(this.cards.map(c => [c.id, c]));
        for (const c of incoming) {
          byId.set(c.id, c);
        }
        this.cards = Array.from(byId.values()).slice(0, this.cardLimit);
      }
      this.lastUpdatedAt = new Date().toISOString();
      this.offline = false;
      this.staleSince = null;
      await this.persist();
      this.emit();
      return;
    }
    if (cmd === 'CARD_CLEAR') {
      const ids = frame.payload.ids as string[] | undefined;
      if (!ids || ids.length === 0) {
        this.cards = [];
      } else {
        const drop = new Set(ids);
        this.cards = this.cards.filter(c => !drop.has(c.id));
      }
      this.lastUpdatedAt = new Date().toISOString();
      await this.persist();
      this.emit();
    }
  }

  private async persist(): Promise<void> {
    if (!this.cache) {
      return;
    }
    await this.cache.setCards(this.cards);
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const l of this.listeners) {
      l(snap);
    }
  }
}
