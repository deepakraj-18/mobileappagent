import { assertHubPathAllowed, LifeOsHubPaths } from './allowList';
import { hubAuth, type HubFetch } from './HubAuth';
import { HubConfig } from './HubConfig';
import type {
  CompanionConfig,
  HubApiError,
  HubCard,
  HubDataEnvelope,
  HubErrorEnvelope,
  HubFrame,
} from './types';

export type HubPagination = {
  page: number;
  pageSize: number;
  total: number;
  hasMore?: boolean;
};

export type CardsPage = {
  items: HubCard[];
  pagination: HubPagination;
};

export type EventsBatchRequest = {
  events: HubFrame[];
};

export type EventsBatchResult = {
  accepted: string[];
  duplicates: string[];
};

export class HubRestError extends Error {
  readonly status: number;
  readonly apiError: HubApiError | null;

  constructor(status: number, apiError: HubApiError | null, fallback: string) {
    super(apiError?.message ?? fallback);
    this.name = 'HubRestError';
    this.status = status;
    this.apiError = apiError;
  }
}

export type CompanionRestClientOptions = {
  fetchFn?: HubFetch;
  getToken?: () => Promise<string | null>;
  getBaseUrl?: () => Promise<string>;
};

function joinUrl(base: string, path: string, query?: Record<string, string | number | undefined>): string {
  assertHubPathAllowed(path);
  if (!base) {
    throw new Error(
      'Hub base URL not configured. Set HubConfig base URL to LifeOSAPI origin once /v1/companion/* exists.',
    );
  }
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

/**
 * Typed companion REST surface (hub-contract §10).
 * Allow-list only: cards, config, events — never reveal / general LifeOSAPI.
 *
 * HARD WALL: LifeOSAPI does not yet expose these routes (2026-09-07).
 */
export class CompanionRestClient {
  private readonly fetchFn: HubFetch;
  private readonly getToken: () => Promise<string | null>;
  private readonly getBaseUrl: () => Promise<string>;

  constructor(opts?: CompanionRestClientOptions) {
    this.fetchFn = opts?.fetchFn ?? fetch;
    this.getToken = opts?.getToken ?? (() => hubAuth.getAccessToken());
    this.getBaseUrl = opts?.getBaseUrl ?? (() => HubConfig.getBaseUrl());
  }

  async getCards(opts?: {
    page?: number;
    pageSize?: number;
  }): Promise<CardsPage> {
    const page = opts?.page ?? 1;
    const pageSize = Math.min(opts?.pageSize ?? 20, 100);
    const body = await this.requestJson<
      HubDataEnvelope<{ items?: HubCard[]; cards?: HubCard[] } & Partial<HubPagination>> & {
        pagination?: HubPagination;
      }
    >('GET', LifeOsHubPaths.CARDS, { query: { page, pageSize } });

    const data = body.data;
    const items = data.items ?? data.cards ?? [];
    const pagination: HubPagination = body.pagination ?? {
      page: data.page ?? page,
      pageSize: data.pageSize ?? pageSize,
      total: data.total ?? items.length,
      hasMore: data.hasMore,
    };
    return { items, pagination };
  }

  async getConfig(): Promise<CompanionConfig> {
    const body = await this.requestJson<HubDataEnvelope<CompanionConfig>>(
      'GET',
      LifeOsHubPaths.CONFIG,
    );
    return body.data;
  }

  /**
   * Batch outbox replay: `{ events: [frame, …] }` → accepted / duplicates ids.
   */
  async postEvents(events: HubFrame[]): Promise<EventsBatchResult> {
    const body = await this.requestJson<HubDataEnvelope<EventsBatchResult>>(
      'POST',
      LifeOsHubPaths.EVENTS,
      {
        json: { events } satisfies EventsBatchRequest,
        idempotencyKey: events[0]?.id,
      },
    );
    return {
      accepted: body.data.accepted ?? [],
      duplicates: body.data.duplicates ?? [],
    };
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    path: string,
    opts?: {
      query?: Record<string, string | number | undefined>;
      json?: unknown;
      idempotencyKey?: string;
    },
  ): Promise<T> {
    const base = await this.getBaseUrl();
    const url = joinUrl(base, path, opts?.query);
    const token = await this.getToken();
    if (!token) {
      throw new HubRestError(401, null, 'Not paired — no device token');
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (opts?.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (opts?.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }

    const res = await this.fetchFn(url, {
      method,
      headers,
      body: opts?.json !== undefined ? JSON.stringify(opts.json) : undefined,
    });

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new HubRestError(
        res.status,
        null,
        `Invalid JSON from hub (${res.status}) — is LifeOSAPI companion REST live?`,
      );
    }

    if (!res.ok) {
      const err = parsed as HubErrorEnvelope;
      throw new HubRestError(
        res.status,
        err?.error ?? null,
        `Hub REST ${method} ${path} failed (${res.status})`,
      );
    }

    const envelope = parsed as HubDataEnvelope<unknown>;
    if (envelope == null || typeof envelope !== 'object' || !('data' in envelope)) {
      throw new HubRestError(
        res.status,
        null,
        `Hub REST response missing data envelope for ${path}`,
      );
    }
    return parsed as T;
  }
}

export const companionRestClient = new CompanionRestClient();
