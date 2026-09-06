import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  companionDocked: boolean;
  onToggleCompanion: () => void;
  onOpenHealth: () => void;
};

export function SettingsScreen({
  companionDocked,
  onToggleCompanion,
  onOpenHealth,
}: Props): React.JSX.Element {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>Companion mode toggle opens the Dock route.</Text>
      <Text
        style={styles.link}
        onPress={onToggleCompanion}
        accessibilityRole="button">
        {companionDocked ? 'Exit docked companion' : 'Enter docked companion'}
      </Text>
      <Text
        style={styles.link}
        onPress={onOpenHealth}
        accessibilityRole="button">
        Companion health
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 12, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b' },
  link: { marginTop: 16, color: '#2563eb', fontSize: 16, fontWeight: '600' },
});
