import type { HubClient } from '../hub/HubClient';
import type { HubCommandPayload, HubFrame } from '../hub/types';
import { Accessibility } from '../native/Accessibility';
import type { GoalConstraints, TaskExecutor } from './TaskExecutor';

export type GoalRejectReason =
  | 'ACCESSIBILITY_OFF'
  | 'BUSY'
  | 'UNSUPPORTED';

export type GoalCommandRouterDeps = {
  hub: HubClient;
  executor: TaskExecutor;
  accessibility?: typeof Accessibility;
  /** Optional allow-list of goal origins; empty = all allowed. */
  supportedOrigins?: string[];
};

/**
 * Routes inbound RUN_GOAL / CANCEL_GOAL commands (hub-contract §8.2).
 */
export class GoalCommandRouter {
  private readonly hub: HubClient;
  private readonly executor: TaskExecutor;
  private readonly a11y: typeof Accessibility;
  private readonly supportedOrigins: Set<string> | null;
  private unsub: (() => void) | null = null;

  constructor(deps: GoalCommandRouterDeps) {
    this.hub = deps.hub;
    this.executor = deps.executor;
    this.a11y = deps.accessibility ?? Accessibility;
    this.supportedOrigins = deps.supportedOrigins?.length
      ? new Set(deps.supportedOrigins.map(o => o.toUpperCase()))
      : null;
  }

  start(): () => void {
    this.unsub?.();
    const stopExec = this.executor.startListening();
    this.unsub = this.hub.onCommand(frame => {
      void this.handle(frame);
    });
    return () => {
      this.unsub?.();
      this.unsub = null;
      stopExec();
    };
  }

  async handle(frame: HubFrame<HubCommandPayload>): Promise<void> {
    const cmd = frame.payload.command;
    if (cmd === 'CANCEL_GOAL') {
      const goalId = String(frame.payload.goalId ?? '');
      this.executor.requestCancel(goalId || undefined);
      return;
    }
    if (cmd !== 'RUN_GOAL') {
      return;
    }

    const goalId = String(frame.payload.goalId ?? '');
    const goal = String(frame.payload.goal ?? '').trim();
    const origin = String(frame.payload.origin ?? 'MANUAL').toUpperCase();
    const constraints = frame.payload.constraints as GoalConstraints | undefined;

    if (!goalId || !goal) {
      await this.reject(goalId || 'unknown', 'UNSUPPORTED');
      return;
    }

    if (
      this.supportedOrigins &&
      !this.supportedOrigins.has(origin)
    ) {
      await this.reject(goalId, 'UNSUPPORTED');
      return;
    }

    if (this.executor.isBusy()) {
      await this.reject(goalId, 'BUSY');
      return;
    }

    let a11yOn = false;
    try {
      a11yOn = await this.a11y.isServiceEnabled();
    } catch {
      a11yOn = false;
    }
    if (!a11yOn) {
      await this.reject(goalId, 'ACCESSIBILITY_OFF');
      return;
    }

    // Fire-and-forget the loop so the command handler returns; results via events.
    void this.executor.runGoal({
      goalId,
      goal,
      constraints,
      origin,
    });
  }

  private async reject(
    goalId: string,
    reason: GoalRejectReason,
  ): Promise<void> {
    await this.hub.sendEvent({
      event: 'GOAL_REJECTED',
      goalId,
      reason,
    });
  }
}
