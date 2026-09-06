import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { isOnboardingComplete } from './onboarding';
import type { MainTabParamList, RootStackParamList } from './types';
import { DockScreen } from '../screens/DockScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { OperatorScreen } from '../screens/OperatorScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs({
  companionDocked,
  onToggleCompanion,
}: {
  companionDocked: boolean;
  onToggleCompanion: () => void;
}): React.JSX.Element {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Operator" component={OperatorScreen} />
      <Tab.Screen name="Settings">
        {() => (
          <SettingsScreen
            companionDocked={companionDocked}
            onToggleCompanion={onToggleCompanion}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await isOnboardingComplete();
      if (!cancelled) {
        setOnboarded(done);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enterDock = useCallback(() => setDocked(true), []);
  const exitDock = useCallback(() => setDocked(false), []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

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
        ) : (
          <Stack.Screen name="MainTabs">
            {() => (
              <MainTabs companionDocked={docked} onToggleCompanion={enterDock} />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
