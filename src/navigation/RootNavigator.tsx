import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  CompanionMode,
  HubConnectionState,
  PresenceState,
  WakeState,
  type HubConnectionState as HubConnectionStateType,
  type PresenceState as PresenceStateType,
  type WakeState as WakeStateType,
} from '../constants/appConstants';
import { CompanionModeService } from '../services/CompanionModeService';
import { isOnboardingComplete } from './onboarding';
import type { MainTabParamList, RootStackParamList } from './types';
import { CompanionHealthScreen } from '../screens/CompanionHealthScreen';
import { CompanionPrefsScreen } from '../screens/CompanionPrefsScreen';
import { DockScreen } from '../screens/DockScreen';
import { FallbackProviderScreen } from '../screens/FallbackProviderScreen';
import { HubConnectionScreen } from '../screens/HubConnectionScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { OperatorScreen } from '../screens/OperatorScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HubRuntime } from '../hub/HubRuntime';
import type { HubCard } from '../hub/types';
import { DegradedMode } from '../agent/DegradedMode';
import { ProactivityRuntime } from '../proactivity/ProactivityRuntime';
import {
  startDockVoiceRuntime,
  type DockVoiceRuntime,
} from '../voice/DockVoiceRuntime';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs({
  companionDocked,
  onToggleCompanion,
  onOpenHealth,
  onOpenHub,
  onOpenFallback,
  onOpenPrefs,
}: {
  companionDocked: boolean;
  onToggleCompanion: () => void;
  onOpenHealth: () => void;
  onOpenHub: () => void;
  onOpenFallback: () => void;
  onOpenPrefs: () => void;
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
            onOpenHub={onOpenHub}
            onOpenFallback={onOpenFallback}
            onOpenPrefs={onOpenPrefs}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

function DockRoute({ onExit }: { onExit: () => void }): React.JSX.Element {
  const [wakeState, setWakeState] = useState<WakeStateType>(
    WakeState.LISTENING_FOR_WAKE,
  );
  const [connectionState, setConnectionState] =
    useState<HubConnectionStateType>(HubConnectionState.UNPAIRED);
  const [degradedActive, setDegradedActive] = useState(false);
  const [presenceState, setPresenceState] = useState<PresenceStateType>(
    PresenceState.UNKNOWN,
  );
  const [cards, setCards] = useState<HubCard[]>([]);
  const [cardsOffline, setCardsOffline] = useState(false);
  const [cardsStaleSince, setCardsStaleSince] = useState<string | null>(null);
  const [announcementStatus, setAnnouncementStatus] = useState<string | null>(
    null,
  );
  const runtimeRef = React.useRef<DockVoiceRuntime | null>(null);

  useEffect(() => {
    const runtime = startDockVoiceRuntime();
    runtimeRef.current = runtime;
    const unsubWake = runtime.subscribe(setWakeState);
    const unsubHub = HubRuntime.subscribe(snap => {
      setConnectionState(snap.connectionState);
    });
    const unsubDeg = DegradedMode.subscribe(snap => {
      setDegradedActive(snap.active);
    });

    const unsubs: Array<() => void> = [];
    const clearProactivity = () => {
      for (const u of unsubs.splice(0)) {
        u();
      }
    };
    const bindProactivity = () => {
      clearProactivity();
      const presence = ProactivityRuntime.getPresence();
      if (presence) {
        unsubs.push(presence.subscribe(setPresenceState));
      } else {
        setPresenceState(PresenceState.UNKNOWN);
      }
      const dockCards = ProactivityRuntime.getCards();
      if (dockCards) {
        unsubs.push(
          dockCards.subscribe(snap => {
            setCards(snap.cards);
            setCardsOffline(snap.offline);
            setCardsStaleSince(snap.staleSince);
          }),
        );
      } else {
        setCards([]);
        setCardsOffline(false);
        setCardsStaleSince(null);
      }
    };
    const unsubReady = ProactivityRuntime.onReady(bindProactivity);
    const unsubAnnounce = ProactivityRuntime.onAnnouncementStatus(
      setAnnouncementStatus,
    );

    return () => {
      unsubWake();
      unsubHub();
      unsubDeg();
      unsubReady();
      unsubAnnounce();
      clearProactivity();
      runtime.stop();
      runtimeRef.current = null;
    };
  }, []);

  const onTapToTalk = useCallback(() => {
    runtimeRef.current?.tapToTalk();
  }, []);

  return (
    <DockScreen
      onExit={onExit}
      wakeState={wakeState}
      onTapToTalk={onTapToTalk}
      connectionState={connectionState}
      presenceState={presenceState}
      degradedActive={degradedActive}
      cards={cards}
      cardsOffline={cardsOffline}
      cardsStaleSince={cardsStaleSince}
      announcementStatus={announcementStatus}
    />
  );
}

export function RootNavigator(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [mode, setMode] = useState<CompanionMode>(CompanionMode.OPERATOR);
  const [showHealth, setShowHealth] = useState(false);
  const [showHub, setShowHub] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await isOnboardingComplete();
      const m = await CompanionModeService.hydrate();
      await HubRuntime.start();
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
            {() => <DockRoute onExit={exitDock} />}
          </Stack.Screen>
        ) : showHealth ? (
          <Stack.Screen name="Health">
            {() => (
              <CompanionHealthScreen onBack={() => setShowHealth(false)} />
            )}
          </Stack.Screen>
        ) : showHub ? (
          <Stack.Screen name="HubConnection">
            {() => <HubConnectionScreen onBack={() => setShowHub(false)} />}
          </Stack.Screen>
        ) : showFallback ? (
          <Stack.Screen name="FallbackProvider">
            {() => (
              <FallbackProviderScreen onBack={() => setShowFallback(false)} />
            )}
          </Stack.Screen>
        ) : showPrefs ? (
          <Stack.Screen name="CompanionPrefs">
            {() => <CompanionPrefsScreen onBack={() => setShowPrefs(false)} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="MainTabs">
            {() => (
              <MainTabs
                companionDocked={docked}
                onToggleCompanion={toggleCompanion}
                onOpenHealth={() => setShowHealth(true)}
                onOpenHub={() => setShowHub(true)}
                onOpenFallback={() => setShowFallback(true)}
                onOpenPrefs={() => setShowPrefs(true)}
              />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
