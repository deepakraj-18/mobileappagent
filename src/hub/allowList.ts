/**
 * Curated LifeOSAPI hub allow-list (hub-contract.md + Brain=LifeOSAPI decision).
 * Companion MUST NOT call any other LifeOSAPI route — especially never /reveal.
 *
 * HARD WALL (2026-09-07): none of these exist on LifeOSAPI yet. Someone else adds them
 * to LifeOSAPI + this allow-list; the companion does not reach around them.
 */
export const LifeOsHubPaths = {
  PAIR: '/v1/companion/pair',
  TOKEN_REFRESH: '/v1/companion/token/refresh',
  CARDS: '/v1/companion/cards',
  CONFIG: '/v1/companion/config',
  EVENTS: '/v1/companion/events',
  /** Raw WSS path — dedicated companion stream, not the Passwords SignalR hub. */
  STREAM: '/v1/companion/stream',
} as const;

export type LifeOsHubPath =
  (typeof LifeOsHubPaths)[keyof typeof LifeOsHubPaths];

/** Absolute allow-list used by REST/WSS clients before any network call. */
export const LIFEOS_HUB_ALLOW_LIST: ReadonlySet<string> = new Set(
  Object.values(LifeOsHubPaths),
);

export function assertHubPathAllowed(path: string): void {
  // Strip query string for allow-list check
  const bare = path.split('?')[0] ?? path;
  if (!LIFEOS_HUB_ALLOW_LIST.has(bare)) {
    throw new Error(
      `Hub path not on LifeOSAPI allow-list: ${bare}. Reveal and general API routes are forbidden.`,
    );
  }
}

/** Paths that must never be added to the allow-list (defence-in-depth). */
export const LIFEOS_HUB_DENY_SUBSTRINGS = [
  '/reveal',
  '/Password',
  '/password',
  '/Finance',
  '/finance',
] as const;
