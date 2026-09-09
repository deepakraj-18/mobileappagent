import {
  AiException,
  LocalFallbackLlm,
} from '../src/agent/LocalFallbackLlm';
import { TaskExecutor } from '../src/agent/TaskExecutor';
import { MockHubClient } from '../src/hub/MockHubClient';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

jest.mock('react-native-keychain', () => {
  let password: string | null = null;
  return {
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED' },
    setGenericPassword: jest.fn(async (_u: string, p: string) => {
      password = p;
      return true;
    }),
    getGenericPassword: jest.fn(async () =>
      password ? { username: 'u', password, service: 's', storage: 'k' } : false,
    ),
    resetGenericPassword: jest.fn(async () => {
      password = null;
      return true;
    }),
  };
});

import { LocalFallbackStore } from '../src/agent/LocalFallbackStore';

describe('LocalFallbackLlm', () => {
  beforeEach(async () => {
    await LocalFallbackStore.setMeta({
      baseUrl: 'https://llm.example',
      model: 'test-model',
      enabled: true,
    });
    await LocalFallbackStore.setApiKey('sk-test');
  });

  it('posts OpenAI-compatible chat/completions with bearer key', async () => {
    const fetchFn = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://llm.example/chat/completions');
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer sk-test',
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"action":"done","params":{},"is_complete":true,"reasoning":"ok"}',
              },
            },
          ],
        }),
      } as Response;
    });

    const llm = new LocalFallbackLlm({ fetchFn });
    const step = await llm.completeAction({
      goal: 'finish',
      screenDescription: 'empty',
    });
    expect(step.action).toBe('done');
  });

  it('testConnection reports failure on HTTP error', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'bad key' } }),
    })) as jest.Mock;

    const llm = new LocalFallbackLlm({ fetchFn });
    const result = await llm.testConnection();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/bad key|401/);
    }
  });

  it('TaskExecutor uses local LLM when hub think times out', async () => {
    const hub = new MockHubClient();
    await hub.connect();

    const llm = new LocalFallbackLlm({
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: '{"action":"done","is_complete":true}',
                },
              },
            ],
          }),
        }) as Response,
    });

    const executor = new TaskExecutor({
      hub,
      localLlm: llm,
      accessibility: {
        dumpScreen: async () => [],
      } as never,
      actionTimeoutMs: 40,
      stepDelayMs: 0,
      sleep: async () => undefined,
    });
    executor.startListening();

    const status = await executor.runGoal({
      goalId: 'g-fb',
      goal: 'done please',
    });
    expect(status).toBe('SUCCESS');
    const finished = hub.sent.find(
      f =>
        f.type === 'event' &&
        (f.payload as { event: string }).event === 'GOAL_FINISHED',
    );
    expect((finished?.payload as { usedLocalFallback: boolean }).usedLocalFallback).toBe(
      true,
    );
  });
});

void AiException;
