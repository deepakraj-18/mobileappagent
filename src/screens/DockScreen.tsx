import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = { onExit: () => void };

/** Compact dock shell placeholder — Phase 2 FD001 fills visuals. */
export function DockScreen({ onExit }: Props): React.JSX.Element {
  return (
    <View style={styles.root}>
      <Text style={styles.clock}>Dock</Text>
      <Text style={styles.sub}>Companion mode · listening placeholder</Text>
      <Pressable style={styles.btn} onPress={onExit}>
        <Text style={styles.btnText}>Exit to Operator</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  clock: { color: '#f8fafc', fontSize: 40, fontWeight: '700' },
  sub: { color: '#94a3b8' },
  btn: {
    marginTop: 24,
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnText: { color: '#fff', fontWeight: '600' },
});
