/**
 * One atomic action — wire vocabulary matches Flutter `task_step.dart`.
 * Hub-contract SCREAMING_SNAKE (`CLICK_TEXT`) lowercases to `click_text`.
 */
export const TaskActions = {
  CLICK_TEXT: 'click_text',
  CLICK_AT: 'click_at',
  TYPE_TEXT: 'type_text',
  PRESS_ENTER: 'press_enter',
  SCROLL: 'scroll',
  SWIPE: 'swipe',
  PRESS_BACK: 'press_back',
  PRESS_HOME: 'press_home',
  OPEN_APP: 'open_app',
  WAIT: 'wait',
  DONE: 'done',
} as const;

const SUPPORTED = new Set<string>(Object.values(TaskActions));

export type TaskStepJson = {
  action: string;
  params?: Record<string, unknown>;
  reasoning?: string;
  is_complete?: boolean;
  isComplete?: boolean;
};

export class TaskStep {
  static readonly actionClickText = TaskActions.CLICK_TEXT;
  static readonly actionClickAt = TaskActions.CLICK_AT;
  static readonly actionTypeText = TaskActions.TYPE_TEXT;
  static readonly actionPressEnter = TaskActions.PRESS_ENTER;
  static readonly actionScroll = TaskActions.SCROLL;
  static readonly actionSwipe = TaskActions.SWIPE;
  static readonly actionPressBack = TaskActions.PRESS_BACK;
  static readonly actionPressHome = TaskActions.PRESS_HOME;
  static readonly actionOpenApp = TaskActions.OPEN_APP;
  static readonly actionWait = TaskActions.WAIT;
  static readonly actionDone = TaskActions.DONE;
  static readonly supportedActions = SUPPORTED;

  readonly action: string;
  readonly params: Record<string, unknown>;
  readonly reasoning: string;
  readonly isComplete: boolean;

  constructor(opts: {
    action: string;
    params?: Record<string, unknown>;
    reasoning?: string;
    isComplete?: boolean;
  }) {
    this.action = opts.action;
    this.params = opts.params ?? {};
    this.reasoning = opts.reasoning ?? '';
    this.isComplete = opts.isComplete ?? false;
  }

  static fromJson(json: TaskStepJson): TaskStep {
    const action = String(json.action ?? '')
      .trim()
      .toLowerCase();
    const rawParams = json.params;
    return new TaskStep({
      action,
      params:
        rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
          ? { ...rawParams }
          : {},
      reasoning: String(json.reasoning ?? ''),
      isComplete: json.is_complete === true || json.isComplete === true,
    });
  }

  get isSupported(): boolean {
    return SUPPORTED.has(this.action);
  }

  get signature(): string {
    return `${this.action}:${JSON.stringify(this.params)}`;
  }

  intParam(key: string): number | null {
    const v = this.params[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return Math.round(v);
    }
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    return null;
  }

  stringParam(key: string): string | null {
    const v = this.params[key];
    if (v == null) {
      return null;
    }
    const s = String(v);
    return s.length === 0 ? null : s;
  }

  toJson(): TaskStepJson {
    return {
      action: this.action,
      params: this.params,
      reasoning: this.reasoning,
      is_complete: this.isComplete,
    };
  }

  /**
   * Robustly extracts the first JSON action object from raw LLM / hub output,
   * tolerating markdown fences, leading prose, and trailing commentary.
   * Same contract as Flutter `TaskStep.tryParse`.
   */
  static tryParse(aiText: string): TaskStep | null {
    let text = aiText.trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i;
    const fenceMatch = fence.exec(text);
    if (fenceMatch?.[1]) {
      text = fenceMatch[1].trim();
    }

    const decode = (candidate: string): TaskStepJson | null => {
      try {
        const decoded = JSON.parse(candidate) as unknown;
        if (
          decoded &&
          typeof decoded === 'object' &&
          !Array.isArray(decoded) &&
          'action' in decoded
        ) {
          return decoded as TaskStepJson;
        }
      } catch {
        // ignore
      }
      return null;
    };

    let parsed = decode(text);
    if (!parsed) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = decode(text.substring(start, end + 1));
      }
    }
    if (!parsed) {
      return null;
    }
    const step = TaskStep.fromJson(parsed);
    return step.isSupported ? step : null;
  }

  /** Parse hub ActionObject `{ action, params }` (hub-contract §6.1). */
  static fromHubAction(
    action: unknown,
    reasoning?: string,
  ): TaskStep | null {
    if (action == null) {
      return null;
    }
    if (typeof action === 'string') {
      return TaskStep.tryParse(action);
    }
    if (typeof action !== 'object' || Array.isArray(action)) {
      return null;
    }
    const obj = action as Record<string, unknown>;
    if (typeof obj.action !== 'string') {
      return TaskStep.tryParse(JSON.stringify(obj));
    }
    const step = TaskStep.fromJson({
      action: obj.action,
      params: (obj.params as Record<string, unknown>) ?? {},
      reasoning: reasoning ?? String(obj.reasoning ?? ''),
      is_complete: obj.is_complete === true || obj.isComplete === true,
    });
    return step.isSupported ? step : null;
  }
}
