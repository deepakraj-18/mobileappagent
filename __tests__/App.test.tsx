/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/native/Accessibility', () => ({
  Accessibility: {
    isServiceEnabled: jest.fn(async () => false),
    openAccessibilitySettings: jest.fn(async () => true),
    openAppInfoSettings: jest.fn(async () => true),
    getScreenSize: jest.fn(async () => ({ width: 360, height: 772 })),
  },
  isAccessibilityBridgeLinked: false,
}));

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
    clear: jest.fn(async () => {
      Object.keys(store).forEach(k => delete store[k]);
    }),
  };
});

jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
  Screen: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: function MockBiometrics() {
    return {
      isSensorAvailable: async () => ({ available: false }),
      simplePrompt: async () => ({ success: true }),
    };
  },
  BiometryTypes: {
    TouchID: 'TouchID',
    FaceID: 'FaceID',
    Biometrics: 'Biometrics',
  },
}));

jest.mock('../src/security/AppLockGate', () => ({
  AppLockGate: ({ children }: { children: React.ReactNode }) => children,
}));

test('renders navigation shell', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});
