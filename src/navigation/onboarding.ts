import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'pa.onboarding.completed';

export async function isOnboardingComplete(): Promise<boolean> {
  const v = await AsyncStorage.getItem(ONBOARDING_KEY);
  return v === '1';
}

export async function setOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, '1');
}

/** Test helper */
export async function resetOnboardingFlag(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}
