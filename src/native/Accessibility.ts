import { NativeModules } from 'react-native';

type ScreenSize = { width: number; height: number };

type AccessibilityNative = {
  isServiceEnabled(): Promise<boolean>;
  openAccessibilitySettings(): Promise<boolean>;
  openAppInfoSettings(): Promise<boolean>;
  getScreenSize(): Promise<ScreenSize>;
  dumpScreen(): Promise<Array<Record<string, unknown>>>;
  takeScreenshot(): Promise<string>;
  clickAt(x: number, y: number): Promise<boolean>;
  swipe(params: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    durationMs?: number;
  }): Promise<boolean>;
  scroll(direction: string): Promise<boolean>;
  typeText(text: string): Promise<boolean>;
  pressKey(key: string): Promise<boolean>;
};

const { AccessibilityBridge } = NativeModules;

function unavailable(method: string): never {
  throw new Error(
    `AccessibilityBridge.${method} unavailable — native module not linked. Rebuild the Android app.`,
  );
}

const stub: AccessibilityNative = {
  isServiceEnabled: () => unavailable('isServiceEnabled'),
  openAccessibilitySettings: () => unavailable('openAccessibilitySettings'),
  openAppInfoSettings: () => unavailable('openAppInfoSettings'),
  getScreenSize: () => unavailable('getScreenSize'),
  dumpScreen: () => unavailable('dumpScreen'),
  takeScreenshot: () => unavailable('takeScreenshot'),
  clickAt: () => unavailable('clickAt'),
  swipe: () => unavailable('swipe'),
  scroll: () => unavailable('scroll'),
  typeText: () => unavailable('typeText'),
  pressKey: () => unavailable('pressKey'),
};

/** Linked native bridge, or a stub that fails only when invoked (Jest-safe import). */
export const Accessibility: AccessibilityNative =
  (AccessibilityBridge as AccessibilityNative | undefined) ?? stub;

export const isAccessibilityBridgeLinked = Boolean(AccessibilityBridge);
