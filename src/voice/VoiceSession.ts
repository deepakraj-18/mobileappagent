import {
  VoicePowerCommand,
  VoiceRoute,
  WakeState,
  type VoicePowerCommand as VoicePowerCommandType,
  type VoiceRoute as VoiceRouteType,
  type WakeState as WakeStateType,
} from '../constants/appConstants';
import type { Embodiment } from '../embodiment/Embodiment';
import type { ScreenPowerApi } from '../native/ScreenPower';
import { ScreenPower } from '../native/ScreenPower';

export type SttProvider = {
  /** Capture one utterance; empty string = no speech. */
  capture(): Promise<string>;
  cancel?(): Promise<void>;
};

export type HubRouter = {
  /**
   * Phase 3 wires real hub. Until then return `{ handled: false }`.
   */
  tryHandle(transcript: string): Promise<{ handled: boolean; reply?: string }>;
};

export type LocalLlmFallback = {
  reply(transcript: string): Promise<string>;
};

export type VoiceSessionDeps = {
  embodiment: Embodiment;
  screenPower?: ScreenPowerApi;
  stt: SttProvider;
  hub?: HubRouter;
  localFallback?: LocalLlmFallback;
};

export type VoiceSessionSnapshot = {
  state: WakeStateType;
  lastRoute: VoiceRouteType | null;
  lastTranscript: string;
  lastReply: string;
};

type StateListener = (snap: VoiceSessionSnapshot) => void;

const SLEEP_PATTERNS =
  /\b(go to sleep|good night|sleep now|lock (the )?screen|turn off (the )?screen)\b/i;
const WAKE_PATTERNS =
  /\b(wake up|good morning|wake (the )?screen|turn on (the )?screen)\b/i;

/** Classify built-in power commands; null if not a power command. */
export function classifyPowerCommand(
  transcript: string,
): VoicePowerCommandType | null {
  const t = transcript.trim();
  if (!t) {
    return null;
  }
  if (SLEEP_PATTERNS.test(t) || /^sleep$/i.test(t)) {
    return VoicePowerCommand.SLEEP;
  }
  if (WAKE_PATTERNS.test(t) || /^wake$/i.test(t)) {
    return VoicePowerCommand.WAKE;
  }
  return null;
}

const stubHub: HubRouter = {
  async tryHandle() {
    return { handled: false };
  },
};

const stubLocal: LocalLlmFallback = {
  async reply(transcript: string) {
    return `I heard: ${transcript}`;
  },
};

/**
 * Wake → STT → route (hub | local-fallback | command) → TTS.
 * Hub branch is intentionally stubbed until BD030 / FI030.
 */
export class VoiceSession {
  private state: WakeStateType = WakeState.LISTENING_FOR_WAKE;
  private lastRoute: VoiceRouteType | null = null;
  private lastTranscript = '';
  private lastReply = '';
  private busy = false;
  private readonly listeners = new Set<StateListener>();
  private readonly embodiment: Embodiment;
  private readonly screenPower: ScreenPowerApi;
  private readonly stt: SttProvider;
  private readonly hub: HubRouter;
  private readonly localFallback: LocalLlmFallback;

  constructor(deps: VoiceSessionDeps) {
    this.embodiment = deps.embodiment;
    this.screenPower = deps.screenPower ?? ScreenPower;
    this.stt = deps.stt;
    this.hub = deps.hub ?? stubHub;
    this.localFallback = deps.localFallback ?? stubLocal;
  }

  getSnapshot(): VoiceSessionSnapshot {
    return {
      state: this.state,
      lastRoute: this.lastRoute,
      lastTranscript: this.lastTranscript,
      lastReply: this.lastReply,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Enter sleeping UI/runtime state (does not lock the device by itself). */
  markSleeping(): void {
    this.setState(WakeState.SLEEPING);
  }

  /** Return to idle wake listening after sleep or session end. */
  markListening(): void {
    this.setState(WakeState.LISTENING_FOR_WAKE);
  }

  /**
   * Handle a wake-word / tap-to-talk event: STT → route → TTS.
   */
  async onWake(): Promise<VoiceSessionSnapshot> {
    if (this.busy) {
      return this.getSnapshot();
    }
    this.busy = true;
    try {
      this.setState(WakeState.AWAKE);
      await this.screenPower.wake();

      this.setState(WakeState.CAPTURING);
      const transcript = (await this.stt.capture()).trim();
      this.lastTranscript = transcript;

      if (!transcript) {
        this.lastReply = "I didn't catch that.";
        this.lastRoute = VoiceRoute.LOCAL_FALLBACK;
        await this.speakAndSettle(this.lastReply);
        return this.getSnapshot();
      }

      const power = classifyPowerCommand(transcript);
      if (power) {
        this.lastRoute = VoiceRoute.COMMAND;
        await this.runPowerCommand(power);
        return this.getSnapshot();
      }

      const hubResult = await this.hub.tryHandle(transcript);
      if (hubResult.handled) {
        this.lastRoute = VoiceRoute.HUB;
        this.lastReply = hubResult.reply ?? '';
        if (this.lastReply) {
          await this.speakAndSettle(this.lastReply);
        } else {
          this.setState(WakeState.LISTENING_FOR_WAKE);
        }
        return this.getSnapshot();
      }

      this.lastRoute = VoiceRoute.LOCAL_FALLBACK;
      this.lastReply = await this.localFallback.reply(transcript);
      await this.speakAndSettle(this.lastReply);
      return this.getSnapshot();
    } finally {
      this.busy = false;
    }
  }

  private async runPowerCommand(cmd: VoicePowerCommandType): Promise<void> {
    if (cmd === VoicePowerCommand.SLEEP) {
      this.lastReply = 'Going to sleep.';
      this.setState(WakeState.SPEAKING);
      await this.embodiment.speak(this.lastReply);
      await this.screenPower.sleep();
      this.setState(WakeState.SLEEPING);
      return;
    }
    this.lastReply = "I'm awake.";
    await this.screenPower.wake();
    await this.speakAndSettle(this.lastReply);
  }

  private async speakAndSettle(text: string): Promise<void> {
    this.setState(WakeState.SPEAKING);
    await this.embodiment.speak(text);
    this.setState(WakeState.LISTENING_FOR_WAKE);
  }

  private setState(next: WakeStateType): void {
    this.state = next;
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export function createVoiceSession(deps: VoiceSessionDeps): VoiceSession {
  return new VoiceSession(deps);
}
