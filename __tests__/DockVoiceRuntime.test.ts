jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async () => undefined),
  getItem: jest.fn(async () => null),
  removeItem: jest.fn(async () => undefined),
  clear: jest.fn(async () => undefined),
}));

jest.mock('../src/native/CompanionRuntime', () => ({
  CompanionRuntime: {
    start: jest.fn(async () => true),
    stop: jest.fn(async () => true),
  },
}));

jest.mock('../src/embodiment/PhoneEmbodiment', () => ({
  phoneEmbodiment: {
    speak: jest.fn(async () => undefined),
    express: jest.fn(async () => undefined),
    move: jest.fn(async () => undefined),
    present: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/native/ScreenPower', () => ({
  ScreenPower: {
    sleep: jest.fn(async () => 'accessibility'),
    wake: jest.fn(async () => true),
    clearKeepAwake: jest.fn(async () => true),
  },
}));

import { WakeState } from '../src/constants/appConstants';
import { startDockVoiceRuntime } from '../src/voice/DockVoiceRuntime';
import type { VoiceSession } from '../src/voice/VoiceSession';
import type { WakeEvent } from '../src/voice/WakeWordService';

describe('DockVoiceRuntime', () => {
  it('starts duty-cycle, forwards wake events to VoiceSession, and stops cleanly', async () => {
    const wakeListeners = new Set<(e: WakeEvent) => void>();
    const wakeWord = {
      subscribe: jest.fn((listener: (e: WakeEvent) => void) => {
        wakeListeners.add(listener);
        return () => wakeListeners.delete(listener);
      }),
      bindCompanionDutyCycle: jest.fn(() => jest.fn()),
      tapToTalk: jest.fn(() => {
        for (const l of wakeListeners) {
          l({ source: 'TAP', keyword: 'Hey Genie', at: Date.now() });
        }
      }),
      stop: jest.fn(async () => undefined),
    };

    const onWake = jest.fn(async () => ({
      state: WakeState.LISTENING_FOR_WAKE,
      lastRoute: null,
      lastTranscript: '',
      lastReply: '',
    }));

    const session = {
      subscribe: jest.fn((listener: (s: { state: string }) => void) => {
        listener({ state: WakeState.LISTENING_FOR_WAKE });
        return jest.fn();
      }),
      onWake,
    } as unknown as VoiceSession;

    const runtime = startDockVoiceRuntime({
      wakeWord:
        wakeWord as unknown as typeof import('../src/voice/WakeWordService').WakeWordService,
      createSession: () => session,
      stt: { capture: async () => '' },
    });

    expect(wakeWord.bindCompanionDutyCycle).toHaveBeenCalled();

    const seen: string[] = [];
    const unsubUi = runtime.subscribe(s => seen.push(s));
    expect(seen).toContain(WakeState.LISTENING_FOR_WAKE);

    runtime.tapToTalk();
    expect(wakeWord.tapToTalk).toHaveBeenCalled();
    await Promise.resolve();
    expect(onWake).toHaveBeenCalled();

    runtime.stop();
    expect(wakeWord.stop).toHaveBeenCalled();
    unsubUi();
  });
});
