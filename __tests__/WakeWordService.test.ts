jest.mock('../src/services/CompanionModeService', () =>
  require('./mocks/companionModeService'),
);

import { CompanionMode, WakeEventSource } from '../src/constants/appConstants';
import {
  createWakeWordService,
  pcm16Base64ToFloat32,
  type KwsEngine,
  type MicCapture,
} from '../src/voice/WakeWordService';

function floatToPcm16Base64(samples: number[]): string {
  const bytes = new Uint8Array(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]!));
    v = v < 0 ? v * 0x8000 : v * 0x7fff;
    const int16 = Math.round(v);
    bytes[i * 2] = int16 & 0xff;
    bytes[i * 2 + 1] = (int16 >> 8) & 0xff;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return (globalThis as unknown as { btoa: (data: string) => string }).btoa(
    binary,
  );
}

describe('pcm16Base64ToFloat32', () => {
  it('round-trips a short PCM16 buffer', () => {
    const original = [0, 0.5, -0.5, 1];
    const b64 = floatToPcm16Base64(original);
    const back = pcm16Base64ToFloat32(b64);
    expect(back).toHaveLength(4);
    expect(back[0]).toBeCloseTo(0, 2);
    expect(back[1]).toBeCloseTo(0.5, 2);
    expect(back[2]).toBeCloseTo(-0.5, 2);
  });
});

describe('WakeWordService', () => {
  function mockEngine(detectOnCall = 2): KwsEngine {
    let calls = 0;
    return {
      init: jest.fn(async () => ({ success: true })),
      acceptWaveform: jest.fn(async () => {
        calls += 1;
        if (calls >= detectOnCall) {
          return {
            success: true,
            detected: true,
            keyword: 'Hey Genie',
          };
        }
        return { success: true, detected: false, keyword: '' };
      }),
      resetStream: jest.fn(async () => ({ success: true })),
      release: jest.fn(async () => ({ released: true })),
    };
  }

  function mockMic(): MicCapture & { push: (b64: string) => void } {
    let dataCb: ((data: string) => void) | null = null;
    return {
      init: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(async () => ''),
      on: jest.fn((event: 'data', cb: (data: string) => void) => {
        if (event === 'data') {
          dataCb = cb;
        }
      }),
      push: (b64: string) => dataCb?.(b64),
    };
  }

  it('emits tap-to-talk without starting KWS', () => {
    const svc = createWakeWordService({});
    const seen: string[] = [];
    svc.subscribe(e => seen.push(e.source));
    svc.tapToTalk();
    expect(seen).toEqual([WakeEventSource.TAP]);
  });

  it('starts KWS, detects keyword from mic chunks, and stops cleanly', async () => {
    const kws = mockEngine(1);
    const mic = mockMic();
    const svc = createWakeWordService({
      kws,
      mic,
      assets: { ensureModelDir: async () => '/tmp/kws' },
      requestMicPermission: async () => true,
    });
    const events: Array<{ source: string; keyword: string }> = [];
    svc.subscribe(e => events.push({ source: e.source, keyword: e.keyword }));

    const started = await svc.start();
    expect(started).toBe(true);
    expect(svc.isListening()).toBe(true);
    expect(svc.isEngineReady()).toBe(true);
    expect(kws.init).toHaveBeenCalled();
    expect(mic.start).toHaveBeenCalled();

    mic.push(floatToPcm16Base64([0.1, 0.2, 0.3]));
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(events.some(e => e.source === WakeEventSource.KEYWORD)).toBe(true);

    await svc.stop();
    expect(svc.isListening()).toBe(false);
    expect(kws.release).toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();
  });

  it('duty-cycles with companion docked mode', async () => {
    const kws = mockEngine(99);
    const mic = mockMic();
    const svc = createWakeWordService({
      kws,
      mic,
      assets: { ensureModelDir: async () => '/tmp/kws' },
      requestMicPermission: async () => true,
    });

    const { CompanionModeService: mockMode } = jest.requireMock(
      '../src/services/CompanionModeService',
    ) as {
      CompanionModeService: {
        __setMode: (m: string) => void;
      };
    };

    mockMode.__setMode(CompanionMode.OPERATOR);
    const unbind = svc.bindCompanionDutyCycle();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(svc.isListening()).toBe(false);

    mockMode.__setMode(CompanionMode.DOCKED);
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(svc.isListening()).toBe(true);

    mockMode.__setMode(CompanionMode.OPERATOR);
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(svc.isListening()).toBe(false);

    unbind();
  });

  it('returns false when mic permission denied', async () => {
    const svc = createWakeWordService({
      requestMicPermission: async () => false,
    });
    expect(await svc.start()).toBe(false);
    expect(svc.isListening()).toBe(false);
  });
});
