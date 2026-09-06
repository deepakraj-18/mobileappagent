import {
  VoicePowerCommand,
  VoiceRoute,
  WakeState,
} from '../src/constants/appConstants';
import type { Embodiment } from '../src/embodiment/Embodiment';
import type { ScreenPowerApi } from '../src/native/ScreenPower';
import {
  classifyPowerCommand,
  createVoiceSession,
  type HubRouter,
  type SttProvider,
} from '../src/voice/VoiceSession';

function mockEmbodiment(): Embodiment & { spoken: string[] } {
  const spoken: string[] = [];
  return {
    spoken,
    speak: jest.fn(async (text: string) => {
      spoken.push(text);
    }),
    express: jest.fn(async () => undefined),
    move: jest.fn(async () => undefined),
    present: jest.fn(async () => undefined),
  };
}

function mockScreen(): ScreenPowerApi & {
  sleepCalls: number;
  wakeCalls: number;
} {
  return {
    sleepCalls: 0,
    wakeCalls: 0,
    sleep: jest.fn(async () => {
      // track via closure
      return 'accessibility';
    }),
    wake: jest.fn(async () => true),
    clearKeepAwake: jest.fn(async () => true),
  };
}

describe('classifyPowerCommand', () => {
  it('detects sleep and wake phrases', () => {
    expect(classifyPowerCommand('go to sleep')).toBe(VoicePowerCommand.SLEEP);
    expect(classifyPowerCommand('Sleep')).toBe(VoicePowerCommand.SLEEP);
    expect(classifyPowerCommand('wake up')).toBe(VoicePowerCommand.WAKE);
    expect(classifyPowerCommand('what time is it')).toBeNull();
  });
});

describe('VoiceSession', () => {
  it('routes non-command speech to local fallback when hub stubs out', async () => {
    const embodiment = mockEmbodiment();
    const screen = mockScreen();
    const stt: SttProvider = {
      capture: async () => 'what is on my calendar',
    };
    const hub: HubRouter = {
      tryHandle: async () => ({ handled: false }),
    };
    const session = createVoiceSession({
      embodiment,
      screenPower: screen,
      stt,
      hub,
      localFallback: {
        reply: async t => `local:${t}`,
      },
    });

    const states: string[] = [];
    session.subscribe(s => states.push(s.state));

    const snap = await session.onWake();
    expect(snap.lastRoute).toBe(VoiceRoute.LOCAL_FALLBACK);
    expect(snap.lastReply).toBe('local:what is on my calendar');
    expect(embodiment.spoken).toContain('local:what is on my calendar');
    expect(screen.wake).toHaveBeenCalled();
    expect(states).toContain(WakeState.CAPTURING);
    expect(states).toContain(WakeState.SPEAKING);
    expect(snap.state).toBe(WakeState.LISTENING_FOR_WAKE);
  });

  it('uses hub route when hub handles the transcript', async () => {
    const embodiment = mockEmbodiment();
    const session = createVoiceSession({
      embodiment,
      screenPower: mockScreen(),
      stt: { capture: async () => 'run my morning routine' },
      hub: {
        tryHandle: async () => ({
          handled: true,
          reply: 'Starting routine.',
        }),
      },
    });
    const snap = await session.onWake();
    expect(snap.lastRoute).toBe(VoiceRoute.HUB);
    expect(embodiment.spoken).toContain('Starting routine.');
  });

  it('runs sleep command via ScreenPower and ends in SLEEPING', async () => {
    const embodiment = mockEmbodiment();
    const screen = mockScreen();
    const session = createVoiceSession({
      embodiment,
      screenPower: screen,
      stt: { capture: async () => 'go to sleep' },
    });
    const snap = await session.onWake();
    expect(snap.lastRoute).toBe(VoiceRoute.COMMAND);
    expect(screen.sleep).toHaveBeenCalled();
    expect(snap.state).toBe(WakeState.SLEEPING);
    expect(embodiment.spoken).toContain('Going to sleep.');
  });

  it('runs wake command via ScreenPower', async () => {
    const embodiment = mockEmbodiment();
    const screen = mockScreen();
    const session = createVoiceSession({
      embodiment,
      screenPower: screen,
      stt: { capture: async () => 'wake up' },
    });
    const snap = await session.onWake();
    expect(snap.lastRoute).toBe(VoiceRoute.COMMAND);
    expect(screen.wake).toHaveBeenCalled();
    expect(snap.state).toBe(WakeState.LISTENING_FOR_WAKE);
  });

  it('speaks a fallback prompt when STT returns empty', async () => {
    const embodiment = mockEmbodiment();
    const session = createVoiceSession({
      embodiment,
      screenPower: mockScreen(),
      stt: { capture: async () => '   ' },
    });
    const snap = await session.onWake();
    expect(snap.lastRoute).toBe(VoiceRoute.LOCAL_FALLBACK);
    expect(embodiment.spoken[0]).toMatch(/didn't catch/i);
  });
});
