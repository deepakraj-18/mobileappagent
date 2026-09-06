import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppLock } from './AppLock';

type Props = { children: React.ReactNode };

/**
 * Locks the UI when the app returns from background until biometric unlock.
 */
export function AppLockGate({ children }: Props): React.JSX.Element {
  const [locked, setLocked] = useState(AppLock.isLocked());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => AppLock.subscribe(setLocked), []);

  useEffect(() => {
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', next => {
      if ((last === 'background' || last === 'inactive') && next === 'active') {
        AppLock.lock();
      }
      last = next;
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await AppLock.unlock();
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
    }
  }, []);

  if (!locked) {
    return <>{children}</>;
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>PrivateAgent locked</Text>
      <Text style={styles.sub}>
        Unlock with fingerprint (or device credential) to continue.
      </Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Pressable
        style={[styles.btn, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={unlock}
      >
        <Text style={styles.btnText}>{busy ? 'Waiting…' : 'Unlock'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '700' },
  sub: { color: '#94a3b8', textAlign: 'center', marginBottom: 8 },
  err: { color: '#f87171' },
  btn: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600' },
});
