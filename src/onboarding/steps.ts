export const OnboardingStepId = {
  WELCOME: 'welcome',
  ACCESSIBILITY: 'accessibility',
  NOTIFICATIONS: 'notifications',
  VIVO_WHITELIST: 'vivo_whitelist',
  PAIR: 'pair',
  PREFS: 'prefs',
  PERMISSIONS: 'permissions',
  DONE: 'done',
} as const;

export type OnboardingStepId =
  (typeof OnboardingStepId)[keyof typeof OnboardingStepId];

export const ONBOARDING_STEPS: OnboardingStepId[] = [
  OnboardingStepId.WELCOME,
  OnboardingStepId.ACCESSIBILITY,
  OnboardingStepId.NOTIFICATIONS,
  OnboardingStepId.VIVO_WHITELIST,
  OnboardingStepId.PAIR,
  OnboardingStepId.PREFS,
  OnboardingStepId.PERMISSIONS,
  OnboardingStepId.DONE,
];

export const PRESENCE_ANCHORS = [
  { id: 'amazfit', label: 'Amazfit (BLE)' },
  { id: 'manual', label: 'Manual only' },
  { id: 'none', label: 'None yet' },
] as const;

export const VIVO_CHECKLIST = [
  'iManager / Apps → Autostart → enable PrivateAgent',
  'Battery → High background power → Allow PrivateAgent',
  'Disable battery saver / ultra power saving for this phone',
  'Recents → Lock / pin PrivateAgent',
  'Prefer leaving the phone plugged in on the dock',
] as const;
