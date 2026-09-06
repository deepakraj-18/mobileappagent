import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import {
  CompanionMode,
  KwsModelFiles,
  WakeEventSource,
  WakeWord,
  type WakeEventSource as WakeEventSourceType,
} from '../constants/appConstants';
import { CompanionModeService } from '../services/CompanionModeService';

export type WakeEvent = {
  source: WakeEventSourceType;
  keyword: string;
  at: number;
};

export type KwsEngine = {
  init(config: {
    modelDir: string;
    modelType?: string;
    keywordsFile?: string;
    modelFiles?: {
      encoder?: string;
      decoder?: string;
      joiner?: string;
      tokens?: string;
    };
    numThreads?: number;
  }): Promise<{ success: boolean; error?: string }>;
  acceptWaveform(
    sampleRate: number,
    samples: number[],
  ): Promise<{
    success: boolean;
    detected: boolean;
    keyword: string;
    error?: string;
  }>;
  resetStream(): Promise<{ success: boolean }>;
  release(): Promise<{ released: boolean }>;
};

export type MicCapture = {
  init(options: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
    wavFile: string;
  }): void;
  start(): void;
  stop(): Promise<string | void>;
  on(event: 'data', callback: (data: string) => void): void;
};

export type KwsAssetsNative = {
  ensureModelDir(): Promise<string>;
};

export type WakeWordDeps = {
  kws?: KwsEngine;
  mic?: MicCapture;
  assets?: KwsAssetsNative;
  requestMicPermission?: () => Promise<boolean>;
};

type Listener = (event: WakeEvent) => void;

/** Convert base64 PCM16 LE to float32 samples in [-1, 1]. */
export function pcm16Base64ToFloat32(b64: string): number[] {
  const atobFn = (globalThis as unknown as { atob: (data: string) => string })
    .atob;
  const binary = atobFn(b64);
  const samples: number[] = [];
  for (let i = 0; i + 1 < binary.length; i += 2) {
    let val = binary.charCodeAt(i) | (binary.charCodeAt(i + 1) << 8);
    if (val >= 0x8000) {
      val -= 0x10000;
    }
    samples.push(val / 32768);
  }
  return samples;
}

async function defaultMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function defaultAssets(): KwsAssetsNative | undefined {
  const mod = NativeModules.KwsAssets as KwsAssetsNative | undefined;
  return mod;
}

async function loadDefaultKws(): Promise<KwsEngine | undefined> {
  try {
    const mod = await import('@siteed/sherpa-onnx.rn');
    return mod.KWS as KwsEngine;
  } catch {
    return undefined;
  }
}

async function loadDefaultMic(): Promise<MicCapture | undefined> {
  try {
    const mod = await import('react-native-live-audio-stream');
    return mod.default as MicCapture;
  } catch {
    return undefined;
  }
}

/**
 * On-device wake-word listener (sherpa-onnx KWS) with tap-to-talk fallback.
 * Duty-cycled with CompanionMode: start when DOCKED (FGS up), stop in OPERATOR.
 */
class WakeWordServiceImpl {
  private listening = false;
  private kwsReady = false;
  private dutyUnsub: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();
  private processingChunk = false;
  private readonly deps: WakeWordDeps;
  private kws: KwsEngine | undefined;
  private mic: MicCapture | undefined;
  private dataHandler: ((data: string) => void) | null = null;

  constructor(deps: WakeWordDeps = {}) {
    this.deps = deps;
  }

  isListening(): boolean {
    return this.listening;
  }

