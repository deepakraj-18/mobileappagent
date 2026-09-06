import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pa.hub.baseUrl';

/** Default empty — operator must set LifeOSAPI origin once hub layer exists. */
export const HubConfig = {
  async getBaseUrl(): Promise<string> {
    const raw = await AsyncStorage.getItem(KEY);
    return (raw ?? '').replace(/\/$/, '');
  },
  async setBaseUrl(url: string): Promise<void> {
    await AsyncStorage.setItem(KEY, url.replace(/\/$/, ''));
  },
};
