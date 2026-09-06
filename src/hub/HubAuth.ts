import * as Keychain from 'react-native-keychain';
import { assertHubPathAllowed, LifeOsHubPaths } from './allowList';
import { HubConfig } from './HubConfig';
import type {
  HubDataEnvelope,
  HubErrorEnvelope,
  PairDeviceInfo,
  PairResponse,
  TokenRefreshResponse,
} from './types';

const TOKEN_SERVICE = 'com.privateagent.hub-auth';
const TOKEN_USER = 'hub-device';

export type HubSession = {
  deviceId: string;
  deviceToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  wsUrl: string;
};

export type HubAuthTokenStore = {
  save(session: HubSession): Promise<void>;
  load(): Promise<HubSession | null>;
  clear(): Promise<void>;
};

export type HubFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const defaultTokenStore: HubAuthTokenStore = {
  async save(session) {
    await Keychain.setGenericPassword(TOKEN_USER, JSON.stringify(session), {
      service: TOKEN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async load() {
    try {
      const creds = await Keychain.getGenericPassword({
        service: TOKEN_SERVICE,
      });
      if (!creds || !creds.password) {
        return null;
      }
      return JSON.parse(creds.password) as HubSession;
    } catch {
      return null;
    }
  },
  async clear() {
    await Keychain.resetGenericPassword({ service: TOKEN_SERVICE });
  },
};

function joinUrl(base: string, path: string): string {
  assertHubPathAllowed(path);
  if (!base) {
    throw new Error(
      'Hub base URL not configured. Set HubConfig base URL to LifeOSAPI origin once /v1/companion/* exists.',
    );
  }
  return `${base}${path}`;
}

async function parseJson(res: Response): Promise<unknown> {
  return res.json() as Promise<unknown>;
}

/**
 * Device pairing + token lifecycle (hub-contract §3).
 * Only calls allow-listed `/v1/companion/pair` and `/v1/companion/token/refresh`.
 */
export class HubAuth {
  private session: HubSession | null = null;
  private readonly store: HubAuthTokenStore;
  private readonly fetchFn: HubFetch;

  constructor(opts?: { store?: HubAuthTokenStore; fetchFn?: HubFetch }) {
    this.store = opts?.store ?? defaultTokenStore;
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  async hydrate(): Promise<HubSession | null> {
    this.session = await this.store.load();
    return this.session;
  }

  isPaired(): boolean {
    return this.session != null && Boolean(this.session.deviceToken);
  }

  getSession(): HubSession | null {
    return this.session;
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.session) {
      await this.hydrate();
    }
    return this.session?.deviceToken ?? null;
  }

  async pair(
    pairingCode: string,
    device: PairDeviceInfo,
  ): Promise<HubSession> {
    const base = await HubConfig.getBaseUrl();
    const url = joinUrl(base, LifeOsHubPaths.PAIR);
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pairingCode, device }),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      const err = body as HubErrorEnvelope;
      throw new Error(
        err?.error?.message ?? `Pair failed (${res.status}) — is LifeOSAPI hub live?`,
      );
    }
    const data = (body as HubDataEnvelope<PairResponse>).data;
    if (!data?.deviceToken || !data?.refreshToken || !data?.deviceId) {
      throw new Error('Pair response missing device tokens');
    }
    const session: HubSession = {
      deviceId: data.deviceId,
      deviceToken: data.deviceToken,
      refreshToken: data.refreshToken,
      tokenExpiresAt: data.tokenExpiresAt,
      wsUrl: data.wsUrl,
    };
    await this.store.save(session);
    this.session = session;
    return session;
  }

  async refresh(): Promise<HubSession> {
    if (!this.session?.refreshToken) {
      await this.hydrate();
    }
    if (!this.session?.refreshToken) {
      throw new Error('Not paired');
    }
    const base = await HubConfig.getBaseUrl();
    const url = joinUrl(base, LifeOsHubPaths.TOKEN_REFRESH);
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: this.session.refreshToken }),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      const err = body as HubErrorEnvelope;
      throw new Error(err?.error?.message ?? `Refresh failed (${res.status})`);
    }
    const data = (body as HubDataEnvelope<TokenRefreshResponse>).data;
    const next: HubSession = {
      ...this.session,
      deviceToken: data.deviceToken,
      refreshToken: data.refreshToken ?? this.session.refreshToken,
      tokenExpiresAt: data.tokenExpiresAt,
    };
    await this.store.save(next);
    this.session = next;
    return next;
  }

  /** Wipe tokens — re-pair required (REVOKE / 403 / clear-data). */
  async clear(): Promise<void> {
    await this.store.clear();
    this.session = null;
  }

  /** Refresh if expiry is within 24h. */
  async ensureFreshToken(): Promise<string | null> {
    if (!this.session) {
      await this.hydrate();
    }
    if (!this.session) {
      return null;
    }
    const expires = Date.parse(this.session.tokenExpiresAt);
    const dayMs = 24 * 60 * 60 * 1000;
    if (!Number.isFinite(expires) || expires - Date.now() < dayMs) {
      try {
        await this.refresh();
      } catch {
        return this.session.deviceToken;
      }
    }
    return this.session.deviceToken;
  }
}

export const hubAuth = new HubAuth();
