import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  HubConnectionState,
  type HubConnectionState as HubConnectionStateType,
} from '../constants/appConstants';
import { CompanionSettings } from '../hub/CompanionSettings';
import { HubRuntime, type HubRuntimeSnapshot } from '../hub/HubRuntime';
import { Accessibility } from '../native/Accessibility';
import { setOnboardingComplete } from '../navigation/onboarding';
import { NotificationForwarder } from '../proactivity/notificationForwarder';
import {
  requestBleScanPermission,
  requestMicrophonePermission,
} from '../onboarding/permissions';
import {
  ONBOARDING_STEPS,
  OnboardingStepId,
  PRESENCE_ANCHORS,
  VIVO_CHECKLIST,
  type OnboardingStepId as StepId,
} from '../onboarding/steps';

type Props = { onDone: () => void };

function statusLabel(state: HubConnectionStateType): string {
  switch (state) {
    case HubConnectionState.CONNECTED:
      return 'Connected';
    case HubConnectionState.CONNECTING:
    case HubConnectionState.RECONNECTING:
      return 'Connecting…';
    case HubConnectionState.DISCONNECTED:
      return 'Disconnected';
    case HubConnectionState.UNPAIRED:
    default:
      return 'Unpaired';
  }
}

/**
 * Guided first-run: a11y → notifications → Vivo whitelist → pair → prefs → mic/BLE (FD060).
 */
