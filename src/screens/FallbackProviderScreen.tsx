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
import { localFallbackLlm } from '../agent/LocalFallbackLlm';
import { LocalFallbackStore } from '../agent/LocalFallbackStore';

type Props = { onBack: () => void };

/** FD041 — OpenAI-compatible local fallback provider form. */
export function FallbackProviderScreen({ onBack }: Props): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('llama3.2');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const meta = await LocalFallbackStore.getMeta();
      setBaseUrl(meta.baseUrl);
      setModel(meta.model);
      setEnabled(meta.enabled);
      const key = await LocalFallbackStore.getApiKey();
      setApiKey(key);
    })();
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await LocalFallbackStore.setMeta({ baseUrl, model, enabled });
      await LocalFallbackStore.setApiKey(apiKey.trim());
      Alert.alert('Saved', 'Fallback provider settings updated.');
    } finally {
      setBusy(false);
    }
  }, [baseUrl, model, apiKey, enabled]);

  const test = useCallback(async () => {
    setBusy(true);
    try {
      await LocalFallbackStore.setMeta({ baseUrl, model, enabled });
      await LocalFallbackStore.setApiKey(apiKey.trim());
      const result = await localFallbackLlm.testConnection();
      if (result.ok) {
        Alert.alert('Connection OK', 'Fallback LLM responded.');
      } else {
        Alert.alert('Connection failed', result.error);
      }
    } finally {
      setBusy(false);
    }
  }, [baseUrl, model, apiKey, enabled]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="fallback-provider-screen"
    >
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.back}>← Settings</Text>
      </Pressable>
      <Text style={styles.title}>Fallback LLM</Text>
      <Text style={styles.sub}>
        OpenAI-compatible endpoint used when the hub is unreachable (degraded
        mode). API key stored in the Android Keystore.
      </Text>

      <Text style={styles.label}>Base URL</Text>
      <TextInput
        style={styles.input}
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="http://192.168.0.40:11434/v1"
        placeholderTextColor="#94a3b8"
        testID="fallback-base-url"
      />

      <Text style={styles.label}>Model</Text>
      <TextInput
        style={styles.input}
        value={model}
        onChangeText={setModel}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="llama3.2"
        placeholderTextColor="#94a3b8"
        testID="fallback-model"
      />

      <Text style={styles.label}>API key</Text>
      <TextInput
        style={styles.input}
        value={apiKey}
        onChangeText={setApiKey}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="optional for local Ollama"
        placeholderTextColor="#94a3b8"
        testID="fallback-api-key"
      />

      <View style={styles.row}>
        <Text style={styles.label}>Enabled</Text>
        <Switch value={enabled} onValueChange={setEnabled} testID="fallback-enabled" />
      </View>

      <Pressable
        style={[styles.btn, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={save}
        testID="fallback-save"
      >
        <Text style={styles.btnText}>{busy ? 'Working…' : 'Save'}</Text>
      </Pressable>
      <Pressable
        style={[styles.btn, styles.secondary, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={test}
        testID="fallback-test"
      >
        <Text style={styles.btnText}>Test connection</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 24, gap: 8, paddingBottom: 48 },
  back: { color: '#2563eb', fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b', marginBottom: 8 },
  label: { marginTop: 8, fontWeight: '600', color: '#0f172a' },
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
  },
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
