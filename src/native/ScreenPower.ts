import { NativeModules } from 'react-native';

type ScreenPowerNative = {
  sleep(): Promise<string>;
  wake(): Promise<boolean>;
  clearKeepAwake(): Promise<boolean>;
};

const native = NativeModules.ScreenPower as ScreenPowerNative | undefined;

export type ScreenPowerApi = {
  sleep(): Promise<string | false>;
  wake(): Promise<boolean>;
  clearKeepAwake(): Promise<boolean>;
};

export const ScreenPower: ScreenPowerApi = {
  async sleep(): Promise<string | false> {
    if (!native) {
      return false;
    }
    return native.sleep();
  },
  async wake(): Promise<boolean> {
    if (!native) {
      return false;
    }
    return native.wake();
  },
  async clearKeepAwake(): Promise<boolean> {
    if (!native) {
      return false;
    }
    return native.clearKeepAwake();
  },
};
