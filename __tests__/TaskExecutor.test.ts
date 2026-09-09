import {
  TaskExecutor,
  agentActionFrame,
} from '../src/agent/TaskExecutor';
import { MockHubClient } from '../src/hub/MockHubClient';

describe('TaskExecutor hub think step', () => {
  it('emits AGENT_SCREEN, executes AGENT_ACTION via tryParse, finishes on DONE', async () => {
    let screenCount = 0;
    const hub = new MockHubClient();

    const a11y = {
      dumpScreen: async () => [{ text: 'Home', centerX: 10, centerY: 20 }],
      clickAt: jest.fn(async () => true),
      swipe: async () => true,
      scroll: async () => true,
      typeText: async () => true,
      pressKey: async () => true,
      isServiceEnabled: async () => true,
      openAccessibilitySettings: async () => true,
      openAppInfoSettings: async () => true,
      getScreenSize: async () => ({ width: 360, height: 772 }),
      takeScreenshot: async () => '',
    };

    const executor = new TaskExecutor({
      hub,
      accessibility: a11y as never,
      actionTimeoutMs: 2000,
      stepDelayMs: 0,
      sleep: async () => undefined,
    });
    executor.startListening();

    const origSend = hub.sendEvent.bind(hub);
    hub.sendEvent = async payload => {
      const id = await origSend(payload);
      if (payload.event === 'AGENT_SCREEN') {
        screenCount += 1;
        const step = Number(payload.step);
        if (screenCount === 1) {
          await hub.pushCommand(
            agentActionFrame('g1', step, {
              action: 'click_at',
              params: { x: 10, y: 20 },
            }),
          );
        } else {
          await hub.pushCommand(
            agentActionFrame('g1', step, { action: 'done' }, 'complete'),
          );
        }
      }
      return id;
    };

    await hub.connect();
    const status = await executor.runGoal({
      goalId: 'g1',
      goal: 'tap something',
    });

    expect(status).toBe('SUCCESS');
    expect(a11y.clickAt).toHaveBeenCalledWith(10, 20);

    const events = hub.sent
      .filter(f => f.type === 'event')
      .map(f => (f.payload as { event: string }).event);
    expect(events).toContain('AGENT_SCREEN');
    expect(events).toContain('AGENT_STEP_RESULT');
    expect(events).toContain('GOAL_FINISHED');
  });

  it('times out think step when hub never replies AGENT_ACTION', async () => {
    const hub = new MockHubClient();
    const executor = new TaskExecutor({
      hub,
      accessibility: {
        dumpScreen: async () => [],
      } as never,
      actionTimeoutMs: 50,
      stepDelayMs: 0,
      sleep: async () => undefined,
    });
    executor.startListening();
    await hub.connect();

    const status = await executor.runGoal({
      goalId: 'g2',
      goal: 'noop',
    });
    expect(status).toBe('FAILED');
    expect(
      hub.sent.some(
        f =>
          f.type === 'event' &&
          (f.payload as { event: string }).event === 'GOAL_FINISHED',
      ),
    ).toBe(true);
  });
});
