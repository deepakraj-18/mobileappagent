import { WakeState, type WakeState as WakeStateType } from '../constants/appConstants';
import { phoneEmbodiment } from '../embodiment/PhoneEmbodiment';
import { ScreenPower } from '../native/ScreenPower';
import {
  createVoiceSession,
  type SttProvider,
  type VoiceSession,
} from './VoiceSession';
import { WakeWordService } from './WakeWordService';

/**
 * Phase-2 STT placeholder — real on-device STT lands with later voice polish.
 * Empty capture still exercises the VoiceSession empty-transcript path.
 */
export const stubSttProvider: SttProvider = {
  async capture(): Promise<string> {
    return '';
  },
};

export type DockVoiceRuntime = {
  getWakeState(): WakeStateType;
  subscribe(listener: (state: WakeStateType) => void): () => void;
  tapToTalk(): void;
  stop(): void;
};

export type DockVoiceRuntimeDeps = {
  stt?: SttProvider;
  wakeWord?: typeof WakeWordService;
  createSession?: typeof createVoiceSession;
};

/**
 * Owns wake-word duty-cycle + VoiceSession while the companion is docked.
 * Hub / presence remain unwired (Phase 3 / 5).
 */
export function startDockVoiceRuntime(
  deps: DockVoiceRuntimeDeps = {},
): DockVoiceRuntime {
  const wakeWord = deps.wakeWord ?? WakeWordService;
  const stt = deps.stt ?? stubSttProvider;
  const makeSession = deps.createSession ?? createVoiceSession;

  const session: VoiceSession = makeSession({
    embodiment: phoneEmbodiment,
    screenPower: ScreenPower,
    stt,
  });

  let wakeState: WakeStateType = WakeState.LISTENING_FOR_WAKE;
  const uiListeners = new Set<(state: WakeStateType) => void>();

  const emitUi = (state: WakeStateType) => {
    wakeState = state;
    for (const listener of uiListeners) {
      listener(state);
    }
  };

  const unsubSession = session.subscribe(snap => {
    emitUi(snap.state);
  });

  const unsubWake = wakeWord.subscribe(() => {
    void session.onWake();
  });

  const unbindDuty = wakeWord.bindCompanionDutyCycle();

  return {
    getWakeState: () => wakeState,
    subscribe: listener => {
      uiListeners.add(listener);
      listener(wakeState);
      return () => {
        uiListeners.delete(listener);
      };
    },
    tapToTalk: () => {
      wakeWord.tapToTalk();
    },
    stop: () => {
      unsubSession();
      unsubWake();
      unbindDuty();
      void wakeWord.stop();
      emitUi(WakeState.LISTENING_FOR_WAKE);
    },
  };
}
