import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
  };
});

jest.mock('../src/hub/HubRuntime', () => {
  const mockListeners = new Set();
  const mockSnap = {
    connectionState: 'UNPAIRED',
    lastSyncAt: null,
    lastError: null,
    deviceId: null,
    baseUrl: '',
  };
  return {
    HubRuntime: {
      getSnapshot: () => mockSnap,
      hydrate: jest.fn(async () => mockSnap),
      subscribe: (listener: Function) => {
        mockListeners.add(listener);
        listener(mockSnap);
        return () => mockListeners.delete(listener);
      },
      setBaseUrl: jest.fn(),
      pair: jest.fn(),
      retry: jest.fn(),
      signOut: jest.fn(),
    },
  };
});

import { HubConnectionScreen } from '../src/screens/HubConnectionScreen';

describe('HubConnectionScreen', () => {
  it('renders pair form when unpaired', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <HubConnectionScreen onBack={() => undefined} />,
      );
    });
    const root = tree.root;
    expect(root.findByProps({ testID: 'hub-connection-screen' })).toBeTruthy();
    expect(root.findByProps({ testID: 'hub-pairing-code' })).toBeTruthy();
    expect(root.findByProps({ testID: 'hub-pair-btn' })).toBeTruthy();
  });
});
