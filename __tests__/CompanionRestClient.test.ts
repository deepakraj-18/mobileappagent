import { CompanionRestClient, HubRestError } from '../src/hub/CompanionRestClient';
import { assertHubPathAllowed, LifeOsHubPaths } from '../src/hub/allowList';
import { makeFrame } from '../src/hub/types';

describe('CompanionRestClient', () => {
  const base = 'https://lifeos.example';
  const token = 'dev-token';

  function client(fetchFn: jest.Mock) {
    return new CompanionRestClient({
      fetchFn,
      getToken: async () => token,
      getBaseUrl: async () => base,
    });
  }

  it('GET cards hits allow-listed path with bearer + pagination query', async () => {
    const fetchFn = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${base}${LifeOsHubPaths.CARDS}?page=2&pageSize=10`);
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${token}`,
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            items: [{ id: 'c1', kind: 'TASK', title: 'Buy milk' }],
          },
          pagination: { page: 2, pageSize: 10, total: 1, hasMore: false },
        }),
      } as Response;
    });

    const page = await client(fetchFn).getCards({ page: 2, pageSize: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.pagination.page).toBe(2);
  });

  it('GET config returns data envelope', async () => {
    const fetchFn = jest.fn(async (url: string) => {
      expect(url).toBe(`${base}${LifeOsHubPaths.CONFIG}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { wakePhrase: 'hey tess', heartbeatSec: 30 },
        }),
      } as Response;
    });

    const cfg = await client(fetchFn).getConfig();
    expect(cfg.wakePhrase).toBe('hey tess');
  });

  it('POST events batch with Idempotency-Key', async () => {
    const frame = makeFrame('event', { event: 'HEARTBEAT' });
    const fetchFn = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${base}${LifeOsHubPaths.EVENTS}`);
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBe(frame.id);
      const body = JSON.parse(String(init?.body)) as { events: unknown[] };
      expect(body.events).toHaveLength(1);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { accepted: [frame.id], duplicates: [] },
        }),
      } as Response;
    });

    const result = await client(fetchFn).postEvents([frame]);
    expect(result.accepted).toEqual([frame.id]);
  });

  it('throws HubRestError with error-handling shape', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          code: 'not_found',
          message: 'Companion hub not deployed',
          details: [],
        },
      }),
    })) as jest.Mock;

    await expect(client(fetchFn).getConfig()).rejects.toMatchObject({
      name: 'HubRestError',
      status: 404,
      message: 'Companion hub not deployed',
    } satisfies Partial<HubRestError>);
  });

  it('allow-list rejects reveal and general API paths', () => {
    expect(() => assertHubPathAllowed('/api/Password/reveal')).toThrow(
      /allow-list/,
    );
    expect(() => assertHubPathAllowed('/v1/companion/cards')).not.toThrow();
  });

  it('fails closed when unpaired', async () => {
    const fetchFn = jest.fn();
    const rest = new CompanionRestClient({
      fetchFn,
      getToken: async () => null,
      getBaseUrl: async () => base,
    });
    await expect(rest.getConfig()).rejects.toMatchObject({ status: 401 });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