  isEngineReady(): boolean {
    return this.kwsReady;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Start/stop with companion docked mode (rides SC004 FGS lifetime).
   */
  bindCompanionDutyCycle(): () => void {
    this.dutyUnsub?.();
    this.dutyUnsub = CompanionModeService.subscribe(mode => {
      if (mode === CompanionMode.DOCKED) {
        void this.start();
      } else {
        void this.stop();
      }
    });
    if (CompanionModeService.isDocked()) {
      void this.start();
    } else {
      void this.stop();
    }
    return () => {
      this.dutyUnsub?.();
      this.dutyUnsub = null;
    };
  }

  /** Synthetic wake for UI tap-to-talk when KWS is unavailable or unused. */
  tapToTalk(keyword: string = WakeWord.DEFAULT_PHRASE): void {
    this.emit({
      source: WakeEventSource.TAP,
      keyword,
      at: Date.now(),
    });
  }

  async start(): Promise<boolean> {
    if (this.listening) {
      return true;
    }

    const requestPerm = this.deps.requestMicPermission ?? defaultMicPermission;
    const granted = await requestPerm();
    if (!granted) {
      return false;
    }

    this.kws = this.deps.kws ?? (await loadDefaultKws());
    this.mic = this.deps.mic ?? (await loadDefaultMic());

    if (this.kws) {
      const assets = this.deps.assets ?? defaultAssets();
      if (assets) {
        try {
          const modelDir = await assets.ensureModelDir();
          const init = await this.kws.init({
            modelDir,
            modelType: KwsModelFiles.MODEL_TYPE,
            keywordsFile: KwsModelFiles.KEYWORDS,
            numThreads: 1,
            modelFiles: {
              encoder: KwsModelFiles.ENCODER,
              decoder: KwsModelFiles.DECODER,
              joiner: KwsModelFiles.JOINER,
              tokens: KwsModelFiles.TOKENS,
            },
          });
          this.kwsReady = init.success === true;
          if (!this.kwsReady && init.error) {
            // Fall through to mic-off listening=false unless tap path only
          }
        } catch {
          this.kwsReady = false;
        }
      } else {
        this.kwsReady = false;
      }
    }

    if (!this.kwsReady || !this.mic) {
      // Without a live mic+KWS path we still mark listening=false so callers
      // know only tap-to-talk works. Duty-cycle may retry on next dock.
      this.listening = false;
      return false;
    }

    this.mic.init({
      sampleRate: WakeWord.SAMPLE_RATE,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6,
      bufferSize: 4096,
      wavFile: 'pa_wake_scratch.wav',
    });

    this.dataHandler = (data: string) => {
      void this.onMicChunk(data);
    };
    this.mic.on('data', this.dataHandler);
    this.mic.start();
    this.listening = true;
    return true;
  }

  async stop(): Promise<void> {
    if (this.mic && this.listening) {
      try {
        await this.mic.stop();
      } catch {
        // ignore
      }
    }
    this.listening = false;
    if (this.kws && this.kwsReady) {
      try {
        await this.kws.resetStream();
        await this.kws.release();
      } catch {
        // ignore
      }
    }
    this.kwsReady = false;
    this.dataHandler = null;
  }

  private async onMicChunk(b64: string): Promise<void> {
    if (
      !this.listening ||
      !this.kws ||
      !this.kwsReady ||
      this.processingChunk
    ) {
      return;
    }
    this.processingChunk = true;
    try {
      const samples = pcm16Base64ToFloat32(b64);
      if (samples.length === 0) {
        return;
      }
      const result = await this.kws.acceptWaveform(
        WakeWord.SAMPLE_RATE,
        samples,
      );
      if (result.success && result.detected && result.keyword) {
        this.emit({
          source: WakeEventSource.KEYWORD,
          keyword: result.keyword,
          at: Date.now(),
        });
        await this.kws.resetStream();
      }
    } catch {
      // keep listening; decode errors should not tear down the service
    } finally {
      this.processingChunk = false;
    }
  }

  private emit(event: WakeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const WakeWordService = new WakeWordServiceImpl();

/** Test helper — construct an isolated instance with injected deps. */
export function createWakeWordService(deps: WakeWordDeps): WakeWordServiceImpl {
  return new WakeWordServiceImpl(deps);
}
