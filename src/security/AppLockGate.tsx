import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppLimits } from '../constants/appConstants';
import { AppLock } from './AppLock';

type Props = { children: React.ReactNode };

type Mode = 'biometric' | 'password' | 'set_password';

/**
 * Locks the UI when the app returns from background.
 * Biometric unlock first; password fallback when biometrics fail / unavailable.
 */
export function AppLockGate({ children }: Props): React.JSX.Element {
  const [locked, setLocked] = useState(AppLock.isLocked());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('biometric');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(true);

  useEffect(() => AppLock.subscribe(setLocked), []);

  useEffect(() => {
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', next => {
      if ((last === 'background' || last === 'inactive') && next === 'active') {
        AppLock.lock();
        setMode('biometric');
        setPassword('');
        setConfirm('');
        setError(null);
      }
      last = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!locked) {
      return;
    }
    let cancelled = false;
    (async () => {
      const [bio, pwd] = await Promise.all([
        AppLock.getBiometricAvailability(),
        AppLock.hasPassword(),
      ]);
      if (cancelled) {
        return;
      }
      setBioAvailable(bio.available);
      setHasPassword(pwd);
      if (!bio.available) {
        setMode(pwd ? 'password' : 'set_password');
      } else {
        setMode('biometric');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locked]);

  const unlockBiometric = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await AppLock.unlock();
    setBusy(false);
    if (result.ok) {
      return;
    }
    if (result.reason === 'biometric_unavailable') {
      const pwd = await AppLock.hasPassword();
      setHasPassword(pwd);
      setBioAvailable(false);
      setMode(pwd ? 'password' : 'set_password');
      setError('Biometrics unavailable — use your app password.');
      return;
    }
    setError(
      result.reason === 'cancelled'
        ? 'Biometric unlock cancelled.'
        : result.reason,
    );
    const pwd = await AppLock.hasPassword();
    setHasPassword(pwd);
    if (pwd) {
      setMode('password');
    }
  }, []);

  const unlockPassword = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await AppLock.unlockWithPassword(password);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === 'wrong_password'
          ? 'Incorrect password.'
          : result.reason === 'no_password_set'
            ? 'No password set yet.'
            : result.reason,
      );
      return;
    }
    setPassword('');
  }, [password]);

  const savePassword = useCallback(async () => {
    setBusy(true);
    setError(null);
    if (password !== confirm) {
      setBusy(false);
      setError('Passwords do not match.');
      return;
    }
    const result = await AppLock.setPassword(password);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setHasPassword(true);
    const unlocked = await AppLock.unlockWithPassword(password);
    if (!unlocked.ok) {
      setError('Password saved, but unlock failed. Try again.');
      setMode('password');
      return;
    }
    setPassword('');
    setConfirm('');
  }, [password, confirm]);

  if (!locked) {
    return <>{children}</>;
  }

  return (
    <View style={styles.root} testID="app-lock-gate">
      <Text style={styles.title}>PrivateAgent locked</Text>
      {mode === 'biometric' ? (
        <>
          <Text style={styles.sub}>
            Unlock with fingerprint to continue.
          </Text>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={unlockBiometric}
            testID="app-lock-biometric"
          >
            <Text style={styles.btnText}>
              {busy ? 'Waiting…' : 'Unlock with biometrics'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.linkBtn}
            onPress={async () => {
              const pwd = await AppLock.hasPassword();
              setHasPassword(pwd);
              setMode(pwd ? 'password' : 'set_password');
              setError(null);
            }}
            testID="app-lock-use-password"
          >
            <Text style={styles.linkText}>
              {hasPassword ? 'Use password instead' : 'Set a backup password'}
            </Text>
          </Pressable>
        </>
      ) : null}

      {mode === 'password' ? (
        <>
          <Text style={styles.sub}>
            {bioAvailable
              ? 'Enter your app password.'
              : 'Biometrics unavailable — enter your app password.'}
          </Text>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="App password"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            testID="app-lock-password-input"
            onSubmitEditing={unlockPassword}
          />
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy || password.length === 0}
            onPress={unlockPassword}
            testID="app-lock-password-submit"
          >
            <Text style={styles.btnText}>{busy ? 'Checking…' : 'Unlock'}</Text>
          </Pressable>
          {bioAvailable ? (
            <Pressable
              style={styles.linkBtn}
              onPress={() => {
                setMode('biometric');
                setError(null);
                setPassword('');
              }}
            >
              <Text style={styles.linkText}>Back to biometrics</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {mode === 'set_password' ? (
        <>
          <Text style={styles.sub}>
            Set a backup password (min {AppLimits.APP_LOCK_PASSWORD_MIN_LEN}{' '}
            characters). Used when biometrics fail or are unavailable.
          </Text>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="New password"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            testID="app-lock-set-password"
          />
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder="Confirm password"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            testID="app-lock-confirm-password"
          />
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={savePassword}
            testID="app-lock-save-password"
          >
            <Text style={styles.btnText}>
              {busy ? 'Saving…' : 'Save & unlock'}
            </Text>
          </Pressable>
          {bioAvailable ? (
            <Pressable
              style={styles.linkBtn}
              onPress={() => {
                setMode('biometric');
                setError(null);
                setPassword('');
                setConfirm('');
              }}
            >
              <Text style={styles.linkText}>Back to biometrics</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
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
  err: { color: '#f87171', textAlign: 'center' },
  input: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 16,
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600' },
  linkBtn: { paddingVertical: 8 },
  linkText: { color: '#93c5fd', fontWeight: '600' },
});
