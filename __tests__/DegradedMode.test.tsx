import { HubConnectionState } from '../src/constants/appConstants';
import { DegradedMode } from '../src/agent/DegradedMode';
import { LocalFallbackStore } from '../src/agent/LocalFallbackStore';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DockScreen } from '../src/screens/DockScreen';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

describe('DegradedMode + Dock banner', () => {
  it('activates when hub unreachable and provider configured', async () => {
    await LocalFallbackStore.setMeta({
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'llama',
      enabled: true,
    });
    DegradedMode.setHubConnectionState(HubConnectionState.DISCONNECTED);
    const snap = await DegradedMode.getSnapshot();
    expect(snap.active).toBe(true);
  });

  it('renders dock degraded banner when degradedActive', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <DockScreen
          onExit={() => undefined}
          degradedActive
          connectionState={HubConnectionState.DISCONNECTED}
        />,
      );
    });
    expect(tree.root.findByProps({ testID: 'dock-degraded-banner' })).toBeTruthy();
  });
});
