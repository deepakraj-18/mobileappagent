# Task Index — Desk Companion Client (plan v3)

Branch: `feature/local-multi-device-mesh` · Plan: [../plan.md](../plan.md)
Status: `Pending` → `In Progress` → `Implemented` → `Review` → `PASS` (also `Blocked`, `Deferred`)
Estimates = ideal days. Order = dependency order.

Per-task files not yet written — this index is the agreed breakdown; files get generated on go-ahead.
The v2 Gmail/Google/multi-provider tasks are **dropped** (moved to the user's Azure brain app).

> ## 🔄 Framework override, 2026-09-06 — read `../plan.md`'s banner first
>
> This app is being rewritten in **React Native**, overriding this plan's original "stay on
> Flutter (locked)" decision. **The phase structure, task scope, and dependency graph below
> are unaffected and remain the reference for what to build.** What's stale, per-task, at
> implementation time: every Flutter-specific package named below needs an RN equivalent
> chosen when that task is actually started —
> `sqflite`/`flutter_secure_storage`/`local_auth`/`sherpa-onnx`/`web_socket_channel`/
> `flutter_local_notifications`-style packages, and every Kotlin↔Dart `MethodChannel` bridge
> becomes a React Native **Native Module**. Whoever picks up a task should note the chosen RN
> library in that task's own notes once written — don't let a second unstated decision drift
> in silently the way the RN-vs-Flutter one did.
>
> `IF001`'s "GitHub Actions (`flutter analyze` + `flutter test`)" becomes `tsc --noEmit` +
> `jest`, matching the parent project's existing RN app (`lifeosmobilev2`) conventions.
>
> The parent LifeOS repo's own task list covers the gate work sitting above this phase
> breakdown: `IF004` (the actual Flutter-cleanup + RN-scaffold task), `SC001`/`SC002`
> (security review). Phase 1 here (`IF001`, `IF002`, `SC001`–`SC008`, `DB001`, `BD013`)
> starts only after that scaffold exists.

---

## Phase 1 — Companion runtime foundation

| ID    | Title                                                                                                                                           | Stream | Dependencies | Est  | Status |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ---- | ------ |
| IF001 | GitHub Actions (`tsc --noEmit` + `jest`) **+ Firebase project + `google-services.json`** for FCM                                                | IF     | —            | 0.75 | Review |
| IF002 | Device provisioning runbook: enable a11y, notification access, **Vivo auto-start / battery / background-power whitelist**, ADB install script   | IF     | —            | 0.5  | Review |
| SC001 | `src/constants/appConstants.ts` — enums / magic numbers (companion mode, presence state, wake state, hub connection state, card kind)           | SC     | —            | 0.5  | Review |
| DB001 | `@op-engineering/op-sqlite` schema + migrations: `hub_outbox`, `hub_cache`, `event_log` (indexes on status/createdAt). **No user-data tables.** | DB     | SC001        | 0.5  | Review |
| SC007 | `LocalStore` — open/init/migrate; DAOs for outbox (FIFO + ack + cap), cache (kv + typed cards), event log                                       | SC     | SC001, DB001 | 0.75 | Review |
| SC002 | Navigation shell — bottom nav `Operator · Settings`; onboarding gate; Dock as a separate full-screen route via the Companion-Mode toggle        | SC     | SC001        | 0.75 | Review |
| SC003 | `CompanionModeService` — persisted docked-companion flag + lifecycle events; toggle entry point                                                 | SC     | SC001        | 0.5  | Review |
| SC004 | `CompanionForegroundService.kt` + RN hook — persistent notification, `START_STICKY`, wakelock, keep-screen-on hooks; manifest perms             | SC     | SC003        | 1.5  | Review |
| SC005 | `BootReceiver.kt` — `RECEIVE_BOOT_COMPLETED` → start FGS iff companion mode enabled                                                             | SC     | SC004        | 0.5  | Review |
| SC006 | Biometric app lock — `react-native-biometrics` (fingerprint + device-credential fallback); lock on resume; per-action gate hook; lock UI        | SC     | SC002        | 1.0  | Review |
| SC008 | Background event log + "Companion health" view (unattended failures visible)                                                                    | SC     | SC004, SC007 | 0.5  | Review |
| BD013 | Embodiment boundary — `Embodiment` interface (`speak/express/move/present`) + `PhoneEmbodiment` (TTS + dock state; `move` = no-op)              | BD     | SC001        | 0.5  | Review |

## Phase 2 — Voice loop

| ID    | Title                                                                                                                                                                                                                                    | Stream | Dependencies | Est  | Status  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ---- | ------- |
| BD003 | `WakeWordService` — sherpa-onnx KWS, bundled model, duty-cycled start/stop with the FGS, wake-event stream; tap-to-talk fallback                                                                                                         | BD     | SC004        | 2.0  | Review |
| BD004 | `VoiceSession` state machine (wake → STT → route: hub \| local-fallback \| command → TTS); voice `wake`/`sleep`. **+ `ScreenPowerPlugin.kt`** (sleep = `GLOBAL_ACTION_LOCK_SCREEN`/DevAdmin; wake = `FULL_WAKE_LOCK` + `KEEP_SCREEN_ON`) | BD     | BD003, BD013 | 2.5  | Review |
| FD001 | Dock screen shell — compact (360×772 dp): clock/date, listening state, wake/speaking animation, tap-to-talk, connection + presence chips (placeholders until Phase 3/5)                                                                  | FD     | SC002, BD013 | 1.5  | In Progress |
| FI005 | Wire Dock ↔ CompanionMode + WakeWord + VoiceSession (hub + presence wired later)                                                                                                                                                         | FI     | FD001, BD004 | 0.75 | Pending |

## Phase 3 — Hub client (core integration)

| ID    | Title                                                                                                                                                                                                                                             | Stream | Dependencies               | Est | Status    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------- | --- | --------- |
| BD035 | **Event contract** — spec written: [../hub-contract.md](../hub-contract.md). Remaining code work: `hub_events.dart` typed models + JSON codecs for every frame/event/command; versioned; unknown-command → acked `UNSUPPORTED`; round-trip tests. | BD     | SC001                      | 1.0 | Spec done |
| BD030 | `HubClient` interface + `MockHubClient` (scripted scenarios for dev/tests) + `hub_outbox` (sqflite queue, FIFO, ack, replay-on-reconnect, cap/drop)                                                                                               | BD     | BD035, SC007               | 2.0 | Pending   |
| BD031 | `HubAuth` — device pairing (code) / account login → device token + refresh; `flutter_secure_storage`; re-pair state on token loss                                                                                                                 | BD     | BD030                      | 1.5 | Pending   |
| BD032 | `AzureHubClient` realtime channel — WSS (raw `web_socket_channel` or SignalR client, decide here), reconnect/backoff, heartbeat, rides the FGS; duplicate-delivery idempotency by messageId                                                       | BD     | BD031                      | 2.5 | Pending   |
| BD033 | `FcmService.kt` + `fcm_receiver.dart` — high-priority data messages wake the app / force reconnect / carry a compact command when WSS is down                                                                                                     | BD     | BD032, IF001               | 1.5 | Pending   |
| BD034 | REST client — typed calls expecting the `~/.claude/rules/api-design.md` envelope + `error-handling.md` error shape; `GET /v1/companion/{cards,config}`, `POST /v1/companion/events` batch replay                                                  | BD     | BD031                      | 1.0 | Pending   |
| FD030 | Hub connection screen — pair/login, live connection status, last-sync, manual retry, sign out / re-pair                                                                                                                                           | FD     | SC002, BD031               | 1.0 | Pending   |
| FI030 | Wire hub client into app startup + FGS + Dock connection chip; `config` command → settings apply                                                                                                                                                  | FI     | FD030, BD032, BD033, BD034 | 1.0 | Pending   |

## Phase 4 — Agent execution via hub

| ID    | Title                                                                                                                                                                                | Stream | Dependencies | Est  | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------ | ---- | ------- |
| BD040 | Refactor `TaskExecutor` "think" step → request `agent_action` from the hub; stream `screen_dump` / `step_result` (+ screenshot) back; keep `TaskStep.tryParse` contract              | BD     | BD032        | 2.0  | Pending |
| BD042 | Inbound `run_goal` → executor; `goal_finished` + acks back; reject/queue when busy                                                                                                   | BD     | BD040        | 1.0  | Pending |
| BD041 | Local fallback LLM provider — single OpenAI-compatible endpoint+key (secure storage); `ai_service.dart` demoted to this; auto-engage when hub unreachable                            | BD     | BD040        | 1.0  | Pending |
| FD041 | Settings: fallback-provider form (base URL, key, model, test) + companion settings (wake phrase, "stay awake while charging", presence anchor picker, Vivo whitelist helper buttons) | FD     | SC002, BD041 | 1.25 | Pending |
| FI040 | Wire fallback provider + companion settings ↔ services; degraded-mode banner on Dock                                                                                                 | FI     | FD041, BD041 | 0.5  | Pending |

## Phase 5 — Proactivity surface

| ID    | Title                                                                                                                                                                                                                                                                                                                                                    | Stream | Dependencies                      | Est  | Status  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------- | ---- | ------- |
| BD050 | `AnnouncementQueue` — inbound `announce`; gate on presence + quiet hours (from hub `config`, local default); TTS via Embodiment; voice ack/snooze; fire-once semantics                                                                                                                                                                                   | BD     | BD032, BD004                      | 1.5  | Pending |
| BD005 | `PresenceService` — consume hub `presence` (authoritative); fallback: duty-cycled **BLE scan for a user-selected anchor** (Amazfit now; **Galaxy Watch 4 later — MAC randomises, prefer bonded-device check or watch→brain heartbeat, see plan §9-4**) + RSSI/miss-debounce + manual toggle + voice `sleep`; emits `presence_local`; triggers auto-sleep | BD     | BD032, SC004                      | 2.0  | Pending |
| BD051 | `DockCardsController` — hold + render `card_push` (reminder/task/health/info cards); stale/offline marker from cache; display only                                                                                                                                                                                                                       | BD     | BD032, SC007                      | 1.0  | Pending |
| BD052 | `NotificationListener.kt` + `notification_forwarder.dart` — forward incoming notifications to the hub (brain decides). Opt-in, off by default                                                                                                                                                                                                            | BD     | BD032, SC004                      | 1.5  | Pending |
| FD050 | Dock card components + presence/announcement UI states; card list on the Dock                                                                                                                                                                                                                                                                            | FD     | FD001, BD051                      | 1.25 | Pending |
| FI050 | Wire announcement queue + presence + dock cards + notification forwarder                                                                                                                                                                                                                                                                                 | FI     | FD050, BD050, BD005, BD051, BD052 | 0.75 | Pending |

## Phase 6 — Onboarding & hardening

| ID    | Title                                                                                                                                                                                 | Stream | Dependencies     | Est | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------- | --- | ------- |
| FD060 | Onboarding — companion setup: a11y, notification access, **Vivo battery/auto-start whitelist walkthrough**, pair with the brain, set wake phrase, pick presence anchor, grant mic/BLE | FD     | FD030, FD041     | 1.5 | Pending |
| QA060 | Funtouch background-survival testing — screen off, overnight, force-stop, reboot, WSS drop → FCM recovery; document breakages + whitelist fixes                                       | QA     | (Phase 1–3 done) | 1.0 | Pending |
| QA061 | Offline / degraded-mode testing — brain unreachable, internet down, token expired: local fallback LLM, BLE presence, outbox replay, stale cards, clear status messaging               | QA     | (Phase 3–5 done) | 1.0 | Pending |

## Phase 7 — DEFERRED

| ID    | Title                                                                                                                                        | Stream | Dependencies | Est | Status   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | --- | -------- |
| BD070 | No-internet **local mode** — LAN mesh (mDNS + WSS server) so a local box / PC can act as the brain when offline; reuse `HubClient` interface | BD     | BD032        | 3.0 | Deferred |
| FI070 | Flutter **Windows** console — a local brain stand-in / operator console over the mesh                                                        | FI     | BD070        | 4.0 | Deferred |
| BD071 | `RobotEmbodiment` — implement `Embodiment` for a physical body (servos/LEDs/mic array)                                                       | BD     | BD013        | —   | Deferred |
| FD071 | Devices list + Telegram-style device-chat screens (`PROJECT_ANALYSIS.md`) — only if local mode needs a UI                                    | FD     | BD070        | 2.5 | Deferred |

---

## Rough totals (Phases 1–6)

| Phase                       | Est (ideal days)      |
| --------------------------- | --------------------- |
| 1 — Runtime foundation      | ~8.75                 |
| 2 — Voice loop              | ~6.75                 |
| 3 — Hub client              | ~12.0                 |
| 4 — Agent execution via hub | ~5.75                 |
| 5 — Proactivity surface     | ~8.0                  |
| 6 — Onboarding & hardening  | ~3.5                  |
| **Total**                   | **~44.75 ideal days** |

Phase 7 (deferred): ~+12.5 ideal days.

---

## Notes / backwards dependencies (per task-streams.md)

- **BD004 → `ScreenPowerPlugin.kt`**: Kotlin piece ships inside BD004; must land before the Dart state machine is testable.
- **Phase 4 genuinely gated on Phase 3** (BD040 needs BD032's channel) — not merely numbered after it.
- **FD001 ships a shell in Phase 2**, gains hub cards in Phase 5 — UI not blocked on the hub.
- **BD005 (presence) sits in Phase 5** though "announce when near" sounds early: the authoritative signal is a hub command; local BLE is only the fallback, so it rides with the proactivity work.
- **BD035 (event contract) is the artifact the user needs** to build the Azure side — prioritise it; it unblocks parallel work on the brain.
