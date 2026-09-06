import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { setOnboardingComplete } from '../navigation/onboarding';

type Props = { onDone: () => void };

export function OnboardingScreen({ onDone }: Props): React.JSX.Element {
  const finish = async () => {
    await setOnboardingComplete();
    onDone();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Welcome to PrivateAgent</Text>
      <Text style={styles.body}>
        Enable Accessibility for PrivateAgent, whitelist background power on
        Vivo (see docs/DEVICE_PROVISIONING.md), then continue.
      </Text>
      <Pressable style={styles.btn} onPress={finish}>
        <Text style={styles.btnText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#0f172a',
  },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '700' },
  body: { color: '#94a3b8', fontSize: 15, lineHeight: 22 },
  btn: {
    marginTop: 12,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
});
