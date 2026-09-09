import type { HubClient } from '../hub/HubClient';
import { GoalCommandRouter } from './GoalCommandRouter';
import { localFallbackLlm } from './LocalFallbackLlm';
import { TaskExecutor } from './TaskExecutor';

/**
 * Wires TaskExecutor + GoalCommandRouter to the live hub client with local LLM fallback.
 */
class AgentRuntimeImpl {
  private executor: TaskExecutor | null = null;
  private router: GoalCommandRouter | null = null;
  private stop: (() => void) | null = null;
  private hub: HubClient | null = null;

  /** Attach (or re-attach) to a hub client. Safe to call repeatedly. */
  attach(hub: HubClient): void {
    if (this.hub === hub && this.router) {
      return;
    }
    this.detach();
    this.hub = hub;
    this.executor = new TaskExecutor({
      hub,
      localLlm: localFallbackLlm,
    });
    this.router = new GoalCommandRouter({ hub, executor: this.executor });
    this.stop = this.router.start();
  }

  detach(): void {
    this.stop?.();
    this.stop = null;
    this.router = null;
    this.executor = null;
    this.hub = null;
  }

  getExecutor(): TaskExecutor | null {
    return this.executor;
  }
}

export const AgentRuntime = new AgentRuntimeImpl();
