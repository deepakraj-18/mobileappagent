import React, { useCallback, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { AppLimits } from '../constants/appConstants';
import { AppLock } from '../security/AppLock';

type Props = {
  companionDocked: boolean;
  onToggleCompanion: () => void;
  onOpenHealth: () => void;
  onOpenHub: () => void;
};

export function SettingsScreen({
  companionDocked,
  onToggleCompanion,
  onOpenHealth,
  onOpenHub,
}: Props): React.JSX.Element {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const savePassword = useCallback(async () => {
    if (password !== confirm) {
      Alert.alert('Passwords do not match');
      return;
    }
    setBusy(true);
    const result = await AppLock.setPassword(password);
    setBusy(false);
    if (!result.ok) {
      Alert.alert('Could not save password', result.reason);
      return;
    }
    setPassword('');
    setConfirm('');
    setShowPasswordForm(false);
    Alert.alert(
      'App password saved',
      'Use it when biometrics fail or are unavailable.',
    );
  }, [password, confirm]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>
        Companion mode toggle opens the Dock route.
      </Text>
      <Text
        style={styles.link}
        onPress={onToggleCompanion}
        accessibilityRole="button"
      >
        {companionDocked ? 'Exit docked companion' : 'Enter docked companion'}
      </Text>
      <Text
        style={styles.link}
        onPress={onOpenHub}
        accessibilityRole="button"
      >
        Hub connection
      </Text>
      <Text
        style={styles.link}
        onPress={onOpenHealth}
        accessibilityRole="button"
      >
        Companion health
      </Text>
      <Text
        style={styles.link}
        onPress={() => setShowPasswordForm(v => !v)}
        accessibilityRole="button"
      >
        {showPasswordForm
          ? 'Cancel password change'
          : 'Set / change app password'}
      </Text>
      {showPasswordForm ? (
        <View style={styles.form}>
          <Text style={styles.hint}>
            Backup unlock when fingerprint fails (min{' '}
            {AppLimits.APP_LOCK_PASSWORD_MIN_LEN} characters). Stored in the
            Android Keystore.
          </Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="New password"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder="Confirm password"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={savePassword}
          >
            <Text style={styles.btnText}>
              {busy ? 'Saving…' : 'Save password'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 12, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b' },
  link: { marginTop: 16, color: '#2563eb', fontSize: 16, fontWeight: '600' },
  form: { marginTop: 8, gap: 10 },
  hint: { color: '#64748b', fontSize: 13 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600' },
});
