import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CompanionSettings } from '../hub/CompanionSettings';
import { Accessibility } from '../native/Accessibility';

type Props = { onBack: () => void };

const PRESENCE_ANCHORS = [
  { id: 'amazfit', label: 'Amazfit (BLE)' },
  { id: 'manual', label: 'Manual only' },
  { id: 'none', label: 'None yet' },
] as const;

/** FD041 — companion prefs: wake phrase, screen power, presence, Vivo helpers. */
export function CompanionPrefsScreen({ onBack }: Props): React.JSX.Element {
  const [wakePhrase, setWakePhrase] = useState('Hey Genie');
  const [stayAwakeWhileCharging, setStayAwakeWhileCharging] = useState(false);
  const [presenceAnchor, setPresenceAnchor] = useState('amazfit');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void CompanionSettings.hydrate().then(cfg => {
      if (cfg.wakePhrase) {
        setWakePhrase(cfg.wakePhrase);
      }
      if (cfg.screenPower?.stayAwakeWhileCharging != null) {
        setStayAwakeWhileCharging(cfg.screenPower.stayAwakeWhileCharging);
      }
      const anchor = (cfg as { presenceAnchorId?: string }).presenceAnchorId;
      if (anchor) {
        setPresenceAnchor(anchor);
      }
    });
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await CompanionSettings.apply({
        wakePhrase: wakePhrase.trim() || 'Hey Genie',
        screenPower: {
          autoSleepOnAwaySec: 120,
          stayAwakeWhileCharging,
        },
        presenceAnchorId: presenceAnchor,
      });
      Alert.alert('Saved', 'Companion settings updated.');
    } finally {
      setBusy(false);
    }
  }, [wakePhrase, stayAwakeWhileCharging, presenceAnchor]);

  const openAppInfo = useCallback(() => {
    void Accessibility.openAppInfoSettings().catch((e: unknown) => {
      Alert.alert(
        'Could not open app info',
        e instanceof Error ? e.message : String(e),
      );
    });
  }, []);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="companion-prefs-screen"
    >
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.back}>← Settings</Text>
      </Pressable>
      <Text style={styles.title}>Companion settings</Text>

      <Text style={styles.label}>Wake phrase</Text>
      <TextInput
        style={styles.input}
        value={wakePhrase}
        onChangeText={setWakePhrase}
        placeholder="Hey Genie"
        placeholderTextColor="#94a3b8"
        testID="prefs-wake-phrase"
      />

      <View style={styles.row}>
        <Text style={styles.label}>Stay awake while charging</Text>
        <Switch
          value={stayAwakeWhileCharging}
          onValueChange={setStayAwakeWhileCharging}
          testID="prefs-stay-awake"
        />
      </View>

      <Text style={styles.section}>Presence anchor</Text>
      <Text style={styles.hint}>
        BLE scan for a user-selected device (Phase 5 wires the scanner). Pick
        which anchor to use.
      </Text>
      {PRESENCE_ANCHORS.map(a => (
        <Pressable
          key={a.id}
          style={[
            styles.chip,
            presenceAnchor === a.id && styles.chipOn,
          ]}
          onPress={() => setPresenceAnchor(a.id)}
          testID={`prefs-anchor-${a.id}`}
        >
          <Text
            style={[
              styles.chipText,
              presenceAnchor === a.id && styles.chipTextOn,
            ]}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}

      <Text style={styles.section}>Vivo / OEM whitelist helpers</Text>
      <Text style={styles.hint}>
        Open system app-info so you can allow auto-start, disable battery
        restrictions, and whitelist background activity.
      </Text>
      <Pressable
        style={[styles.btn, styles.secondary]}
        onPress={openAppInfo}
        testID="prefs-vivo-appinfo"
      >
        <Text style={styles.btnText}>Open app info / battery settings</Text>
      </Pressable>
      <Pressable
        style={[styles.btn, styles.secondary]}
        onPress={() =>
          Alert.alert(
            'Vivo checklist',
            '1) Auto-start → On\n2) Battery → No restrictions\n3) Background high power → Allow\n4) Lock the app in Recents',
          )
        }
        testID="prefs-vivo-checklist"
      >
        <Text style={styles.btnText}>Show Vivo whitelist checklist</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={save}
        testID="prefs-save"
      >
        <Text style={styles.btnText}>{busy ? 'Saving…' : 'Save'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 24, gap: 8, paddingBottom: 48 },
  back: { color: '#2563eb', fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  label: { marginTop: 8, fontWeight: '600', color: '#0f172a' },
  section: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  chipOn: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  chipText: { color: '#0f172a', fontWeight: '500' },
  chipTextOn: { color: '#2563eb', fontWeight: '700' },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondary: { backgroundColor: '#475569' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600' },
});
