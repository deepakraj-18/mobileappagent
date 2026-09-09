import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ONBOARDING_STEPS, OnboardingStepId } from '../src/onboarding/steps';

const asyncStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => asyncStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    asyncStore[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete asyncStore[k];
  }),
}));

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' },
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
}));

jest.mock('../src/native/Accessibility', () => ({
  Accessibility: {
    isServiceEnabled: jest.fn(async () => false),
    openAccessibilitySettings: jest.fn(async () => true),
    openAppInfoSettings: jest.fn(async () => true),
  },
}));

jest.mock('../src/proactivity/notificationForwarder', () => ({
  NotificationForwarder: {
    isAccessEnabled: jest.fn(async () => false),
    openAccessSettings: jest.fn(async () => true),
    setOptedIn: jest.fn(async () => undefined),
    isOptedIn: jest.fn(async () => false),
  },
}));

jest.mock('../src/hub/HubRuntime', () => ({
  HubRuntime: {
    getSnapshot: () => ({
      connectionState: 'UNPAIRED',
      lastSyncAt: null,
      lastError: null,
      deviceId: null,
      baseUrl: 'https://hub.example',
    }),
    hydrate: jest.fn(async () => ({
      connectionState: 'UNPAIRED',
      lastSyncAt: null,
      lastError: null,
      deviceId: null,
      baseUrl: 'https://hub.example',
    })),
    subscribe: (fn: (s: unknown) => void) => {
      fn({
        connectionState: 'UNPAIRED',
        lastSyncAt: null,
        lastError: null,
        deviceId: null,
        baseUrl: 'https://hub.example',
      });
      return () => undefined;
    },
    setBaseUrl: jest.fn(async () => undefined),
    pair: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/hub/CompanionSettings', () => ({
  CompanionSettings: {
    apply: jest.fn(async () => ({})),
    hydrate: jest.fn(async () => ({})),
    get: () => ({}),
  },
}));

jest.mock('../src/onboarding/permissions', () => ({
  requestMicrophonePermission: jest.fn(async () => true),
  requestBleScanPermission: jest.fn(async () => true),
}));

import { CompanionSettings } from '../src/hub/CompanionSettings';
import { OnboardingScreen } from '../src/screens/OnboardingScreen';
import {
  isOnboardingComplete,
  resetOnboardingFlag,
} from '../src/navigation/onboarding';

async function advance(tree: ReactTestRenderer.ReactTestRenderer): Promise<void> {
  const next = tree.root.findByProps({ testID: 'onb-next' });
  await ReactTestRenderer.act(async () => {
    next.props.onPress();
  });
}

describe('FD060 OnboardingScreen', () => {
  beforeEach(async () => {
    for (const k of Object.keys(asyncStore)) {
      delete asyncStore[k];
    }
    await resetOnboardingFlag();
    jest.clearAllMocks();
  });

  it('exposes the full FD060 step list', () => {
    expect(ONBOARDING_STEPS).toEqual([
      OnboardingStepId.WELCOME,
      OnboardingStepId.ACCESSIBILITY,
      OnboardingStepId.NOTIFICATIONS,
      OnboardingStepId.VIVO_WHITELIST,
      OnboardingStepId.PAIR,
      OnboardingStepId.PREFS,
      OnboardingStepId.PERMISSIONS,
      OnboardingStepId.DONE,
    ]);
  });

  it('renders welcome and walks through gates', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <OnboardingScreen onDone={() => undefined} />,
      );
    });
    expect(tree.root.findByProps({ testID: 'onboarding-screen' })).toBeTruthy();
    expect(
      tree.root.findByProps({ testID: 'onboarding-progress' }).props.children,
    ).toBe('1 / 8');

    await advance(tree);
    expect(tree.root.findByProps({ testID: 'onb-a11y-open' })).toBeTruthy();

    await advance(tree);
    expect(tree.root.findByProps({ testID: 'onb-notif-open' })).toBeTruthy();

    await advance(tree);
    expect(tree.root.findByProps({ testID: 'onb-vivo-appinfo' })).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'onb-vivo-ack' }).props.onValueChange(true);
    });
    await advance(tree);

    expect(tree.root.findByProps({ testID: 'onb-hub-pair' })).toBeTruthy();
    await advance(tree);

    expect(tree.root.findByProps({ testID: 'onb-wake-phrase' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'onb-anchor-amazfit' })).toBeTruthy();
    await advance(tree);

    expect(tree.root.findByProps({ testID: 'onb-mic-request' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'onb-ble-request' })).toBeTruthy();
    await advance(tree);

    expect(tree.root.findByProps({ testID: 'onb-finish' })).toBeTruthy();
  });

  it('finish persists prefs and sets onboarding complete', async () => {
    const onDone = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<OnboardingScreen onDone={onDone} />);
    });

    await advance(tree);
    await advance(tree);
    await advance(tree);
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'onb-vivo-ack' }).props.onValueChange(true);
    });
    await advance(tree);
    await advance(tree);
    await advance(tree);
    await advance(tree);

    await ReactTestRenderer.act(async () => {
      await tree.root.findByProps({ testID: 'onb-finish' }).props.onPress();
    });

    expect(CompanionSettings.apply).toHaveBeenCalled();
    expect(await isOnboardingComplete()).toBe(true);
    expect(onDone).toHaveBeenCalled();
  });
});