export function OnboardingScreen({ onDone }: Props): React.JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const step = ONBOARDING_STEPS[stepIndex] ?? OnboardingStepId.WELCOME;

  const [a11yOn, setA11yOn] = useState(false);
  const [notifAccess, setNotifAccess] = useState(false);
  const [forwardOptIn, setForwardOptIn] = useState(false);
  const [vivoAck, setVivoAck] = useState(false);

  const [hubSnap, setHubSnap] = useState<HubRuntimeSnapshot>(
    HubRuntime.getSnapshot(),
  );
  const [baseUrl, setBaseUrl] = useState('');
  const [pairCode, setPairCode] = useState('');

  const [wakePhrase, setWakePhrase] = useState('Hey Genie');
  const [presenceAnchor, setPresenceAnchor] = useState('amazfit');

  const [micGranted, setMicGranted] = useState(false);
  const [bleGranted, setBleGranted] = useState(false);
  const [busy, setBusy] = useState(false);

  const progress = useMemo(
    () => `${stepIndex + 1} / ${ONBOARDING_STEPS.length}`,
    [stepIndex],
  );

  const refreshGates = useCallback(async () => {
    try {
      setA11yOn(await Accessibility.isServiceEnabled());
    } catch {
      setA11yOn(false);
    }
    try {
      setNotifAccess(await NotificationForwarder.isAccessEnabled());
    } catch {
      setNotifAccess(false);
    }
  }, []);

  useEffect(() => {
    void refreshGates();
    void HubRuntime.hydrate().then(s => {
      setHubSnap(s);
      setBaseUrl(s.baseUrl);
    });
    return HubRuntime.subscribe(setHubSnap);
  }, [refreshGates]);

  useEffect(() => {
    if (
      step === OnboardingStepId.ACCESSIBILITY ||
      step === OnboardingStepId.NOTIFICATIONS
    ) {
      void refreshGates();
    }
  }, [step, refreshGates]);

  const goNext = useCallback(() => {
    setStepIndex(i => Math.min(i + 1, ONBOARDING_STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setStepIndex(i => Math.max(i - 1, 0));
  }, []);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      await CompanionSettings.apply({
        wakePhrase: wakePhrase.trim() || 'Hey Genie',
        presenceAnchorId: presenceAnchor,
      });
      if (forwardOptIn) {
        await NotificationForwarder.setOptedIn(true);
      }
      await setOnboardingComplete();
      onDone();
    } finally {
      setBusy(false);
    }
  }, [wakePhrase, presenceAnchor, forwardOptIn, onDone]);

  const onPair = useCallback(async () => {
    setBusy(true);
    try {
      if (baseUrl.trim() && baseUrl.trim() !== hubSnap.baseUrl) {
        await HubRuntime.setBaseUrl(baseUrl.trim());
      }
      await HubRuntime.pair(pairCode);
      setPairCode('');
    } catch (e) {
      Alert.alert(
        'Pairing failed',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }, [baseUrl, pairCode, hubSnap.baseUrl]);

  const requestMic = useCallback(async () => {
    setBusy(true);
    try {
      setMicGranted(await requestMicrophonePermission());
    } finally {
      setBusy(false);
    }
  }, []);

  const requestBle = useCallback(async () => {
    setBusy(true);
    try {
      setBleGranted(await requestBleScanPermission());
    } finally {
      setBusy(false);
    }
  }, []);

  const paired =
    hubSnap.connectionState !== HubConnectionState.UNPAIRED &&
    Boolean(hubSnap.deviceId);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="onboarding-screen"
    >
      <Text style={styles.progress} testID="onboarding-progress">
        {progress}
      </Text>

      {step === OnboardingStepId.WELCOME ? (
        <StepBlock
          title="Welcome to PrivateAgent"
          body="This phone becomes the desk companion body. We will grant accessibility, whitelist Funtouch background power, pair with the brain, and set wake / presence defaults."
        >
          <PrimaryButton label="Get started" onPress={goNext} testID="onb-next" />
        </StepBlock>
      ) : null}

      {step === OnboardingStepId.ACCESSIBILITY ? (
        <StepBlock
          title="Accessibility"
          body="Required for screen automation. Enable PrivateAgent in system Accessibility settings, then refresh."
        >
          <StatusPill
            ok={a11yOn}
            label={a11yOn ? 'Accessibility ON' : 'Accessibility OFF'}
            testID="onb-a11y-status"
          />
          <SecondaryButton
            label="Open Accessibility settings"
            onPress={() => {
              void Accessibility.openAccessibilitySettings().catch((e: unknown) => {
                Alert.alert(
                  'Could not open settings',
                  e instanceof Error ? e.message : String(e),
                );
              });
            }}
            testID="onb-a11y-open"
          />
          <SecondaryButton
            label="Refresh status"
            onPress={() => {
              void refreshGates();
            }}
            testID="onb-a11y-refresh"
          />
          <NavRow
            onBack={goBack}
            onNext={goNext}
            nextLabel={a11yOn ? 'Continue' : 'Skip for now'}
            nextTestID="onb-next"
          />
        </StepBlock>
      ) : null}

      {step === OnboardingStepId.NOTIFICATIONS ? (
        <StepBlock
          title="Notification access"
          body="Optional. Grant notification listener access if you want the companion to forward alerts to the brain. Forwarding stays off until you opt in."
        >
          <StatusPill
            ok={notifAccess}
            label={
              notifAccess
                ? 'Notification access ON'
                : 'Notification access OFF'
            }
            testID="onb-notif-status"
          />
          <SecondaryButton
            label="Open notification access settings"
            onPress={() => {
              void NotificationForwarder.openAccessSettings().catch(
                (e: unknown) => {
                  Alert.alert(
                    'Could not open settings',
                    e instanceof Error ? e.message : String(e),
                  );
                },
              );
            }}
            testID="onb-notif-open"
          />
          <View style={styles.row}>
            <Text style={styles.label}>Forward notifications (opt-in)</Text>
            <Switch
              value={forwardOptIn}
              onValueChange={setForwardOptIn}
              testID="onb-notif-optin"
            />
          </View>
          <SecondaryButton
            label="Refresh status"
            onPress={() => {
              void refreshGates();
            }}
            testID="onb-notif-refresh"
          />
          <NavRow onBack={goBack} onNext={goNext} nextTestID="onb-next" />
        </StepBlock>
      ) : null}

      {step === OnboardingStepId.VIVO_WHITELIST ? (
        <StepBlock
          title="Vivo / Funtouch whitelist"
          body="Without these, Funtouch kills the companion overnight. Open app info, complete the checklist, then acknowledge."
        >
          {VIVO_CHECKLIST.map(item => (
            <Text key={item} style={styles.bullet}>
              • {item}
            </Text>
          ))}
          <SecondaryButton
            label="Open app info / battery settings"
            onPress={() => {
              void Accessibility.openAppInfoSettings().catch((e: unknown) => {
                Alert.alert(
                  'Could not open app info',
                  e instanceof Error ? e.message : String(e),
                );
              });
            }}
            testID="onb-vivo-appinfo"
          />
          <View style={styles.row}>
            <Text style={styles.label}>I completed the whitelist steps</Text>
            <Switch
              value={vivoAck}
              onValueChange={setVivoAck}
              testID="onb-vivo-ack"
            />
          </View>
          <NavRow
            onBack={goBack}
            onNext={goNext}
            nextDisabled={!vivoAck}
            nextTestID="onb-next"
          />
        </StepBlock>
      ) : null}

      {step === OnboardingStepId.PAIR ? (
        <StepBlock
          title="Pair with the brain"
          body="Enter the hub base URL and the one-time pairing code from LifeOSAPI / the brain console."
        >
          <StatusPill
            ok={paired}
            label={`Hub · ${statusLabel(hubSnap.connectionState)}`}
            testID="onb-hub-status"
          />
          <Text style={styles.label}>Hub base URL</Text>
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://…"
            placeholderTextColor="#64748b"
            testID="onb-hub-url"
          />
          <Text style={styles.label}>Pairing code</Text>
          <TextInput
            style={styles.input}
            value={pairCode}
            onChangeText={setPairCode}
            autoCapitalize="characters"
            placeholder="CODE"
            placeholderTextColor="#64748b"
            testID="onb-hub-code"
          />
          <PrimaryButton
            label={busy ? 'Pairing…' : 'Pair device'}
            onPress={() => {
              void onPair();
            }}
            disabled={busy || !pairCode.trim()}
            testID="onb-hub-pair"
          />
          <NavRow
            onBack={goBack}
            onNext={goNext}
            nextLabel={paired ? 'Continue' : 'Skip for now'}
            nextTestID="onb-next"
          />
        </StepBlock>
      ) : null}

      {step === OnboardingStepId.PREFS ? (
        <StepBlock
          title="Wake phrase & presence"
          body="Defaults can be changed later in Settings → Companion."
        >
          <Text style={styles.label}>Wake phrase</Text>
          <TextInput
            style={styles.input}
            value={wakePhrase}
            onChangeText={setWakePhrase}
            placeholder="Hey Genie"
            placeholderTextColor="#64748b"
            testID="onb-wake-phrase"
          />
          <Text style={styles.section}>Presence anchor</Text>
          {PRESENCE_ANCHORS.map(a => (
            <Pressable
              key={a.id}
              style={[
                styles.chip,
                presenceAnchor === a.id && styles.chipOn,
              ]}
              onPress={() => setPresenceAnchor(a.id)}
              testID={`onb-anchor-${a.id}`}
            >
              <Text
                style={[
                  styles.chipText,
                  presenceAnchor === a.id && styles.chipTextOn,
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
          <NavRow onBack={goBack} onNext={goNext} nextTestID="onb-next" />
        </StepBlock>
      ) : null}

      {step === OnboardingStepId.PERMISSIONS ? (
        <StepBlock
          title="Microphone & BLE"
          body="Mic powers wake word / tap-to-talk. Location (API 28) is required to scan for the BLE presence anchor."
        >
          <StatusPill
            ok={micGranted}
            label={micGranted ? 'Microphone granted' : 'Microphone not granted'}
            testID="onb-mic-status"
          />
          <PrimaryButton
            label="Grant microphone"
            onPress={() => {
              void requestMic();
            }}
            disabled={busy}
            testID="onb-mic-request"
          />
          <StatusPill
            ok={bleGranted}
            label={
              bleGranted
                ? 'BLE / location granted'
                : 'BLE / location not granted'
            }
            testID="onb-ble-status"
          />
          <PrimaryButton
            label="Grant BLE scan permission"
            onPress={() => {
              void requestBle();
            }}
            disabled={busy}
            testID="onb-ble-request"
          />
          <NavRow
            onBack={goBack}
            onNext={goNext}
            nextLabel="Continue"
            nextTestID="onb-next"
          />
        </StepBlock>
      ) : null}

      {step === OnboardingStepId.DONE ? (
        <StepBlock
          title="You're set"
          body="Companion mode, Dock, and hub reconnect will use these grants. Revisit Settings anytime. Overnight survival: see docs/DEVICE_PROVISIONING.md and QA060."
        >
          {busy ? <ActivityIndicator color="#93c5fd" /> : null}
          <PrimaryButton
            label={busy ? 'Finishing…' : 'Finish setup'}
            onPress={() => finish()}
            disabled={busy}
            testID="onb-finish"
          />
          <SecondaryButton label="Back" onPress={goBack} testID="onb-back" />
        </StepBlock>
      ) : null}
    </ScrollView>
  );
}

function StepBlock({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.block}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {children}
    </View>
  );
}

function StatusPill({
  ok,
  label,
  testID,
}: {
  ok: boolean;
  label: string;
  testID: string;
}): React.JSX.Element {
  return (
    <View
      style={[styles.pill, ok ? styles.pillOk : styles.pillBad]}
      testID={testID}
    >
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      style={[styles.btn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      style={[styles.btn, styles.btnSecondary]}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

function NavRow({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  nextTestID,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextTestID: string;
}): React.JSX.Element {
  return (
    <View style={styles.navRow}>
      <Pressable onPress={onBack} testID="onb-back" accessibilityRole="button">
        <Text style={styles.backLink}>Back</Text>
      </Pressable>
      <PrimaryButton
        label={nextLabel}
        onPress={onNext}
        disabled={nextDisabled}
        testID={nextTestID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 24, gap: 12, paddingBottom: 48 },
  progress: { color: '#64748b', fontWeight: '600', marginBottom: 4 },
  block: { gap: 12 },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '700' },
  body: { color: '#94a3b8', fontSize: 15, lineHeight: 22 },
  label: { color: '#e2e8f0', fontWeight: '600' },
  section: { color: '#f8fafc', fontWeight: '700', marginTop: 8 },
  bullet: { color: '#cbd5e1', lineHeight: 22 },
  input: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navRow: {
    marginTop: 8,
    gap: 12,
  },
  backLink: { color: '#93c5fd', fontWeight: '600', marginBottom: 4 },
  pill: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pillOk: { backgroundColor: '#14532d' },
  pillBad: { backgroundColor: '#7f1d1d' },
  pillText: { color: '#f8fafc', fontWeight: '600' },
  chip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
  },
  chipOn: { borderColor: '#2563eb', backgroundColor: '#1e3a8a' },
  chipText: { color: '#e2e8f0', fontWeight: '500' },
  chipTextOn: { color: '#93c5fd', fontWeight: '700' },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondary: { backgroundColor: '#334155' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600' },
});

/** Exported for tests */
export function onboardingStepAt(index: number): StepId {
  return ONBOARDING_STEPS[index] ?? OnboardingStepId.WELCOME;
}
