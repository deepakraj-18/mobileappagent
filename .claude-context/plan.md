# PrivateAgent → Desk Companion Client — Implementation Plan

> **Branch:** `feature/local-multi-device-mesh` > **Status:** DRAFT v3 — rewritten 2026-09-05 after scope narrowed to "companion body only"
> **Supersedes:** the mesh framing in `PROJECT_ANALYSIS.md` and plan v1/v2 (Gmail/Google/multi-provider work removed — see §11 changelog)

---

## 🔄 Framework override, 2026-09-06 — read before anything else

**§2's "stay on Flutter (locked)" decision is overridden. This app is being rewritten in
React Native**, by explicit, informed user decision — made _after_ being shown this exact
plan's stated reasoning (RN discards 5,200 working Dart lines for no gain on the native
automation core, since `AgentAccessibilityService.kt` is already framework-independent). The
override stands; the reasoning below wasn't wrong, the decision was made anyway.

**What this means for the rest of this document:**

- **Feature scope, phasing, and sequencing (§1, §4, and `tasks/INDEX.md`'s Phases 1–6) stay
  the intended reference** — the _what_ doesn't change because the _how_ did. Read them as
  "what needs building," not "read `lib/services/X.dart`."
- **Every Flutter-specific file path, package, and library choice throughout this doc and
  `tasks/INDEX.md` is now stale** and needs a React Native equivalent selected _at
  implementation time_ for each task, not rewritten wholesale here:
  `sqflite`→an RN SQLite binding, `flutter_secure_storage`→`react-native-keychain` (or
  equivalent), `local_auth`→`react-native-biometrics`, the `sherpa-onnx` Flutter plugin→its RN
  binding or an alternative, Flutter `MethodChannel`→an RN **Native Module**.
- **`AgentAccessibilityService.kt` and `AndroidManifest.xml`'s permission grants survive
  unchanged** — this was true under the original plan and remains true under React Native;
  it's the one part of §2's table that needs no equivalent-finding at all.
- **Telegram stays exactly as this plan already had it** — "kept in repo, unwired, default
  off" (§2, §11-9) is unaffected by the framework change. No extra work either way; there is
  no Dart file to "keep" once the rewrite happens, so in the new RN codebase this simply means:
  don't build a Telegram integration unless a later task asks for one.
- **The Flutter implementation is fully preserved**, not deleted blind: git tag
  `archive/flutter-final` (pushed) + a filesystem copy at
  `E:\Projects\LifeOS\_archive\deskcompanianapp-flutter-2026-09-06\` in the parent repo.

**Both this submodule's own planning tree and the LifeOS parent repo's
`.claude-context/plan.md` are being kept in sync going forward** (user decision) — this is the
richer, hardware-verified source for _feature_ scope; the parent's tasks cover the
cross-cutting gates (submodule wiring, the RN scaffold/cleanup itself, security review) that
sit above this phase breakdown. See the parent's `IF004`, `SC001`, `SC002`.

---

## 1. Vision & scope

An unused **Vivo Y17** becomes a **desk companion**: it sits docked and plugged in, listens
for a wake word, speaks, shows a dock display, and can operate apps on its own screen
(the existing observe→think→act agent).

**It is only the body.** The user is building a separate **hosted "brain" app on Azure**, in
parallel. All data and decisions live there: tasks, reminders, routines, health (Amazfit),
email, calendar, scheduling, LLM providers and context assembly. Every device the user owns
connects to that brain **over the internet**. This app is a **thin client** of that brain.

Long-term: the brain stays; the companion body eventually moves from this phone into a physical
robot (Pi + servos + mic array). A clean `Embodiment` seam (§4.5) keeps that migration cheap.

### In scope (this app)

- **Companion runtime:** foreground service, boot auto-start, biometric (fingerprint) app lock, dock UI, screen power via voice `wake` / `sleep` + auto-sleep on "away".
- **Voice:** offline wake word (sherpa-onnx), STT capture, TTS output.
- **Hub client:** device pairing/auth with the Azure brain; realtime WebSocket channel; REST client; FCM fallback delivery; an offline outbox + cache. **This is the central integration.**
- **On-device agent:** reuse the observe→think→act loop, but the "think" step calls the brain (local LLM fallback only when the brain is unreachable).
- **Presence:** consume the brain's presence signal; local BLE-anchor scan + manual toggle as fallback.
- **Dock display:** render cards the brain pushes (next reminder, task, health snippet) — **display only, no authoring**.
- **Local fallback LLM provider:** a single OpenAI-compatible endpoint + key (secure storage) for degraded mode.

### Removed from this app (now the brain's job)

- Gmail API / email triage · Google Tasks / Calendar sync · multi-provider LLM registry + provider-management screens · local task/reminder/routine **authoring** and their sqflite tables · the user's "other task app adapter" (the brain integrates that).

### Deferred / someday

- **Phase 7:** LAN mesh + PC console (`PROJECT_ANALYSIS.md`) — only worthwhile later as a _no-internet local mode_; not needed while the brain is cloud-hosted.
- Physical robot `Embodiment` implementation.
- iOS — not a target (Flutter Android only).

---

## 2. Current codebase (what we build on)

Forked from `AbuZar-Ansarii/PrivateAgent` — a **working** app, ~5,200 lines Dart + ~520 lines Kotlin.

| Area                            | File                                                                                                                                                                                                          | Fate                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Agent loop (observe→think→act)  | [lib/services/task_executor.dart](../lib/services/task_executor.dart)                                                                                                                                         | Keep; "think" step routes to hub (BD040); add step-stream hooks                               |
| LLM gateway (OpenAI-compatible) | [lib/services/ai_service.dart](../lib/services/ai_service.dart)                                                                                                                                               | Demote to **fallback only** (BD041); primary path is the hub                                  |
| Settings store                  | [lib/services/settings_service.dart](../lib/services/settings_service.dart)                                                                                                                                   | Keep; strip the 6 provider fields down to one fallback provider; add hub + companion settings |
| Accessibility bridge            | [screen_automation_service.dart](../lib/services/screen_automation_service.dart) + [AgentAccessibilityService.kt](../android/app/src/main/kotlin/com/privateagent/private_agent/AgentAccessibilityService.kt) | Keep as-is                                                                                    |
| Voice STT/TTS                   | [lib/services/voice_service.dart](../lib/services/voice_service.dart)                                                                                                                                         | Extend into a voice-session orchestrator (BD004)                                              |
| Overlay window                  | [lib/overlay/overlay_app.dart](../lib/overlay/overlay_app.dart)                                                                                                                                               | Keep unchanged                                                                                |
| Skill memory, recovery engine   | `skill_memory_service.dart`, `recovery_engine.dart`                                                                                                                                                           | Keep (device-automation concerns stay local)                                                  |
| Telegram bot                    | [lib/services/telegram_service.dart](../lib/services/telegram_service.dart)                                                                                                                                   | Keep in repo, unwired, default off                                                            |
| Home UI                         | [lib/screens/home/home_screen.dart](../lib/screens/home/home_screen.dart)                                                                                                                                     | Keep as the "Operator" screen; nav shell around it                                            |

**Framework: stay on Flutter** (locked). RN rebuild would discard 5,200 working lines and save
nothing on the native automation core.

---

## 3. Target device — CONFIRMED via ADB (2026-09-05)

|            |                                                                                      |
| ---------- | ------------------------------------------------------------------------------------ |
| Model      | Vivo Y17 — `vivo 1902` (serial `NR4DLF4HEIIVPNW4`)                                   |
| OS         | Funtouch OS 9 — **Android 9 (Pie), API 28**                                          |
| SoC / RAM  | MediaTek Helio P22 (8×A53) · `MemTotal` ≈ 3.82 GB · **arm64-v8a**                    |
| Screen     | **720 × 1544 px, density 320 (xhdpi)** ≈ 360 × 772 dp — compact Dock UI              |
| Biometrics | **Fingerprint only** (rear sensor). No system face biometric.                        |
| Google     | Play Services 26.32.34 + Play Store + Gmail present → FCM & Google sign-in available |
| Our app    | Not yet installed                                                                    |
| minSdk     | 26 (unchanged)                                                                       |

**Consequences:** pre-API-34 foreground-service model (simple); `BiometricPrompt` native (API 28),
fingerprint + device-credential fallback via `local_auth`; no `POST_NOTIFICATIONS` prompt (pre-33);
BLE scan needs `ACCESS_FINE_LOCATION` on API 28; Helio P22 + ~3.8 GB → **duty-cycle** the wake
listener, keep the LLM off-device, single Flutter engine. **Funtouch kills background apps** —
battery-optimisation exemption + Auto-start whitelist + High-background-power allowance are
**mandatory** and only partly automatable (IF002, FD060). Biggest "always-on" risk (§10).

---

## 4. Architecture

### 4.1 System shape

```
                          INTERNET (HTTPS + WSS)
   ┌──────────────────────────────┐          ┌─────────────────────────────────────┐
   │   AZURE BRAIN (user builds)   │          │   COMPANION (this app · Vivo Y17)    │
   │                              │  push →  │                                     │
   │  • tasks / reminders / rtn   │◄────────►│  HubClient                          │
   │  • health (Amazfit), email   │  WSS     │   ├─ realtime channel (SignalR/PubSub)│
   │  • calendar, scheduling      │          │   ├─ REST client                     │
   │  • LLM providers + context   │  REST    │   ├─ FCM fallback receiver            │
   │  • presence (primary)        │◄────────►│   └─ outbox + cache (sqflite)         │
   │  • "what should companion    │          │                                     │
   │     do / say" decisions      │  FCM  →  │  Companion runtime (FGS, dock, lock) │
   │                              │─────────►│  Voice (wake · STT · TTS)            │
   └──────────────────────────────┘          │  Agent executor (hands, on-screen)  │
                                             │  Local fallback LLM (degraded mode) │
                                             │  Presence: BLE-anchor + manual (fb) │
                                             └─────────────────────────────────────┘
```

### 4.2 Message contract (companion ⇄ brain) — the spec the user implements on Azure

**Full spec: [hub-contract.md](hub-contract.md) (BD035).** The tables below are a summary.
Envelope + errors follow `~/.claude/rules/api-design.md` and `~/.claude/rules/error-handling.md`
(versioned `/v1/`, `data`/`pagination` envelope, standard error shape, `Authorization: Bearer`).

**Companion → brain**
| Event | Payload | When |
|---|---|---|
| `register` / `refresh` | pairing code or account creds → device token / refreshed token | first run, token expiry |
| `heartbeat` | battery, charging, a11y on, dock state, app version | every N s over WSS |
| `voice_input` | transcript, locale, `wantsSpoken:true`, optional current-app pkg | wake-word capture completes |
| `screen_dump` | serialized node list, goalId | each agent "think" step (unless local fallback) |
| `step_result` | goalId, step#, action, ok, screenshot? | after each executed action |
| `goal_finished` | goalId, status, steps, summary | task end |
| `presence_local` | `home`/`away`, source `ble`/`manual`, rssi | local fallback only |
| `ack` | messageId | on every inbound command |

**Brain → companion**
| Command | Payload | Effect |
|---|---|---|
| `speak` | text, ssml?, interrupt? | TTS via Embodiment |
| `run_goal` | goalId, goal text, constraints | hand to TaskExecutor |
| `agent_action` | goalId, step#, one action JSON | executor performs it (hub-driven "think") |
| `announce` | text, priority, requiresPresence? | queued reminder/announcement |
| `card_push` | list of display cards (reminder/task/health/info) | dock renders (display only) |
| `presence` | `home`/`away`, confidence | authoritative presence |
| `config` | quiet hours, wake phrase, dock theme, poll intervals | apply + persist |
| `wake` / `sleep` | — | screen power |

Transport: **WSS primary** (Azure SignalR Service or Web PubSub), **REST** for queries/bulk sync
(`GET /v1/companion/cards`, `/v1/companion/config`, `POST /v1/companion/events` batch replay),
**FCM data message** to wake the app when the socket is down (payload = a compact command or
"reconnect now").

### 4.3 New module layout (`lib/`)

```
lib/
├── constants/app_constants.dart          [SC001]  enums / magic numbers (constants.md rule)
├── companion/
│   ├── companion_mode_service.dart       [SC003]  docked-companion flag + lifecycle
│   ├── wake_word_service.dart            [BD003]  sherpa-onnx KWS, duty-cycled
│   ├── voice_session.dart               [BD004]  wake → STT → route(hub|local|cmd) → TTS
│   ├── screen_power_service.dart         [BD004]  wake/sleep (Kotlin bridge)
│   ├── presence_service.dart             [BD005]  hub presence + BLE-anchor fallback + manual
│   ├── announcement_queue.dart           [BD050]  hub `announce` + presence/quiet-hours gate
│   ├── dock_cards_controller.dart        [BD051]  hold + render hub `card_push`
│   ├── notification_forwarder.dart       [BD052]  NotificationListenerService → hub (opt-in)
│   └── embodiment/{embodiment.dart, phone_embodiment.dart}   [BD013]
├── hub/
│   ├── hub_client.dart                   [BD030]  interface (connect, send, stream, rest)
│   ├── mock_hub_client.dart             [BD030]  dev/offline stand-in + scripted scenarios
│   ├── azure_hub_client.dart             [BD032/34]  WSS + REST impl (built when API lands)
│   ├── hub_auth.dart                     [BD031]  pairing/login, device token + refresh
│   ├── fcm_receiver.dart                 [BD033]  data-message fallback
│   ├── hub_outbox.dart                   [BD030]  sqflite queue, replay on reconnect
│   └── hub_events.dart                  [BD035]  typed event/command models + JSON
├── data/local_store.dart                 [SC007]  sqflite: hub_outbox, hub_cache, event_log
└── screens/
    ├── companion/dock_screen.dart        [FD001]
    ├── hub/hub_connection_screen.dart    [FD030]  pair/login, connection status
    ├── settings/…                        [FD041] fallback-provider + companion settings
    └── onboarding/… (extended)           [FD060]
```

### 4.4 Native (Kotlin) additions

```
CompanionForegroundService.kt   [SC004]  persistent notification, START_STICKY, wakelock, keep-screen-on
BootReceiver.kt                 [SC005]  RECEIVE_BOOT_COMPLETED → start FGS if companion mode on
ScreenPowerPlugin.kt            [BD004]  sleep = GLOBAL_ACTION_LOCK_SCREEN / DevAdmin; wake = FULL_WAKE_LOCK + KEEP_SCREEN_ON
FcmService.kt                   [BD033]  FirebaseMessagingService → MethodChannel
NotificationListener.kt         [BD052]  NotificationListenerService → events (opt-in)
```

Manifest adds: `FOREGROUND_SERVICE`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`,
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `ACCESS_FINE_LOCATION` (BLE scan API 28),
`BIND_NOTIFICATION_LISTENER_SERVICE`, Firebase Messaging.

### 4.5 Embodiment boundary (robot-later seam)

All expression goes through `Embodiment` (`speak`, `express(mood)`, `move(gesture)`,
`present(bool)`). Today `PhoneEmbodiment`: `speak`→TTS, `express`→dock face state, `move`→no-op.
A future `RobotEmbodiment` implements the same interface. **Cost now: one interface + one impl.**

### 4.6 Degraded mode (brain unreachable)

Companion stays useful: wake word + STT + TTS work; `voice_input` falls back to the **local LLM
provider** (BD041) for plain Q&A and simple on-screen automation; presence falls back to BLE +
manual; outbound events accumulate in `hub_outbox` and replay on reconnect; dock shows last
cached cards with a "stale / offline" marker.

---

## 5. Streams (per ~/.claude/rules/task-streams.md)

| Prefix | This project                                                                                                                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IF     | CI (`flutter analyze`/`test`); Vivo device-provisioning runbook; Firebase project + `google-services.json`                                                                                                                                                             |
| SC     | Constants, nav shell, companion-mode service, foreground service, boot receiver, biometric lock, local store (outbox/cache), background health log                                                                                                                     |
| DB     | sqflite schema for `hub_outbox`, `hub_cache`, `event_log` (+ migrations) — **no user-data tables**                                                                                                                                                                     |
| BD     | Wake word, voice session, screen power, presence, embodiment, hub client + mock, hub auth, WSS channel, FCM fallback, REST client, event contract, executor→hub think step, local fallback provider, announcement queue, dock-cards controller, notification forwarder |
| FD     | Dock UI, hub-connection screen, fallback-provider + companion settings, onboarding extension, dock card components                                                                                                                                                     |
| FI     | Wire each screen/service to the hub client and companion services                                                                                                                                                                                                      |
| QA     | Funtouch background-survival; offline/degraded-mode behaviour                                                                                                                                                                                                          |

---

## 6. Phases & execution order

**Phase 1 — Companion runtime foundation**
IF001, IF002 → SC001 → DB001 → SC007 → SC002 → SC003 → SC004 → SC005 → SC006 → SC008 → BD013
_Exit: installs on the Y17, boot-started FGS, survives screen-off overnight, biometric lock, placeholder dock._

**Phase 2 — Voice loop**
BD003 → BD004 (incl. ScreenPowerPlugin) → FD001 (dock shell) → FI005 (partial)
_Exit: "Hey Genie" → ask → spoken answer via the **local fallback LLM**; `wake`/`sleep` voice commands work._

**Phase 3 — Hub client (core integration)**
BD035 (contract) → BD030 (interface + MockHub + outbox) → BD031 (auth) → BD032 (WSS) → BD033 (FCM) → BD034 (REST) → FD030 → FI030
_Exit: companion pairs with a mock/real brain, holds a live WSS channel through the FGS, survives reconnect, replays the outbox; `speak`/`config`/`presence` commands take effect._

**Phase 4 — Agent execution via hub**
BD040 (executor "think" → hub, + step stream) → BD042 (`run_goal` inbound) → BD041 (local fallback provider) → FD041 → FI040
_Exit: brain dispatches a goal, companion executes it on-screen and streams steps back; brain-down falls back to the local provider._

**Phase 5 — Proactivity surface**
BD050 (announcement queue + presence/quiet-hours gate) → BD005 (presence: hub + BLE fallback) → BD051 (dock cards) → BD052 (notification forwarder, opt-in) → FD050 → FI050
_Exit: brain says "announce reminder" → spoken only when present; dock shows pushed cards; incoming phone notifications optionally forwarded to the brain._

**Phase 6 — Onboarding & hardening**
FD060 (onboarding: a11y, notif access, Vivo whitelist, pair brain, wake phrase, presence anchor) → QA060 (Funtouch survival) → QA061 (offline/degraded)
_Exit: clean first-run; documented behaviour when brain + internet are down._

**Phase 7 — DEFERRED**
LAN mesh + Flutter Windows console as a no-internet local mode; `RobotEmbodiment`.

### Critical path

`SC004 → BD003 → BD004 → BD030 → BD032 → BD040` — a companion that pairs with the brain, holds a
channel, and executes brain-dispatched goals with voice I/O.

### Backwards / cross-stream dependencies (flag per task-streams.md)

- **BD004 needs `ScreenPowerPlugin.kt`** — delivered inside BD004; Kotlin lands before the Dart state machine is testable.
- **BD040 depends on BD030+BD032** (hub think step needs the channel) — Phase 4 genuinely gated on Phase 3, not just numbered after it.
- **FD001 ships a shell in Phase 2, gains hub cards in Phase 5** — UI not blocked on the hub.
- **BD005 (presence) is Phase 5** even though "announce when near" sounds early — the _authoritative_ signal is a hub command; local BLE is only the fallback, so it rides with the proactivity work.

---

## 7. Testing approach (per ~/.claude/rules/guard-tests.md)

- **Event contract (`hub_events`)** — round-trip every command/event type through JSON encode/decode; enumerate the full command set (exact-set assertion, not "contains"), unknown command → defined `unhandled` path, never silent drop.
- **HubClient state machine** — table-driven over (connection state × event): connect, drop, backoff, token-expiry→refresh→resume, outbox replay ordering, duplicate-delivery idempotency (messageId). Prove a guard: kill the socket mid-goal, assert steps queue and replay once.
- **Outbox (sqflite)** — persistence across process death; FIFO; no double-send after `ack`; cap + oldest-drop policy tested.
- **Voice session** — every (state × event) transition with KWS/STT/TTS mocked; inject failed STT → assert fallback prompt; inject brain-unreachable → assert local-LLM path.
- **Presence + announcement queue** — `announce(requiresPresence)` while away fires exactly once on away→home; hub `presence` overrides local; hub-silent → BLE fallback engages after debounce.
- **Executor think-step** — mock hub returning `agent_action`; assert it's parsed via the existing `TaskStep.tryParse` and executed; brain 5xx/timeout → local `ai_service` fallback.
- **Kotlin** — instrumented: FGS restarts after process death; FCM data message with app killed triggers reconnect. Manual QA for Funtouch auto-start (QA060).
- `flutter_test` + `mocktail`. No .NET/Laravel/React rules apply.

---

## 8. New dependencies (added per-task, not up front)

| Package                                | For                                           | Notes                                                                                                   |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `sherpa_onnx`                          | Offline keyword spotting (+ optional STT)     | Apache-2.0, no key, arm64, ~10–30 MB models. Chosen over Picovoice (no key available) / Vosk (heavier). |
| `web_socket_channel`                   | WSS channel to Azure SignalR / Web PubSub     | If using SignalR's own protocol, add `signalr_netcore`; evaluate raw WS vs SignalR client in BD032.     |
| `firebase_core` + `firebase_messaging` | FCM fallback delivery                         | Needs a Firebase project + `google-services.json` (IF001).                                              |
| `flutter_secure_storage`               | device token, refresh token, fallback API key | Keystore-backed.                                                                                        |
| `local_auth`                           | Biometric app lock                            | API 28 `BiometricPrompt`; fingerprint + device-credential fallback.                                     |
| `sqflite` + `path`                     | outbox / cache / event log                    | **Not** user data — reliability queue only.                                                             |
| `flutter_blue_plus`                    | BLE scan for the presence anchor (fallback)   | Scan-only; `ACCESS_FINE_LOCATION` on API 28. No pairing.                                                |
| `flutter_local_notifications`          | already present                               | dock/announcement local notifications                                                                   |
| `flutter_background_service` _(maybe)_ | Dart hook into the FGS                        | Evaluate vs a plain Kotlin service in SC004; prefer lighter.                                            |

---

## 9. Decisions — RESOLVED 2026-09-05

1. **Scope:** companion **body only**. Brain is a separate hosted Azure app the user builds in parallel. Tasks/reminders/health/email/calendar/routines/scheduling + LLM providers & context = brain. This app = runtime + voice + hands + hub client + dock.
2. **Hub location / transport:** brain is **cloud-hosted on Azure**; all devices connect **over the internet**. Companion↔brain = **WSS primary (SignalR/Web PubSub) + REST for queries + FCM fallback**. Auth: device pairs once → bearer device token + refresh.
3. **LLM path:** **route through the brain** (it holds the context and the providers). Companion keeps **one local fallback provider** for degraded mode only. The originally-requested multi-provider management screens live in the **brain app**, not here.
4. **Presence:** **hub-provided is authoritative**; local **BLE-anchor scan + manual toggle + voice `sleep`** are the fallback when the hub is silent. Anchor is **user-selected via a scan-and-pick list** (FD041), not hardcoded — current anchor = Amazfit watch.
   - **Future: Samsung Galaxy Watch 4 (Wear OS 3) will replace the Amazfit.** No companion rebuild — re-pick the anchor in settings. But Wear OS **randomises its BLE MAC**, so the fixed-MAC scan degrades with the Watch 4. Handling, in preference order: (a) **Watch 4 heartbeats to the brain directly** (Wear OS has its own Wi-Fi/BT/LTE) → presence stays on the authoritative `presence` channel and the BLE fallback is barely used; (b) **bond** the Watch 4 to the companion phone once and detect the _bonded_ address / connection state instead of scanning adverts; (c) rely on manual toggle + voice `sleep` as the real offline fallback. Watch 4 **health data** is a brain-side connector swap (Zepp → Health Connect / Samsung Health), zero companion impact.
5. **Screen power:** voice `wake` / `sleep` primary; **auto-sleep** on confirmed "away"; optional "stay awake while charging".
6. **Persistence:** **sqflite**, but only for `hub_outbox` / `hub_cache` / `event_log`. No user-data tables.
7. **Nav shell:** bottom nav `Operator · Settings`; **Dock** is a full-screen route via the Companion-Mode toggle. (Tasks/Email tabs dropped — that content is hub cards on the Dock.)
8. **Wake phrase:** default **"Hey Genie"**, changeable via hub `config` or local settings.
9. **Telegram bot:** kept in repo, unwired, `telegramEnabled` default `false`.
10. **LAN mesh + PC console (`PROJECT_ANALYSIS.md`):** deferred to Phase 7 as an optional no-internet local mode; not on the critical path.

### Open items — need input when the brain API is being defined

- **Auth model:** account login on the companion vs. a pairing code generated in the brain's UI. (Plan assumes: pairing code → device token, with re-pair on token loss.)
- **WSS tech:** Azure **SignalR Service** vs **Web PubSub** — affects whether we use a SignalR client lib or raw `web_socket_channel`. (Plan assumes raw WS acceptable; confirm.)
- **Exact card schema** the brain will push (`card_push`) and the **config keys** it will send.
- **Whether the brain wants raw screen dumps** every think-step (bandwidth) or only on request.

---

## 10. Risks

| Risk                                                                                                      | Impact                                                    | Mitigation                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funtouch OS kills the companion / drops the WSS socket in background                                      | Companion goes silent; misses `announce`/`run_goal`       | FGS + `START_STICKY` + boot receiver; **FCM data message to wake & reconnect**; battery/auto-start whitelist walkthrough (IF002, FD060); QA060 overnight                                                  |
| Always-online design vs. the fork's "nothing leaves your phone" pitch                                     | Privacy positioning changes; user data now transits Azure | User's explicit design. Update README/positioning; TLS everywhere; token in Keystore; document the data that leaves the device                                                                            |
| ~3.8 GB RAM, Helio P22                                                                                    | Low-memory kill of FGS; lag with KWS+STT+TTS+WSS          | LLM off-device; duty-cycle wake listener; single Flutter engine; recover via boot receiver + FCM                                                                                                          |
| Brain unreachable (internet down / Azure outage)                                                          | No tasks, no smart answers                                | Degraded mode §4.6: local fallback LLM, BLE presence, outbox replay, stale-card marker                                                                                                                    |
| No clean API to power the screen **on**                                                                   | `wake` command unreliable on some Funtouch builds         | `FULL_WAKE_LOCK` + `FLAG_KEEP_SCREEN_ON` while awake; accept a tap may be needed from fully-off                                                                                                           |
| BLE anchor — off-wrist / weak RSSI; **MAC randomisation (severe on the future Galaxy Watch 4 / Wear OS)** | False away→auto-sleep; false home→announce to empty room  | Only a fallback; RSSI threshold + miss-debounce; manual + voice override; anchor is user-swappable (FD041); for Watch 4 prefer watch→brain heartbeat or a bonded-device check over advert scanning (§9-4) |
| FCM delivery latency/throttling in Doze                                                                   | Delayed `announce`/wake                                   | Use high-priority data messages sparingly; WSS is primary; accept minutes-scale worst case for non-urgent                                                                                                 |
| Device token lost on Funtouch "clear data"                                                                | Silent brain disconnect                                   | Token in `flutter_secure_storage`; explicit "re-pair" state on the dock + settings                                                                                                                        |
| Biometric lock vs. a live agent task                                                                      | Locking UI must not pause the a11y service mid-goal       | Lock gates Flutter UI only; executor + a11y + WSS keep running; dock shows live task read-only                                                                                                            |

---

## 11. Changelog

- **v3.1 (2026-09-05):** Noted the planned **Amazfit → Samsung Galaxy Watch 4** anchor swap under §9-4 and §10 — no companion rebuild (anchor already user-selectable); Wear OS MAC randomisation means prefer watch→brain heartbeat or a bonded-device check; health-data change is brain-side only.
- **v3 (2026-09-05):** Scope narrowed to "companion body only". Brain is a separate hosted Azure app. **Removed:** Gmail API, Google Tasks/Calendar sync, multi-provider registry + provider screens, local task/reminder/routine authoring + their sqflite tables, external-task-app adapter. **Added:** hub client (WSS + REST + FCM), device auth, event contract, hub-driven agent think-step, degraded mode, dock cards, local fallback provider. Presence demoted to hub-primary. Phases reduced from 6+7 to 6+7 but reshaped (Phase 3/4 now hub-centric).
- **v2:** confirmed Vivo Y17 = Android 9 / API 28, fingerprint-only; resolved storage=sqflite, Gmail OAuth, screen rule, presence=BLE anchor.
- **v1:** initial companion plan on top of the fork (Flutter, sherpa-onnx wake word, Gmail/Google integration, multi-provider).

---

## 12. This session's deliverables

- This `plan.md` (v3).
- `.claude-context/tasks/INDEX.md` — task list in dependency order.
- Per-task spec files — generated on your go-ahead.
