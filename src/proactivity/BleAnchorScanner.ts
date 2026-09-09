/**
 * BLE / bonded-device presence probe.
 * Amazfit: name/MAC match OK today. Galaxy Watch 4 later: use bonded check
 * (MAC randomises) — see plan §9-4. No BLE library required for the interface.
 */
export type BleSighting = {
  /** Stable id — MAC for Amazfit, bonded identity for GW4 later. */
  id: string;
  name?: string;
  rssi?: number;
  bonded?: boolean;
};

export type BleAnchorConfig = {
  /** User-selected anchor id from CompanionPrefs. */
  anchorId: string;
  /** Match strategy. */
  mode: 'AMAZFIT_MAC_OR_NAME' | 'BONDED_DEVICE';
  /** Optional name substring / MAC for Amazfit. */
  match?: string;
  minRssi?: number;
};

export interface BleAnchorScanner {
  start(config: BleAnchorConfig): Promise<void>;
  stop(): Promise<void>;
  /** Latest sightings from the last duty cycle. */
  poll(): Promise<BleSighting[]>;
}

/** No-op scanner until a real BLE module is wired. */
export class NoopBleAnchorScanner implements BleAnchorScanner {
  async start(): Promise<void> {
    return;
  }
  async stop(): Promise<void> {
    return;
  }
  async poll(): Promise<BleSighting[]> {
    return [];
  }
}

export function sightingMatchesAnchor(
  sightings: BleSighting[],
  config: BleAnchorConfig,
): boolean {
  const minRssi = config.minRssi ?? -90;
  if (config.mode === 'BONDED_DEVICE') {
    return sightings.some(s => s.bonded === true && (s.rssi ?? 0) >= minRssi);
  }
  const needle = (config.match ?? config.anchorId).toLowerCase();
  return sightings.some(s => {
    if ((s.rssi ?? 0) < minRssi) {
      return false;
    }
    const id = (s.id || '').toLowerCase();
    const name = (s.name || '').toLowerCase();
    return id.includes(needle) || name.includes(needle);
  });
}
