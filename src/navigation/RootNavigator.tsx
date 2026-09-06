import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CompanionMode } from '../constants/appConstants';
import { CompanionModeService } from '../services/CompanionModeService';
import { isOnboardingComplete } from './onboarding';
import type { MainTabParamList, RootStackParamList } from './types';
import { CompanionHealthScreen } from '../screens/CompanionHealthScreen';
import { DockScreen } from '../screens/DockScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { OperatorScreen } from '../screens/OperatorScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs({
  companionDocked,
  onToggleCompanion,
  onOpenHealth,
}: {
  companionDocked: boolean;
  onToggleCompanion: () => void;
  onOpenHealth: () => void;
}): React.JSX.Element {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Operator" component={OperatorScreen} />
      <Tab.Screen name="Settings">
        {() => (
          <SettingsScreen
            companionDocked={companionDocked}
            onToggleCompanion={onToggleCompanion}
            onOpenHealth={onOpenHealth}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [mode, setMode] = useState<CompanionMode>(CompanionMode.OPERATOR);
  const [showHealth, setShowHealth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await isOnboardingComplete();
      const m = await CompanionModeService.hydrate();
      if (!cancelled) {
        setOnboarded(done);
        setMode(m);
        setReady(true);
      }
    })();
    const unsub = CompanionModeService.subscribe(setMode);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const toggleCompanion = useCallback(() => {
    void CompanionModeService.toggle();
  }, []);

  const exitDock = useCallback(() => {
    void CompanionModeService.exitDocked();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const docked = mode === CompanionMode.DOCKED;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!onboarded ? (
          <Stack.Screen name="Onboarding">
            {() => <OnboardingScreen onDone={() => setOnboarded(true)} />}
          </Stack.Screen>
        ) : docked ? (
          <Stack.Screen name="Dock">
            {() => <DockScreen onExit={exitDock} />}
          </Stack.Screen>
        ) : showHealth ? (
          <Stack.Screen name="Health">
            {() => (
              <CompanionHealthScreen onBack={() => setShowHealth(false)} />
            )}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="MainTabs">
            {() => (
              <MainTabs
                companionDocked={docked}
                onToggleCompanion={toggleCompanion}
                onOpenHealth={() => setShowHealth(true)}
              />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
