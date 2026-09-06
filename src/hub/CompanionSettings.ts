import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CompanionConfig } from './types';

const KEY = 'pa.hub.companionSettings';

type Listener = (cfg: CompanionConfig) => void;

/**
 * Applied companion config from brain CONFIG command or GET /v1/companion/config.
 * Local prefs only — not LifeOS domain data.
 */
class CompanionSettingsImpl {
  private config: CompanionConfig = {};
  private readonly listeners = new Set<Listener>();

  async hydrate(): Promise<CompanionConfig> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        this.config = JSON.parse(raw) as CompanionConfig;
      }
    } catch {
      this.config = {};
    }
    this.emit();
    return this.config;
  }

  get(): CompanionConfig {
    return this.config;
  }

  /** Replace entire config (tests / full REST snapshot). */
  async replace(config: CompanionConfig): Promise<CompanionConfig> {
    this.config = { ...config };
    await AsyncStorage.setItem(KEY, JSON.stringify(this.config));
    this.emit();
    return this.config;
  }

  /** Merge patch from CONFIG command / REST (shallow). */
  async apply(patch: CompanionConfig): Promise<CompanionConfig> {
    this.config = { ...this.config, ...patch };
    await AsyncStorage.setItem(KEY, JSON.stringify(this.config));
    this.emit();
    return this.config;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.config);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) {
      l(this.config);
    }
  }
}

export const CompanionSettings = new CompanionSettingsImpl();
