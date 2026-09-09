import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' },
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
}));

jest.mock('../src/native/Accessibility', () => ({
  Accessibility: {
    openAppInfoSettings: jest.fn(async () => true),
  },
}));

import { FallbackProviderScreen } from '../src/screens/FallbackProviderScreen';
import { CompanionPrefsScreen } from '../src/screens/CompanionPrefsScreen';

describe('FD041 settings screens', () => {
  it('renders fallback provider form', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <FallbackProviderScreen onBack={() => undefined} />,
      );
    });
    expect(tree.root.findByProps({ testID: 'fallback-provider-screen' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'fallback-test' })).toBeTruthy();
  });

  it('renders companion prefs form', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <CompanionPrefsScreen onBack={() => undefined} />,
      );
    });
    expect(tree.root.findByProps({ testID: 'companion-prefs-screen' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'prefs-vivo-checklist' })).toBeTruthy();
  });
});
