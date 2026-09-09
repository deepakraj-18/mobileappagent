import { LocalFallbackStore } from './LocalFallbackStore';
import { TaskStep } from './TaskStep';

export class AiException extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(statusCode == null ? message : `HTTP ${statusCode}: ${message}`);
    this.name = 'AiException';
    this.statusCode = statusCode;
  }
}

export type ChatMessage = { role: string; content: string };

export type LocalFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type LocalFallbackLlmDeps = {
  fetchFn?: LocalFetch;
  getMeta?: typeof LocalFallbackStore.getMeta;
  getApiKey?: typeof LocalFallbackStore.getApiKey;
};

const AGENT_SYSTEM = `You are PrivateAgent, an autonomous Android UI automation agent.
Decide exactly ONE next action and reply with ONLY a single JSON object — no prose, no markdown fences:
{"action": "<action>", "params": {...}, "reasoning": "<max 25 words>", "is_complete": false}
Allowed actions: click_text, click_at, type_text, press_enter, scroll, swipe, press_back, press_home, open_app, wait, done.
Base every action on the CURRENT screen dump. When complete, use done with is_complete true.`;

/**
 * OpenAI-compatible chat completions for degraded / local mode (hub-contract §9).
 */
export class LocalFallbackLlm {
  private readonly fetchFn: LocalFetch;
  private readonly getMeta: typeof LocalFallbackStore.getMeta;
  private readonly getApiKey: typeof LocalFallbackStore.getApiKey;

  constructor(deps?: LocalFallbackLlmDeps) {
    this.fetchFn =
      deps?.fetchFn ?? ((input, init) => fetch(input, init));
    this.getMeta = deps?.getMeta ?? LocalFallbackStore.getMeta.bind(LocalFallbackStore);
    this.getApiKey =
      deps?.getApiKey ?? LocalFallbackStore.getApiKey.bind(LocalFallbackStore);
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    return this.postChatCompletion(messages);
  }

  async completeAction(opts: {
    goal: string;
    screenDescription: string;
    history?: ChatMessage[];
  }): Promise<TaskStep> {
    const messages: ChatMessage[] = [
      { role: 'system', content: AGENT_SYSTEM },
      ...(opts.history ?? []),
      {
        role: 'user',
        content: `GOAL: ${opts.goal}\n\nCURRENT SCREEN:\n${opts.screenDescription}`,
      },
    ];
    const raw = await this.postChatCompletion(messages);
    const step = TaskStep.tryParse(raw);
    if (!step) {
      throw new AiException('Local LLM reply was not a valid TaskStep JSON');
    }
    return step;
  }

  async testConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const reply = await this.postChatCompletion([
        { role: 'user', content: 'Reply with the single word: pong' },
      ]);
      if (!reply.trim()) {
        return { ok: false, error: 'Empty response' };
      }
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async postChatCompletion(messages: ChatMessage[]): Promise<string> {
    const meta = await this.getMeta();
    if (!meta.baseUrl) {
      throw new AiException('Fallback LLM base URL not configured');
    }
    const apiKey = await this.getApiKey();
    const url = `${meta.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await this.fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: meta.model,
        messages,
        temperature: 0.2,
      }),
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new AiException('Invalid JSON from fallback LLM', res.status);
    }

    if (!res.ok) {
      const err = body as { error?: { message?: string } };
      throw new AiException(
        err?.error?.message ?? 'Fallback LLM request failed',
        res.status,
      );
    }

    const choice = (body as {
      choices?: Array<{ message?: { content?: string } }>;
    }).choices?.[0]?.message?.content;
    if (typeof choice !== 'string') {
      throw new AiException('Fallback LLM response missing choices[0].message.content');
    }
    return choice;
  }
}

export const localFallbackLlm = new LocalFallbackLlm();
