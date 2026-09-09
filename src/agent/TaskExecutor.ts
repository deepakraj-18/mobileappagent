import type { HubClient } from '../hub/HubClient';
import type { HubCommandPayload, HubFrame } from '../hub/types';
import { makeFrame } from '../hub/types';
import { Accessibility } from '../native/Accessibility';
import { TaskStep } from './TaskStep';

export type GoalStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED';

export type GoalConstraints = {
  maxSteps?: number;
  forbid?: string[];
  noPurchases?: boolean;
};

export type RunGoalInput = {
  goalId: string;
  goal: string;
  constraints?: GoalConstraints;
  origin?: string;
};

export type TaskExecutorDeps = {
  hub: HubClient;
  accessibility?: typeof Accessibility;
  /** Max wait for AGENT_ACTION after AGENT_SCREEN (ms). */
  actionTimeoutMs?: number;
  stepDelayMs?: number;
  defaultMaxSteps?: number;
  /** Injected clock for tests. */
  sleep?: (ms: number) => Promise<void>;
};

type PendingAction = {
  goalId: string;
  step: number;
  resolve: (frame: HubFrame<HubCommandPayload> | null) => void;
};

/**
 * Observe → think (hub) → act loop (hub-contract §8.2).
 * Think step emits AGENT_SCREEN and waits for AGENT_ACTION; local LLM is BD041.
 */
export class TaskExecutor {
  private readonly hub: HubClient;
  private readonly a11y: typeof Accessibility;
  private readonly actionTimeoutMs: number;
  private readonly stepDelayMs: number;
  private readonly defaultMaxSteps: number;
  private readonly sleep: (ms: number) => Promise<void>;

  private busy = false;
  private cancelRequested = false;
  private activeGoalId: string | null = null;
  private pending: PendingAction | null = null;
  private unsubCmd: (() => void) | null = null;

  constructor(deps: TaskExecutorDeps) {
    this.hub = deps.hub;
    this.a11y = deps.accessibility ?? Accessibility;
    this.actionTimeoutMs = deps.actionTimeoutMs ?? 15_000;
    this.stepDelayMs = deps.stepDelayMs ?? 200;
    this.defaultMaxSteps = deps.defaultMaxSteps ?? 15;
    this.sleep =
      deps.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  }

  isBusy(): boolean {
    return this.busy;
  }

  getActiveGoalId(): string | null {
    return this.activeGoalId;
  }

  /** Attach command listener — call once when wiring hub (BD042). */
  startListening(): () => void {
    this.unsubCmd?.();
    this.unsubCmd = this.hub.onCommand(frame => {
      void this.onHubCommand(frame);
    });
    return () => {
      this.unsubCmd?.();
      this.unsubCmd = null;
    };
  }

  requestCancel(goalId?: string): void {
    if (goalId && this.activeGoalId && goalId !== this.activeGoalId) {
      return;
    }
    this.cancelRequested = true;
    if (this.pending) {
      this.pending.resolve(null);
      this.pending = null;
    }
  }

  /**
   * Run the agent loop for a goal. Caller (BD042) handles GOAL_REJECTED gates.
   */
  async runGoal(input: RunGoalInput): Promise<GoalStatus> {
    if (this.busy) {
      return 'FAILED';
    }
    this.busy = true;
    this.cancelRequested = false;
    this.activeGoalId = input.goalId;
    const maxSteps = input.constraints?.maxSteps ?? this.defaultMaxSteps;
    let status: GoalStatus = 'FAILED';
    let stepsCompleted = 0;

    try {
      for (let step = 1; step <= maxSteps; step++) {
        if (this.cancelRequested) {
          status = 'CANCELLED';
          break;
        }

        const nodes = await this.dumpNodes();
        const compact = this.compactNodes(nodes, input.goal);
        const actionWait = this.waitForAgentAction(input.goalId, step);
        await this.hub.sendEvent({
          event: 'AGENT_SCREEN',
          goalId: input.goalId,
          step,
          nodes,
          compact,
        });

        const actionFrame = await actionWait;
        if (!actionFrame) {
          status = this.cancelRequested ? 'CANCELLED' : 'FAILED';
          break;
        }

        const decision = TaskStep.fromHubAction(
          actionFrame.payload.action,
          String(actionFrame.payload.reasoning ?? ''),
        );
        if (!decision) {
          await this.emitStepResult({
            goalId: input.goalId,
            step,
            action: 'unknown',
            ok: false,
            changed: false,
            note: 'AGENT_ACTION failed TaskStep.tryParse / fromHubAction',
          });
          continue;
        }

        if (
          decision.action === TaskStep.actionDone ||
          decision.isComplete
        ) {
          await this.emitStepResult({
            goalId: input.goalId,
            step,
            action: decision.action,
            ok: true,
            changed: false,
            note: decision.reasoning || 'done',
          });
          stepsCompleted = step;
          status = 'SUCCESS';
          break;
        }

        const forbid = (input.constraints?.forbid ?? []).map(f =>
          f.toLowerCase(),
        );
        if (forbid.includes(decision.action)) {
          await this.emitStepResult({
            goalId: input.goalId,
            step,
            action: decision.action,
            ok: false,
            changed: false,
            note: 'forbidden by constraints',
          });
          continue;
        }

        const { ok, note } = await this.performAction(decision, nodes);
        stepsCompleted = step;
        await this.emitStepResult({
          goalId: input.goalId,
          step,
          action: decision.action,
          ok,
          changed: ok,
          note: note ?? decision.reasoning,
        });

        await this.sleep(this.stepDelayMs);
      }
    } finally {
      await this.hub.sendEvent({
        event: 'GOAL_FINISHED',
        goalId: input.goalId,
        status,
        steps: stepsCompleted,
        summary: status === 'SUCCESS' ? 'completed' : status.toLowerCase(),
      });
      this.busy = false;
      this.activeGoalId = null;
      this.pending = null;
    }

    return status;
  }

