import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

const META_KEY = 'pa.fallback.llm.meta';
const KEY_SERVICE = 'com.privateagent.fallback-llm';
const KEY_USER = 'fallback-api-key';

export type LocalFallbackMeta = {
  baseUrl: string;
  model: string;
  enabled: boolean;
};

const DEFAULT_META: LocalFallbackMeta = {
  baseUrl: '',
  model: 'llama3.2',
  enabled: true,
};

/**
 * Non-secret meta in AsyncStorage; API key in Keychain (same lib as SC009/BD031).
 */
export const LocalFallbackStore = {
  async getMeta(): Promise<LocalFallbackMeta> {
    try {
      const raw = await AsyncStorage.getItem(META_KEY);
      if (!raw) {
        return { ...DEFAULT_META };
      }
      return { ...DEFAULT_META, ...(JSON.parse(raw) as LocalFallbackMeta) };
    } catch {
      return { ...DEFAULT_META };
    }
  },

  async setMeta(patch: Partial<LocalFallbackMeta>): Promise<LocalFallbackMeta> {
    const next = { ...(await this.getMeta()), ...patch };
    if (next.baseUrl) {
      next.baseUrl = next.baseUrl.replace(/\/$/, '');
    }
    await AsyncStorage.setItem(META_KEY, JSON.stringify(next));
    return next;
  },

  async getApiKey(): Promise<string> {
    try {
      const creds = await Keychain.getGenericPassword({ service: KEY_SERVICE });
      return creds && creds.password ? creds.password : '';
    } catch {
      return '';
    }
  },

  async setApiKey(key: string): Promise<void> {
    if (!key) {
      await Keychain.resetGenericPassword({ service: KEY_SERVICE });
      return;
    }
    await Keychain.setGenericPassword(KEY_USER, key, {
      service: KEY_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async isConfigured(): Promise<boolean> {
    const meta = await this.getMeta();
    return Boolean(meta.baseUrl && meta.model);
  },
};
