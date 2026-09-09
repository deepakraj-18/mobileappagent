import { PermissionsAndroid, Platform } from 'react-native';

/** Mic for wake-word / tap-to-talk (BD003). */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone',
      message: 'PrivateAgent needs the mic for wake word and tap-to-talk.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Location is required for BLE scanning on API ≤30 (desk companion is API 28 / Y17).
 * On API 31+ prefer BLUETOOTH_SCAN when available.
 */
export async function requestBleScanPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const api = typeof Platform.Version === 'number' ? Platform.Version : 0;
  if (api >= 31) {
    const scan = (PermissionsAndroid.PERMISSIONS as Record<string, string>)
      .BLUETOOTH_SCAN;
    const connect = (PermissionsAndroid.PERMISSIONS as Record<string, string>)
      .BLUETOOTH_CONNECT;
    if (scan) {
      const results = await PermissionsAndroid.requestMultiple(
        [scan, connect].filter(Boolean) as Array<
          (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]
        >,
      );
      return Object.values(results).every(
        r => r === PermissionsAndroid.RESULTS.GRANTED,
      );
    }
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Nearby devices (BLE)',
      message:
        'Location access is required on this Android version to scan for your presence anchor (watch / band).',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