  private async onHubCommand(
    frame: HubFrame<HubCommandPayload>,
  ): Promise<void> {
    const cmd = frame.payload.command;
    if (cmd === 'CANCEL_GOAL') {
      const goalId = String(frame.payload.goalId ?? '');
      this.requestCancel(goalId || undefined);
      return;
    }
    if (cmd === 'AGENT_ACTION' && this.pending) {
      const goalId = String(frame.payload.goalId ?? '');
      const step = Number(frame.payload.step);
      if (
        goalId === this.pending.goalId &&
        step === this.pending.step
      ) {
        const resolve = this.pending.resolve;
        this.pending = null;
        resolve(frame);
      }
    }
  }

  private waitForAgentAction(
    goalId: string,
    step: number,
  ): Promise<HubFrame<HubCommandPayload> | null> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (this.pending?.goalId === goalId && this.pending.step === step) {
          this.pending = null;
          resolve(null);
        }
      }, this.actionTimeoutMs);

      this.pending = {
        goalId,
        step,
        resolve: frame => {
          clearTimeout(timer);
          resolve(frame);
        },
      };
    });
  }

  private async emitStepResult(payload: {
    goalId: string;
    step: number;
    action: string;
    ok: boolean;
    changed: boolean;
    note?: string;
    screenshotB64?: string;
  }): Promise<void> {
    await this.hub.sendEvent({
      event: 'AGENT_STEP_RESULT',
      ...payload,
    });
  }

  private async dumpNodes(): Promise<Array<Record<string, unknown>>> {
    try {
      return await this.a11y.dumpScreen();
    } catch {
      return [];
    }
  }

  private compactNodes(
    nodes: Array<Record<string, unknown>>,
    goal: string,
  ): string {
    const texts = nodes
      .map(n => String(n.text ?? n.contentDescription ?? '').trim())
      .filter(Boolean)
      .slice(0, 40);
    return `goal=${goal}; visible=[${texts.join(' | ')}]`;
  }

  private async performAction(
    step: TaskStep,
    nodes: Array<Record<string, unknown>>,
  ): Promise<{ ok: boolean; note?: string }> {
    try {
      switch (step.action) {
        case TaskStep.actionClickText: {
          const text = step.stringParam('text') ?? '';
          const hit = nodes.find(n =>
            String(n.text ?? '')
              .toLowerCase()
              .includes(text.toLowerCase()),
          );
          if (!hit) {
            return { ok: false, note: `text not found: ${text}` };
          }
          const x = Number(hit.centerX ?? hit.x ?? 0);
          const y = Number(hit.centerY ?? hit.y ?? 0);
          return { ok: await this.a11y.clickAt(x, y) };
        }
        case TaskStep.actionClickAt: {
          const x = step.intParam('x');
          const y = step.intParam('y');
          if (x == null || y == null) {
            return { ok: false, note: 'missing x/y' };
          }
          return { ok: await this.a11y.clickAt(x, y) };
        }
        case TaskStep.actionTypeText: {
          const text = step.stringParam('text');
          if (text == null) {
            return { ok: false, note: 'missing text' };
          }
          return { ok: await this.a11y.typeText(text) };
        }
        case TaskStep.actionPressEnter:
          return { ok: await this.a11y.pressKey('enter') };
        case TaskStep.actionScroll:
          return {
            ok: await this.a11y.scroll(
              step.stringParam('direction') ?? 'down',
            ),
          };
        case TaskStep.actionSwipe: {
          const startX = step.intParam('startX');
          const startY = step.intParam('startY');
          const endX = step.intParam('endX');
          const endY = step.intParam('endY');
          if ([startX, startY, endX, endY].some(v => v == null)) {
            return { ok: false, note: 'missing swipe coords' };
          }
          return {
            ok: await this.a11y.swipe({
              startX: startX!,
              startY: startY!,
              endX: endX!,
              endY: endY!,
              durationMs: step.intParam('durationMs') ?? 350,
            }),
          };
        }
        case TaskStep.actionPressBack:
          return { ok: await this.a11y.pressKey('back') };
        case TaskStep.actionPressHome:
          return { ok: await this.a11y.pressKey('home') };
        case TaskStep.actionOpenApp:
          return {
            ok: false,
            note: 'open_app not wired on RN bridge yet',
          };
        case TaskStep.actionWait: {
          const ms = Math.min(
            Math.max(step.intParam('ms') ?? 1500, 100),
            10_000,
          );
          await this.sleep(ms);
          return { ok: true };
        }
        default:
          return { ok: false, note: `unsupported ${step.action}` };
      }
    } catch (e) {
      return {
        ok: false,
        note: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

/** Test helper: build a scripted AGENT_ACTION reply frame. */
export function agentActionFrame(
  goalId: string,
  step: number,
  action: Record<string, unknown>,
  reasoning?: string,
): HubFrame<HubCommandPayload> {
  return makeFrame('command', {
    command: 'AGENT_ACTION',
    goalId,
    step,
    action,
    ...(reasoning ? { reasoning } : {}),
  });
}
