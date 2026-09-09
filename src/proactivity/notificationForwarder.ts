import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, NativeModules } from 'react-native';
import type { HubClient } from '../hub/HubClient';
import { CompanionSettings } from '../hub/CompanionSettings';

const OPT_IN_KEY = 'pa.notifications.forwardOptIn';

export type NotificationPosted = {
  packageName: string;
  title: string;
  text: string;
  postedAt: number;
  key: string;
};

type NativeForwarder = {
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<boolean>;
};

const native = NativeModules.NotificationForwarder as NativeForwarder | undefined;

/**
 * Opt-in notification → hub forwarder (BD052). Default off.
 */
export const NotificationForwarder = {
  async isOptedIn(): Promise<boolean> {
    const fromSettings = CompanionSettings.get().notificationForwarding?.enabled;
    if (fromSettings === true) {
      return true;
    }
    const raw = await AsyncStorage.getItem(OPT_IN_KEY);
    return raw === '1';
  },

  async setOptedIn(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(OPT_IN_KEY, enabled ? '1' : '0');
    await CompanionSettings.apply({
      notificationForwarding: {
        enabled,
        packages: CompanionSettings.get().notificationForwarding?.packages ?? [],
      },
    });
  },

  async isAccessEnabled(): Promise<boolean> {
    if (!native) {
      return false;
    }
    return native.isNotificationAccessEnabled();
  },

  async openAccessSettings(): Promise<boolean> {
    if (!native) {
      return false;
    }
    return native.openNotificationAccessSettings();
  },

  /**
   * Subscribe to native posts; only forwards to hub when opted in + package allow-list empty or match.
   */
  start(hub: HubClient): () => void {
    const sub = DeviceEventEmitter.addListener(
      'NotificationPosted',
      (payload: NotificationPosted) => {
        void this.handlePosted(hub, payload);
      },
    );
    return () => sub.remove();
  },

  async handlePosted(
    hub: HubClient,
    payload: NotificationPosted,
  ): Promise<boolean> {
    if (!(await this.isOptedIn())) {
      return false;
    }
    const packages =
      CompanionSettings.get().notificationForwarding?.packages ?? [];
    if (
      packages.length > 0 &&
      !packages.includes(payload.packageName)
    ) {
      return false;
    }
    // Never forward our own FGS notification content
    if (payload.packageName === 'com.privateagent') {
      return false;
    }
    await hub.sendEvent({
      event: 'NOTIFICATION_FORWARDED',
      packageName: payload.packageName,
      title: payload.title,
      text: payload.text,
      postedAt: new Date(payload.postedAt).toISOString(),
      key: payload.key,
    });
    return true;
  },
};
