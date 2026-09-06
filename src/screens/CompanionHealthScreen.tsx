import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CompanionMode, EventLogLevel } from '../constants/appConstants';
import { CompanionModeService } from '../services/CompanionModeService';
import { LocalStore } from '../store/LocalStore';
import type { EventLogRow } from '../store/daos/EventLogDao';

type Props = { onBack: () => void };

export function CompanionHealthScreen({ onBack }: Props): React.JSX.Element {
  const [mode, setMode] = useState(CompanionModeService.getMode());
  const [events, setEvents] = useState<EventLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setMode(CompanionModeService.getMode());
    try {
      const store = await LocalStore.open();
      const recent = await store.events.recent(40);
      setEvents(recent);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    return CompanionModeService.subscribe(setMode);
  }, [refresh]);

  const injectTestFailure = useCallback(async () => {
    try {
      const store = await LocalStore.open();
      await store.events.append(
        EventLogLevel.ERROR,
        'health',
        'Manual test failure (SC008)',
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refresh]);

  return (
    <View style={styles.root}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← Settings</Text>
      </Pressable>
      <Text style={styles.title}>Companion health</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>
          Mode: {mode === CompanionMode.DOCKED ? 'DOCKED' : 'OPERATOR'}
        </Text>
        <Text style={styles.cardText}>
          FGS: {mode === CompanionMode.DOCKED ? 'should be running' : 'stopped'}
        </Text>
      </View>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={refresh}>
          <Text style={styles.btnText}>Refresh</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.secondary]}
          onPress={injectTestFailure}
        >
          <Text style={styles.btnText}>Log test error</Text>
        </Pressable>
      </View>
      <Text style={styles.section}>Recent events</Text>
      <ScrollView style={styles.list}>
        {events.length === 0 ? (
          <Text style={styles.empty}>No events yet.</Text>
        ) : (
          events.map(evt => (
            <View key={evt.id} style={styles.event}>
              <Text style={styles.eventMeta}>
                {evt.createdAt} · {evt.level} · {evt.area}
              </Text>
              <Text style={styles.eventMsg}>{evt.message}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 12, backgroundColor: '#f8fafc' },
  back: { color: '#2563eb', fontWeight: '600', marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, gap: 6 },
  cardText: { color: '#e2e8f0' },
  err: { color: '#b91c1c' },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  secondary: { backgroundColor: '#334155' },
  btnText: { color: '#fff', fontWeight: '600' },
  section: { marginTop: 8, fontWeight: '700', color: '#0f172a' },
  list: { flex: 1 },
  empty: { color: '#64748b' },
  event: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cbd5e1',
  },
  eventMeta: { color: '#64748b', fontSize: 12 },
  eventMsg: { color: '#0f172a', marginTop: 2 },
});
