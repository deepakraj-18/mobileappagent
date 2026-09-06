import {
  AppLimits,
  CardKind,
  CompanionMode,
  EventLogLevel,
  HubConnectionState,
  OutboxStatus,
  PresenceSource,
  PresenceState,
  WakeState,
} from '../src/constants/appConstants';

describe('appConstants', () => {
  it('exposes companion modes', () => {
    expect(CompanionMode.OPERATOR).toBe('OPERATOR');
    expect(CompanionMode.DOCKED).toBe('DOCKED');
  });

  it('aligns presence wire values with hub-contract', () => {
    expect(PresenceState.HOME).toBe('HOME');
    expect(PresenceState.AWAY).toBe('AWAY');
    expect(PresenceSource.BLE).toBe('BLE');
    expect(PresenceSource.MANUAL).toBe('MANUAL');
    expect(PresenceSource.VOICE).toBe('VOICE');
  });

  it('exposes wake and hub connection states', () => {
    expect(WakeState.LISTENING_FOR_WAKE).toBe('LISTENING_FOR_WAKE');
    expect(HubConnectionState.CONNECTED).toBe('CONNECTED');
    expect(HubConnectionState.DEGRADED).toBe('DEGRADED');
  });

  it('exposes dock card kinds', () => {
    expect(Object.values(CardKind)).toEqual(
      expect.arrayContaining([
        'REMINDER',
        'TASK',
        'HEALTH',
        'CALENDAR',
        'INFO',
        'ALERT',
      ]),
    );
  });

  it('exposes outbox / event log statuses and caps', () => {
    expect(OutboxStatus.PENDING).toBe('PENDING');
    expect(EventLogLevel.ERROR).toBe('ERROR');
    expect(AppLimits.OUTBOX_CAP).toBeGreaterThan(0);
    expect(AppLimits.PRESENCE_STALE_AFTER_SEC).toBe(300);
  });
});
