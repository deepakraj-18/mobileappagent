import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

type CompanionNative = {
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
};

const native = NativeModules.CompanionRuntime as CompanionNative | undefined;

async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 33) {
    return;
  }
  await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    {
      title: 'Companion notifications',
      message:
        'PrivateAgent shows an ongoing notification while the desk companion runtime is active.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
}

export const CompanionRuntime = {
  async start(): Promise<boolean> {
    await ensureNotificationPermission();
    if (!native) {
      return false;
    }
    return native.start();
  },
  async stop(): Promise<boolean> {
    if (!native) {
      return false;
    }
    return native.stop();
  },
};
