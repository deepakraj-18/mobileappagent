import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DockCardList } from '../src/screens/dock/DockCardList';
import { DockScreen } from '../src/screens/DockScreen';
import { PresenceState } from '../src/constants/appConstants';

describe('DockCardList', () => {
  it('renders cards and stale marker', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <DockCardList
          cards={[
            {
              id: 'c1',
              kind: 'REMINDER',
              title: 'Call bank',
              subtitle: '4pm',
            },
          ]}
          offline
          staleSince="2026-09-09T10:00:00Z"
        />,
      );
    });
    expect(tree.root.findByProps({ testID: 'dock-card-c1' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'dock-cards-stale' })).toBeTruthy();
  });
});

describe('DockScreen Phase 5 UI', () => {
  it('shows presence chip and announcement status', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <DockScreen
          onExit={() => undefined}
          presenceState={PresenceState.HOME}
          announcementStatus="Speaking announcement…"
          cards={[{ id: 'x', kind: 'INFO', title: 'Hi' }]}
        />,
      );
    });
    expect(tree.root.findByProps({ testID: 'dock-announcement-status' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'dock-card-x' })).toBeTruthy();
  });
});
