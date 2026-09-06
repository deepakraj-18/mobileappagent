import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  HubConnectionState,
  type HubConnectionState as HubConnectionStateType,
} from '../constants/appConstants';
import { HubRuntime, type HubRuntimeSnapshot } from '../hub/HubRuntime';

type Props = { onBack: () => void };

function statusLabel(state: HubConnectionStateType): string {
  switch (state) {
    case HubConnectionState.CONNECTED:
      return 'Connected';
    case HubConnectionState.CONNECTING:
      return 'Connecting…';
    case HubConnectionState.RECONNECTING:
      return 'Reconnecting…';
    case HubConnectionState.DEGRADED:
      return 'Degraded';
    case HubConnectionState.DISCONNECTED:
      return 'Disconnected';
    case HubConnectionState.UNPAIRED:
    default:
      return 'Unpaired';
  }
}

function formatSync(iso: string | null): string {
  if (!iso) {
    return 'Never';
  }
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Pair / status / retry / sign-out for the LifeOSAPI companion hub (FD030). */
export function HubConnectionScreen({ onBack }: Props): React.JSX.Element {
  const [snap, setSnap] = useState<HubRuntimeSnapshot>(HubRuntime.getSnapshot());
  const [baseUrl, setBaseUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void HubRuntime.hydrate().then(s => {
      setSnap(s);
      setBaseUrl(s.baseUrl);
    });
    return HubRuntime.subscribe(setSnap);
  }, []);

  const saveBaseUrl = useCallback(async () => {
    setBusy(true);
    try {
      await HubRuntime.setBaseUrl(baseUrl.trim());
    } finally {
      setBusy(false);
    }
  }, [baseUrl]);

  const onPair = useCallback(async () => {
    setBusy(true);
    try {
      if (baseUrl.trim() && baseUrl.trim() !== snap.baseUrl) {
        await HubRuntime.setBaseUrl(baseUrl.trim());
      }
      await HubRuntime.pair(code);
      setCode('');
      Alert.alert('Paired', 'Device token stored in Keystore.');
    } catch (e) {
      Alert.alert(
        'Pairing / connect failed',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }, [baseUrl, code, snap.baseUrl]);

  const onRetry = useCallback(async () => {
    setBusy(true);
    try {
      await HubRuntime.retry();
    } catch (e) {
      Alert.alert(
        'Reconnect failed',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const onSignOut = useCallback(() => {
    Alert.alert(
      'Sign out / re-pair',
      'Clear device tokens from Keystore? You will need a new pairing code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await HubRuntime.signOut();
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, []);

  const unpaired = snap.connectionState === HubConnectionState.UNPAIRED;
  const connecting =
    snap.connectionState === HubConnectionState.CONNECTING ||
    snap.connectionState === HubConnectionState.RECONNECTING;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="hub-connection-screen"
    >
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.back}>← Settings</Text>
      </Pressable>
      <Text style={styles.title}>Hub connection</Text>
      <Text style={styles.sub}>
        Pair with LifeOSAPI companion hub (allow-listed `/v1/companion/*` only).
        Hub layer may not be deployed yet — errors are expected until then.
      </Text>

      <View style={styles.card} testID="hub-status-card">
        <Text style={styles.cardLabel}>Status</Text>
        <Text style={styles.cardValue}>{statusLabel(snap.connectionState)}</Text>
        <Text style={styles.cardLabel}>Device</Text>
        <Text style={styles.cardValue}>{snap.deviceId ?? '—'}</Text>
        <Text style={styles.cardLabel}>Last sync</Text>
        <Text style={styles.cardValue}>{formatSync(snap.lastSyncAt)}</Text>
        {snap.lastError ? (
          <Text style={styles.err} testID="hub-last-error">
            {snap.lastError}
          </Text>
        ) : null}
        {connecting ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      </View>

      <Text style={styles.section}>LifeOSAPI origin</Text>
      <TextInput
        style={styles.input}
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://lifeos-api.example"
        placeholderTextColor="#94a3b8"
        testID="hub-base-url"
      />
      <Pressable
        style={[styles.btn, styles.secondary, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={saveBaseUrl}
      >
        <Text style={styles.btnText}>Save base URL</Text>
      </Pressable>

      {unpaired ? (
        <>
          <Text style={styles.section}>Pairing code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="7F3K-9Q2D"
            placeholderTextColor="#94a3b8"
            testID="hub-pairing-code"
          />
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={onPair}
            testID="hub-pair-btn"
          >
            <Text style={styles.btnText}>{busy ? 'Working…' : 'Pair device'}</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.row}>
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={onRetry}
            testID="hub-retry-btn"
          >
            <Text style={styles.btnText}>Retry connect</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.danger, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={onSignOut}
            testID="hub-signout-btn"
          >
            <Text style={styles.btnText}>Sign out</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 24, gap: 10, paddingBottom: 48 },
  back: { color: '#2563eb', fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b', marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 4,
  },
  cardLabel: { color: '#94a3b8', fontSize: 12, marginTop: 6 },
  cardValue: { color: '#0f172a', fontSize: 16, fontWeight: '600' },
  err: { color: '#b91c1c', marginTop: 8, fontSize: 13 },
  section: {
    marginTop: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  secondary: { backgroundColor: '#475569' },
  danger: { backgroundColor: '#b91c1c' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600' },
});
