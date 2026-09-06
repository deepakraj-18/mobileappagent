import AsyncStorage from '@react-native-async-storage/async-storage';
import { CompanionMode, EventLogLevel } from '../constants/appConstants';
import { CompanionRuntime } from '../native/CompanionRuntime';

const KEY = 'pa.companion.mode';

type Listener = (mode: CompanionMode) => void;

async function logModeChange(mode: CompanionMode): Promise<void> {
  try {
    const { LocalStore } = await import('../store/LocalStore');
    const store = await LocalStore.open();
    await store.events.append(
      EventLogLevel.INFO,
      'companion',
      `Mode → ${mode}`,
    );
  } catch {
    // LocalStore / native sqlite may be unavailable in tests
  }
}

class CompanionModeServiceImpl {
  private mode: CompanionMode = CompanionMode.OPERATOR;
  private readonly listeners = new Set<Listener>();
  private hydrated = false;

  async hydrate(): Promise<CompanionMode> {
    const raw = await AsyncStorage.getItem(KEY);
    this.mode =
      raw === CompanionMode.DOCKED ? CompanionMode.DOCKED : CompanionMode.OPERATOR;
    this.hydrated = true;
    if (this.mode === CompanionMode.DOCKED) {
      void CompanionRuntime.start();
    }
    this.emit();
    return this.mode;
  }

  getMode(): CompanionMode {
    return this.mode;
  }

  isDocked(): boolean {
    return this.mode === CompanionMode.DOCKED;
  }

  async setMode(mode: CompanionMode): Promise<void> {
    this.mode = mode;
    await AsyncStorage.setItem(KEY, mode);
    if (mode === CompanionMode.DOCKED) {
      void CompanionRuntime.start();
    } else {
      void CompanionRuntime.stop();
    }
    void logModeChange(mode);
    this.emit();
  }

  async enterDocked(): Promise<void> {
    await this.setMode(CompanionMode.DOCKED);
  }

  async exitDocked(): Promise<void> {
    await this.setMode(CompanionMode.OPERATOR);
  }

  async toggle(): Promise<CompanionMode> {
    if (this.isDocked()) {
      await this.exitDocked();
    } else {
      await this.enterDocked();
    }
    return this.mode;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.hydrated) {
      listener(this.mode);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.mode);
    }
  }
}

/** Singleton companion-mode controller. */
export const CompanionModeService = new CompanionModeServiceImpl();
