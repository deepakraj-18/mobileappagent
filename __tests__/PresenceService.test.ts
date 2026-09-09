import { PresenceState } from '../src/constants/appConstants';
import {
  PresenceService,
} from '../src/proactivity/PresenceService';
import {
  sightingMatchesAnchor,
  type BleAnchorScanner,
  type BleSighting,
} from '../src/proactivity/BleAnchorScanner';
import { MockHubClient } from '../src/hub/MockHubClient';
import { makeFrame } from '../src/hub/types';

class FakeScanner implements BleAnchorScanner {
  sightings: BleSighting[] = [];
  async start(): Promise<void> {
    return;
  }
  async stop(): Promise<void> {
    return;
  }
  async poll(): Promise<BleSighting[]> {
    return this.sightings;
  }
}

describe('sightingMatchesAnchor', () => {
  it('matches Amazfit by name and respects minRssi', () => {
    expect(
      sightingMatchesAnchor(
        [{ id: 'aa:bb', name: 'Amazfit Bip', rssi: -70 }],
        { anchorId: 'amazfit', mode: 'AMAZFIT_MAC_OR_NAME', match: 'amazfit' },
      ),
    ).toBe(true);
    expect(
      sightingMatchesAnchor(
        [{ id: 'aa:bb', name: 'Amazfit Bip', rssi: -100 }],
        {
          anchorId: 'amazfit',
          mode: 'AMAZFIT_MAC_OR_NAME',
          match: 'amazfit',
          minRssi: -90,
        },
      ),
    ).toBe(false);
  });

  it('uses bonded flag for Galaxy Watch style anchors', () => {
    expect(
      sightingMatchesAnchor(
        [{ id: 'rand', bonded: true, rssi: -60 }],
        { anchorId: 'galaxy_watch', mode: 'BONDED_DEVICE' },
      ),
    ).toBe(true);
  });
});

describe('PresenceService', () => {
  it('hub PRESENCE is authoritative while fresh', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    let now = 1_000;
    const svc = new PresenceService({
      hub,
      getConfig: () => ({ presence: { staleAfterSec: 300, trustLocalFallback: true } }),
      now: () => now,
      dutyCycleMs: 60_000,
    });
    svc.start({ anchorId: 'none', mode: 'AMAZFIT_MAC_OR_NAME' });
    await hub.pushCommand(
      makeFrame('command', {
        command: 'PRESENCE',
        state: 'HOME',
        confidence: 1,
        source: 'brain',
      }),
    );
    expect(svc.getState()).toBe(PresenceState.HOME);

    await svc.setManual(PresenceState.AWAY, 'manual');
    // Hub still fresh — stays HOME
    expect(svc.getState()).toBe(PresenceState.HOME);

    now += 301_000;
    await svc.setManual(PresenceState.AWAY, 'manual');
    expect(svc.getState()).toBe(PresenceState.AWAY);
    svc.stop();
  });

  it('BLE miss debounce flips to AWAY and emits PRESENCE_LOCAL', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const scanner = new FakeScanner();
    scanner.sightings = [{ id: '1', name: 'Amazfit', rssi: -50 }];
    const sleeps: string[] = [];
    const svc = new PresenceService({
      hub,
      scanner,
      missDebounce: 2,
      dutyCycleMs: 60_000,
      getConfig: () => ({ presence: { staleAfterSec: 10, trustLocalFallback: true } }),
      onAutoSleep: reason => {
        sleeps.push(reason);
      },
    });
    svc.start({
      anchorId: 'amazfit',
      mode: 'AMAZFIT_MAC_OR_NAME',
      match: 'amazfit',
    });

    // Force a duty cycle via private path — call through public by using voice then ble
    await (svc as unknown as { dutyCycle: () => Promise<void> }).dutyCycle();
    expect(svc.getState()).toBe(PresenceState.HOME);

    scanner.sightings = [];
    await (svc as unknown as { dutyCycle: () => Promise<void> }).dutyCycle();
    expect(svc.getState()).toBe(PresenceState.HOME); // 1 miss
    await (svc as unknown as { dutyCycle: () => Promise<void> }).dutyCycle();
    expect(svc.getState()).toBe(PresenceState.AWAY);
    expect(sleeps.length).toBeGreaterThan(0);
    expect(
      hub.sent.some(
        f =>
          f.type === 'event' &&
          (f.payload as { event: string }).event === 'PRESENCE_LOCAL',
      ),
    ).toBe(true);
    svc.stop();
  });

  it('voiceSleep sets AWAY', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const svc = new PresenceService({
      hub,
      getConfig: () => ({ presence: { staleAfterSec: 1, trustLocalFallback: true } }),
    });
    svc.start({ anchorId: 'manual', mode: 'AMAZFIT_MAC_OR_NAME' });
    await svc.voiceSleep();
    expect(svc.getState()).toBe(PresenceState.AWAY);
    svc.stop();
  });
});
