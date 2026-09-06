import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  HubConnectionState,
  PresenceState,
  WakeState,
} from '../src/constants/appConstants';
import {
  DockScreen,
  dockStatusLabel,
  formatDockClock,
} from '../src/screens/DockScreen';

describe('dockStatusLabel', () => {
  it('maps wake states to labels', () => {
    expect(dockStatusLabel(WakeState.SPEAKING)).toBe('Speaking…');
    expect(dockStatusLabel(WakeState.LISTENING_FOR_WAKE)).toBe(
      'Listening for wake',
    );
  });
});

describe('DockScreen', () => {
  it('renders clock, chips, tap-to-talk, and speaking status', async () => {
    const onExit = jest.fn();
    const onTap = jest.fn();
    const fixed = new Date(2026, 8, 6, 14, 5, 0);
    expect(formatDockClock(fixed)).toBe('14:05');

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <DockScreen
          onExit={onExit}
          onTapToTalk={onTap}
          wakeState={WakeState.SPEAKING}
          connectionState={HubConnectionState.UNPAIRED}
          presenceState={PresenceState.UNKNOWN}
          now={fixed}
        />,
      );
    });

    const root = tree.root;
    expect(root.findByProps({ testID: 'dock-clock' }).props.children).toBe(
      '14:05',
    );
    expect(root.findByProps({ testID: 'dock-status' }).props.children).toBe(
      'Speaking…',
    );
    expect(root.findByProps({ testID: 'dock-connection-chip' })).toBeTruthy();
    expect(root.findByProps({ testID: 'dock-presence-chip' })).toBeTruthy();
    expect(root.findByProps({ testID: 'dock-orb' })).toBeTruthy();

    await ReactTestRenderer.act(() => {
      root.findByProps({ testID: 'dock-tap-to-talk' }).props.onPress();
      root.findByProps({ testID: 'dock-exit' }).props.onPress();
    });
    expect(onTap).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
