import React, { useCallback, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
} from 'react-native';
import { Accessibility } from './src/native/Accessibility';

function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [status, setStatus] = useState('PrivateAgent RN scaffold (IF004)');
  const [serviceOn, setServiceOn] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const enabled = await Accessibility.isServiceEnabled();
      setServiceOn(enabled);
      const size = await Accessibility.getScreenSize();
      setStatus(
        `a11y=${enabled ? 'ON' : 'OFF'} · screen ${size.width}×${size.height}`,
      );
    } catch (e) {
      setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const openSettings = useCallback(async () => {
    await Accessibility.openAccessibilitySettings();
  }, []);

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: isDark ? '#111' : '#f5f5f5' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#111' }]}>
          PrivateAgent
        </Text>
        <Text style={[styles.sub, { color: isDark ? '#aaa' : '#444' }]}>
          React Native Community CLI scaffold + AccessibilityBridge
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>{status}</Text>
          <Text style={styles.cardText}>
            Service:{' '}
            {serviceOn == null ? '—' : serviceOn ? 'enabled' : 'disabled'}
          </Text>
        </View>
        <Pressable style={styles.btn} onPress={refresh}>
          <Text style={styles.btnText}>Refresh bridge status</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={openSettings}>
          <Text style={styles.btnText}>Open accessibility settings</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  sub: { fontSize: 14, marginBottom: 8 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardText: { color: '#e2e8f0', fontSize: 14 },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondary: { backgroundColor: '#334155' },
  btnText: { color: '#fff', fontWeight: '600' },
});

export default App;
