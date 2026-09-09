import { DockCardsController } from '../src/proactivity/DockCardsController';
import { MockHubClient } from '../src/hub/MockHubClient';
import { makeFrame } from '../src/hub/types';
import type { HubCard } from '../src/hub/types';

describe('DockCardsController', () => {
  const card = (id: string, title: string): HubCard => ({
    id,
    kind: 'TASK',
    title,
  });

  it('merges CARD_PUSH by id and replaces when replace=true', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const ctrl = new DockCardsController({ hub, cardLimit: 6 });
    ctrl.start();

    await hub.pushCommand(
      makeFrame('command', {
        command: 'CARD_PUSH',
        cards: [card('c1', 'One'), card('c2', 'Two')],
        replace: true,
      }),
    );
    expect(ctrl.getSnapshot().cards).toHaveLength(2);

    await hub.pushCommand(
      makeFrame('command', {
        command: 'CARD_PUSH',
        cards: [card('c2', 'Two updated'), card('c3', 'Three')],
        replace: false,
      }),
    );
    const titles = ctrl.getSnapshot().cards.map(c => c.title).sort();
    expect(titles).toEqual(['One', 'Three', 'Two updated']);
  });

  it('CARD_CLEAR removes listed or all', async () => {
    const hub = new MockHubClient();
    await hub.connect();
    const ctrl = new DockCardsController({ hub });
    ctrl.start();
    await hub.pushCommand(
      makeFrame('command', {
        command: 'CARD_PUSH',
        cards: [card('a', 'A'), card('b', 'B')],
        replace: true,
      }),
    );
    await hub.pushCommand(
      makeFrame('command', { command: 'CARD_CLEAR', ids: ['a'] }),
    );
    expect(ctrl.getSnapshot().cards.map(c => c.id)).toEqual(['b']);
    await hub.pushCommand(
      makeFrame('command', { command: 'CARD_CLEAR' }),
    );
    expect(ctrl.getSnapshot().cards).toHaveLength(0);
  });

  it('marks stale when offline', () => {
    const hub = new MockHubClient();
    const ctrl = new DockCardsController({ hub });
    ctrl.setOffline(true);
    expect(ctrl.getSnapshot().offline).toBe(true);
    expect(ctrl.getSnapshot().staleSince).toBeTruthy();
    ctrl.setOffline(false);
    expect(ctrl.getSnapshot().staleSince).toBeNull();
  });
});
