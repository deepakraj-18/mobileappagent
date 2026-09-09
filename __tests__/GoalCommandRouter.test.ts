import { GoalCommandRouter } from '../src/agent/GoalCommandRouter';
import { TaskExecutor } from '../src/agent/TaskExecutor';
import { MockHubClient } from '../src/hub/MockHubClient';
import type { HubCommandPayload, HubFrame } from '../src/hub/types';
import { makeFrame } from '../src/hub/types';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => resolve(), ms);
  });
}

function runGoalCmd(
  goalId: string,
  goal: string,
  origin: 'VOICE' | 'SCHEDULE' | 'MANUAL' = 'VOICE',
): HubFrame<HubCommandPayload> {
  return makeFrame('command', {
    command: 'RUN_GOAL',
    goalId,
    goal,
    origin,
  });
}

describe('GoalCommandRouter', () => {
  it('rejects when accessibility is off', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const executor = new TaskExecutor({
      hub,
      actionTimeoutMs: 100,
      stepDelayMs: 0,
      sleep: async () => undefined,
    });
    const router = new GoalCommandRouter({
      hub,
      executor,
      accessibility: {
        isServiceEnabled: async () => false,
      } as never,
    });
    router.start();

    await hub.pushCommand(runGoalCmd('g1', 'open settings'));
    await delay(20);

    const rejected = hub.sent.find(
      f =>
        f.type === 'event' &&
        (f.payload as { event: string }).event === 'GOAL_REJECTED',
    );
    expect(rejected).toBeTruthy();
    expect((rejected!.payload as { reason: string }).reason).toBe(
      'ACCESSIBILITY_OFF',
    );
  });

  it('rejects when busy', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const executor = new TaskExecutor({
      hub,
      accessibility: {
        isServiceEnabled: async () => true,
        dumpScreen: async () => [],
      } as never,
      actionTimeoutMs: 500,
      stepDelayMs: 0,
      sleep: async () => undefined,
    });
    const router = new GoalCommandRouter({
      hub,
      executor,
      accessibility: {
        isServiceEnabled: async () => true,
      } as never,
    });
    router.start();

    void executor.runGoal({ goalId: 'g-busy', goal: 'first' });
    await delay(10);

    await hub.pushCommand(runGoalCmd('g2', 'second'));
    await delay(20);

    const rejected = hub.sent.find(
      f =>
        f.type === 'event' &&
        (f.payload as { event?: string; goalId?: string }).event ===
          'GOAL_REJECTED' &&
        (f.payload as { goalId?: string }).goalId === 'g2',
    );
    expect((rejected?.payload as { reason: string }).reason).toBe('BUSY');
    executor.requestCancel('g-busy');
  });

  it('starts executor on RUN_GOAL and CANCEL_GOAL finishes CANCELLED', async () => {
    const hub = new MockHubClient();
    await hub.connect();

    const a11y = {
      isServiceEnabled: async () => true,
      dumpScreen: async () => [{ text: 'A', centerX: 1, centerY: 1 }],
      clickAt: async () => true,
      swipe: async () => true,
      scroll: async () => true,
      typeText: async () => true,
      pressKey: async () => true,
      openAccessibilitySettings: async () => true,
      openAppInfoSettings: async () => true,
      getScreenSize: async () => ({ width: 1, height: 1 }),
      takeScreenshot: async () => '',
    };

    const executor = new TaskExecutor({
      hub,
      accessibility: a11y as never,
      actionTimeoutMs: 2000,
      stepDelayMs: 0,
      sleep: async () => undefined,
    });
    const router = new GoalCommandRouter({
      hub,
      executor,
      accessibility: a11y as never,
    });
    router.start();

    const origSend = hub.sendEvent.bind(hub);
    hub.sendEvent = async payload => {
      const id = await origSend(payload);
      if (payload.event === 'AGENT_SCREEN') {
        await hub.pushCommand(
          makeFrame('command', {
            command: 'CANCEL_GOAL',
            goalId: 'g3',
          }),
        );
      }
      return id;
    };

    await hub.pushCommand(runGoalCmd('g3', 'do a thing'));
    await delay(80);

    const finished = hub.sent.find(
      f =>
        f.type === 'event' &&
        (f.payload as { event: string }).event === 'GOAL_FINISHED',
    );
    expect((finished?.payload as { status: string }).status).toBe('CANCELLED');
  });

  it('rejects empty goal as UNSUPPORTED', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const executor = new TaskExecutor({ hub });
    const router = new GoalCommandRouter({
      hub,
      executor,
      accessibility: { isServiceEnabled: async () => true } as never,
    });
    router.start();
    await hub.pushCommand(
      makeFrame('command', {
        command: 'RUN_GOAL',
        goalId: 'g4',
        goal: '   ',
      }),
    );
    await delay(20);
    const rejected = hub.sent.find(
      f =>
        f.type === 'event' &&
        (f.payload as { event: string }).event === 'GOAL_REJECTED',
    );
    expect((rejected?.payload as { reason: string }).reason).toBe(
      'UNSUPPORTED',
    );
  });
});
