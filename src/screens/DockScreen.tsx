import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DockLayout,
  HubConnectionState,
  PresenceState,
  WakeState,
  type HubConnectionState as HubConnectionStateType,
  type PresenceState as PresenceStateType,
  type WakeState as WakeStateType,
} from '../constants/appConstants';

export type DockScreenProps = {
  onExit: () => void;
  /** Voice / wake UI state — FI005 drives this from VoiceSession. */
  wakeState?: WakeStateType;
  onTapToTalk?: () => void;
  /** Hub connection — FI030 drives this from HubRuntime. */
  connectionState?: HubConnectionStateType;
  /** Placeholders until Phase 5 wires presence. */
  presenceState?: PresenceStateType;
  now?: Date;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDockClock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDockDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function dockStatusLabel(wakeState: WakeStateType): string {
  switch (wakeState) {
    case WakeState.SLEEPING:
      return 'Sleeping';
    case WakeState.AWAKE:
      return 'Awake';
    case WakeState.CAPTURING:
      return 'Listening…';
    case WakeState.SPEAKING:
      return 'Speaking…';
    case WakeState.LISTENING_FOR_WAKE:
    default:
      return 'Listening for wake';
  }
}

function connectionChipLabel(state: HubConnectionStateType): string {
  switch (state) {
    case HubConnectionState.CONNECTED:
      return 'Hub · connected';
    case HubConnectionState.CONNECTING:
    case HubConnectionState.RECONNECTING:
      return 'Hub · connecting';
    case HubConnectionState.DEGRADED:
      return 'Hub · degraded';
    case HubConnectionState.DISCONNECTED:
      return 'Hub · offline';
    case HubConnectionState.UNPAIRED:
    default:
      return 'Hub · unpaired';
  }
}

function presenceChipLabel(state: PresenceStateType): string {
  switch (state) {
    case PresenceState.HOME:
      return 'Presence · home';
    case PresenceState.AWAY:
      return 'Presence · away';
    case PresenceState.UNKNOWN:
    default:
      return 'Presence · —';
  }
}

function orbStyleFor(wakeState: WakeStateType) {
  switch (wakeState) {
    case WakeState.SPEAKING:
      return [styles.orb, styles.orbSpeaking];
    case WakeState.CAPTURING:
    case WakeState.AWAKE:
      return [styles.orb, styles.orbListening];
    case WakeState.SLEEPING:
      return [styles.orb, styles.orbSleeping];
    default:
      return [styles.orb, styles.orbIdle];
  }
}

/** Compact dock shell for ~360×772 dp companion canvas (FD001). */
export function DockScreen({
  onExit,
  wakeState = WakeState.LISTENING_FOR_WAKE,
  onTapToTalk,
  connectionState = HubConnectionState.UNPAIRED,
  presenceState = PresenceState.UNKNOWN,
  now: nowProp,
}: DockScreenProps): React.JSX.Element {
  const [now, setNow] = useState(() => nowProp ?? new Date());

  useEffect(() => {
    if (nowProp) {
      setNow(nowProp);
      return;
    }
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, [nowProp]);

  return (
    <View style={styles.root} testID="dock-screen">
      <View style={styles.canvas}>
        <View style={styles.chips}>
          <View style={styles.chip} testID="dock-connection-chip">
            <Text style={styles.chipText}>
              {connectionChipLabel(connectionState)}
            </Text>
          </View>
          <View style={styles.chip} testID="dock-presence-chip">
            <Text style={styles.chipText}>
              {presenceChipLabel(presenceState)}
            </Text>
          </View>
        </View>

        <View style={styles.clockBlock}>
          <Text style={styles.clock} testID="dock-clock">
            {formatDockClock(now)}
          </Text>
          <Text style={styles.date} testID="dock-date">
            {formatDockDate(now)}
          </Text>
        </View>

        <View style={styles.orbWrap}>
          <View testID="dock-orb" style={orbStyleFor(wakeState)} />
          <Text style={styles.status} testID="dock-status">
            {dockStatusLabel(wakeState)}
          </Text>
        </View>

        <Pressable
          style={styles.tap}
          onPress={onTapToTalk}
          testID="dock-tap-to-talk"
          accessibilityRole="button"
          accessibilityLabel="Tap to talk"
        >
          <Text style={styles.tapText}>Tap to talk</Text>
        </Pressable>

        <Pressable
          style={styles.exit}
          onPress={onExit}
          testID="dock-exit"
          accessibilityRole="button"
        >
          <Text style={styles.exitText}>Exit to Operator</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: DockLayout.WIDTH_DP,
    maxWidth: '100%',
    minHeight: DockLayout.HEIGHT_DP,
    paddingHorizontal: 20,
    paddingVertical: 28,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chips: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  chip: {
    flexShrink: 1,
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  clockBlock: {
    alignItems: 'center',
    gap: 4,
  },
  clock: {
    color: '#f8fafc',
    fontSize: 64,
    fontWeight: '200',
    letterSpacing: 2,
  },
  date: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '500',
  },
  orbWrap: {
    alignItems: 'center',
    gap: 16,
  },
  orb: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  orbIdle: {
    backgroundColor: '#94a3b8',
    transform: [{ scale: 1 }],
    opacity: 0.55,
  },
  orbListening: {
    backgroundColor: '#4ade80',
    transform: [{ scale: 1.08 }],
    opacity: 0.95,
  },
  orbSpeaking: {
    backgroundColor: '#38bdf8',
    transform: [{ scale: 1.12 }],
    opacity: 1,
  },
  orbSleeping: {
    backgroundColor: '#64748b',
    transform: [{ scale: 0.9 }],
    opacity: 0.35,
  },
  status: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  tap: {
    width: '100%',
    backgroundColor: '#1d4ed8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tapText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  exit: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  exitText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
});
