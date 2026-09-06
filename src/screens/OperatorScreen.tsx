import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Accessibility } from '../native/Accessibility';

export function OperatorScreen(): React.JSX.Element {
  const [status, setStatus] = useState('Operator');
  const [serviceOn, setServiceOn] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const enabled = await Accessibility.isServiceEnabled();
      setServiceOn(enabled);
      const size = await Accessibility.getScreenSize();
      setStatus(`a11y=${enabled ? 'ON' : 'OFF'} · ${size.width}×${size.height}`);
    } catch (e) {
      setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Operator</Text>
      <Text style={styles.sub}>In-app control only — drive the a11y bridge here.</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>{status}</Text>
        <Text style={styles.cardText}>
          Service: {serviceOn == null ? '—' : serviceOn ? 'enabled' : 'disabled'}
        </Text>
      </View>
      <Pressable style={styles.btn} onPress={refresh}>
        <Text style={styles.btnText}>Refresh bridge status</Text>
      </Pressable>
      <Pressable
        style={[styles.btn, styles.secondary]}
        onPress={() => Accessibility.openAccessibilitySettings()}>
        <Text style={styles.btnText}>Open accessibility settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 12, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b', marginBottom: 8 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, gap: 8 },
  cardText: { color: '#e2e8f0' },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondary: { backgroundColor: '#334155' },
  btnText: { color: '#fff', fontWeight: '600' },
});
