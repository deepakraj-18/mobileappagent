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

if (!AccessibilityBridge) {
  throw new Error(
    'AccessibilityBridge native module is not linked. Rebuild the Android app.',
  );
}

export const Accessibility: AccessibilityNative = AccessibilityBridge;
