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

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
