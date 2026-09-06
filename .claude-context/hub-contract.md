# Companion ⇄ Brain — Hub Contract (v1)

> **Task:** BD035 · **Plan:** [plan.md](plan.md) §4.2
> **Status:** DRAFT v1 — the wire contract between the **Companion** (this app on the
> Vivo Y17 — **React Native as of 2026-09-06, was Flutter**, see `plan.md`'s framework-override
> banner) and the **Brain** (the user's hosted Azure app). This document is the spec both sides
> implement.
> **Conventions:** REST follows `~/.claude/rules/api-design.md`; all errors follow
> `~/.claude/rules/error-handling.md`. Timestamps are ISO-8601 UTC. IDs are strings.
> Field names are `camelCase`. Enums are `UPPER_SNAKE_CASE` on the wire.
>
> **This contract is entirely stack-agnostic** — it's a wire protocol, not an implementation.
> Nothing here changes because the companion moved from Flutter to React Native. The only
> stale bits are the two `lib/services/*.dart` file-path references below (§6.1, §9) — treat
> those as "wherever the RN app's equivalent lands," not literal paths.

---

## 1. Roles & responsibilities

|        | **Brain** (Azure)                                                                                                                                | **Companion** (Vivo Y17)                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Owns   | tasks, reminders, routines, health, email, calendar, scheduling, LLM providers + context, **authoritative presence**, "what to do/say" decisions | foreground runtime, wake word, STT/TTS, on-device UI automation ("hands"), dock display, local fallback LLM, local BLE presence fallback |
| Speaks | commands ↓ to the companion; answers REST queries                                                                                                | events ↑ to the brain; performs commands; renders cards                                                                                  |

The companion is a **thin client**. It never decides _what_ to do — it reports what it sees/hears
and executes what the brain returns. The sole exception is **degraded mode** (§9): when the brain
is unreachable, the companion uses its local fallback LLM for plain Q&A and simple automation.

---

## 2. Transport

Three channels, in priority order:

| Channel              | Use                                                                          | Tech (Companion side)                                    |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| **WSS** (primary)    | Bidirectional realtime: all commands, all events, heartbeats                 | Persistent WebSocket held open by the foreground service |
| **REST** (secondary) | Request/response queries, bulk sync, outbox replay                           | HTTPS, bearer auth                                       |
| **FCM** (fallback)   | Wake the app / force reconnect / deliver one urgent command when WSS is down | Firebase data messages (high priority)                   |

- **Base URL:** `https://<brain-host>/` — REST under `/v1/…`, WSS at `wss://<brain-host>/v1/companion/stream`.
- The companion **always prefers WSS**. If the socket is connected, commands and events flow only over WSS. REST is for explicit queries and for replaying the outbox after a reconnect. FCM never carries routine traffic.
- **OPEN (§10-2):** whether WSS is raw WebSocket (spec below) or Azure **SignalR Service** / **Web PubSub** with their own framing. This doc assumes **raw WebSocket with the frame envelope in §4**. If SignalR is chosen, the envelope maps to a single hub method `send(frame)` / client method `recv(frame)` and the rest is unchanged.

---

## 3. Authentication & pairing

### 3.1 Pairing (first run)

1. User opens the Brain app → **Devices → Add companion** → Brain shows a short **pairing code** (e.g. `7F3K-9Q2D`, 8 chars, 10-minute TTL).
2. User enters the code on the Companion's onboarding screen.
3. Companion → `POST /v1/companion/pair`
   ```json
   {
     "pairingCode": "7F3K-9Q2D",
     "device": {
       "platform": "ANDROID",
       "model": "vivo 1902",
       "osVersion": "9",
       "appVersion": "1.0.0+1",
       "fcmToken": "<fcm registration token>"
     }
   }
   ```
4. Brain responds `201`:
   ```json
   {
     "data": {
       "deviceId": "dev_a1b2c3",
       "deviceToken": "<opaque, long-lived>",
       "refreshToken": "<opaque>",
       "tokenExpiresAt": "2026-10-05T00:00:00Z",
       "wsUrl": "wss://brain.example.com/v1/companion/stream",
       "config": {
         /* see §7 config object */
       }
     }
   }
   ```
5. Companion stores `deviceToken` + `refreshToken` in `flutter_secure_storage` and opens the WSS.

### 3.2 Token refresh

`POST /v1/companion/token/refresh` with `{ "refreshToken": "…" }` → new `deviceToken` (+ maybe rotated `refreshToken`). Companion refreshes when `tokenExpiresAt` is < 24 h away, or on a `401` from REST / a `4401` WSS close code.

### 3.3 Auth on each channel

- **REST:** `Authorization: Bearer <deviceToken>`.
- **WSS:** `Authorization: Bearer <deviceToken>` header on the upgrade request; if headers aren't available, first frame after connect MUST be `hello` (§4.2) carrying the token, sent within 5 s or the brain closes with `4401`.
- **FCM:** payload is opaque to FCM; companion validates it came with a matching `deviceId` and treats it only as a trigger, never as trusted data.

### 3.4 Revocation / re-pair

Brain may revoke a device. WSS then closes with `4403`; REST returns `403 FORBIDDEN`. Companion wipes tokens, drops to "unpaired", and shows the pairing screen. Losing the tokens locally (Funtouch "clear data") has the same effect.

### 3.5 OPEN (§10-1)

Pairing-code flow above vs. full account login (OAuth/username-password) on the companion. Plan assumes **pairing code**; the companion has no user-account concept, only a device identity.

---

## 4. WSS framing

### 4.1 Envelope

Every WSS message is one JSON object:

```json
{
  "v": 1,
  "id": "msg_<ulid>",          // unique per message, generated by sender
  "type": "<frame type>",       // see §4.2
  "ts": "2026-09-05T10:30:00Z",
  "ack": "msg_<ulid>",          // OPTIONAL — id of the frame this acknowledges
  "payload": { … }              // shape depends on type
}
```

- **Every command (brain→companion) and every event that changes state (companion→brain) MUST be acknowledged** with a frame `{ "type": "ack", "ack": "<id>", "payload": { "ok": true } }` or `{ "ok": false, "error": { … } }`.
- Sender retries un-acked frames after 5 s, up to 3 times, then queues to the outbox (companion) / marks the device stale (brain).
- **Idempotency:** receivers dedupe by `id` for at least 10 minutes. Re-delivered frames are acked but not re-executed.

### 4.2 Frame types

| `type`          | Direction | Meaning                                                                                                   |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| `hello`         | C→B       | first frame after connect: `{ deviceId, deviceToken, appVersion, resumeFrom? }`                           |
| `welcome`       | B→C       | `{ sessionId, config, missed: [frames] }` — `missed` replays commands sent while offline (capped, see §8) |
| `ping` / `pong` | both      | keepalive, every 30 s; 3 missed pongs → reconnect                                                         |
| `ack`           | both      | acknowledgement (§4.1)                                                                                    |
| `event`         | C→B       | a companion event — `payload.event` is one of §5                                                          |
| `command`       | B→C       | a brain command — `payload.command` is one of §6                                                          |
| `error`         | both      | out-of-band error, `payload.error` per `error-handling.md`                                                |

So a companion event looks like:

```json
{ "v":1, "id":"msg_01J…", "type":"event", "ts":"…",
  "payload": { "event": "VOICE_INPUT", "transcript": "what's my day look like", … } }
```

---

## 5. Companion → Brain events (`payload.event`)

| event                  | payload                                                                                                                           | emitted when                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `HEARTBEAT`            | `{ battery: 0-100, charging: bool, accessibilityOn: bool, dockState: "AWAKE"\|"ASLEEP", wsRttMs: int, appVersion }`               | every 60 s over WSS                                                                        |
| `VOICE_INPUT`          | `{ transcript, locale, wantsSpoken: true, foregroundApp?: "com.whatsapp", requestId }`                                            | wake word fired and STT capture completed                                                  |
| `WAKE_TRIGGERED`       | `{ requestId }`                                                                                                                   | wake word detected (sent immediately, before STT finishes, so the brain can pre-warm)      |
| `AGENT_SCREEN`         | `{ goalId, step: int, nodes: [ScreenNode], compact: "<serialized dump>" }`                                                        | each think-step of a running goal (see §8-agent) — unless in local-fallback                |
| `AGENT_STEP_RESULT`    | `{ goalId, step: int, action: <ActionName>, ok: bool, changed: bool, screenshotB64?: string, note?: string }`                     | after the companion executes an `AGENT_ACTION`                                             |
| `GOAL_FINISHED`        | `{ goalId, status: "SUCCESS"\|"FAILED"\|"CANCELLED", steps: int, summary, usedLocalFallback: bool }`                              | a goal ends                                                                                |
| `GOAL_REJECTED`        | `{ goalId, reason: "BUSY"\|"ACCESSIBILITY_OFF"\|"UNSUPPORTED" }`                                                                  | companion can't start a `RUN_GOAL`                                                         |
| `PRESENCE_LOCAL`       | `{ state: "HOME"\|"AWAY", source: "BLE"\|"MANUAL"\|"VOICE", rssi?: int, confidence: 0.0-1.0 }`                                    | only when the brain's presence is stale/absent and the local fallback changes (§ presence) |
| `ANNOUNCEMENT_RESULT`  | `{ announcementId, outcome: "SPOKEN"\|"QUEUED_NOT_PRESENT"\|"SUPPRESSED_QUIET_HOURS"\|"ACKED_BY_USER"\|"SNOOZED", snoozeUntil? }` | after handling an `ANNOUNCE`                                                               |
| `NOTIFICATION_SEEN`    | `{ pkg, title, text, category?, postedAt, key }`                                                                                  | opt-in notification forwarder (§ off by default)                                           |
| `SCREEN_POWER_CHANGED` | `{ state: "AWAKE"\|"ASLEEP", cause: "VOICE"\|"AUTO_SLEEP_AWAY"\|"COMMAND"\|"CHARGING_RULE" }`                                     | screen power state transitions                                                             |
| `COMPANION_ERROR`      | `{ area, message, fatal: bool }`                                                                                                  | a background failure worth the brain knowing (surface in Companion health too)             |
| `CONFIG_APPLIED`       | `{ configVersion }`                                                                                                               | companion has applied a pushed `CONFIG`                                                    |

`ScreenNode` mirrors the app's existing model:

```json
{
  "index": 3,
  "label": "Search",
  "class": "android.widget.EditText",
  "cx": 360,
  "cy": 210,
  "clickable": true,
  "editable": true,
  "scrollable": false,
  "checkable": false
}
```

---

## 6. Brain → Companion commands (`payload.command`)

| command              | payload                                                                                                                                                              | effect                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SPEAK`              | `{ text, ssml?, interrupt?: bool, requestId? }`                                                                                                                      | TTS via Embodiment; `requestId` ties it to a `VOICE_INPUT`                                                                     |
| `RUN_GOAL`           | `{ goalId, goal: "open WhatsApp and message Alice", constraints?: { maxSteps?, forbid?: [ActionName], noPurchases?: true }, origin: "VOICE"\|"SCHEDULE"\|"MANUAL" }` | hand to `TaskExecutor`; companion replies `GOAL_REJECTED` or begins the agent loop (§8)                                        |
| `AGENT_ACTION`       | `{ goalId, step: int, action: <ActionObject>, reasoning?: string }`                                                                                                  | the brain's answer to an `AGENT_SCREEN`; companion executes exactly this one action                                            |
| `CANCEL_GOAL`        | `{ goalId }`                                                                                                                                                         | abort a running goal → `GOAL_FINISHED status=CANCELLED`                                                                        |
| `ANNOUNCE`           | `{ announcementId, text, priority: "LOW"\|"NORMAL"\|"HIGH"\|"URGENT", requiresPresence?: bool, quietHoursOverride?: bool, expiresAt?, speakSsml?: string }`          | enqueue; speak when gates pass (§ presence/quiet-hours); always reply `ANNOUNCEMENT_RESULT`                                    |
| `CARD_PUSH`          | `{ cards: [Card], replace: bool }`                                                                                                                                   | dock renders these; `replace:true` swaps the whole set, else merge by `card.id`                                                |
| `CARD_CLEAR`         | `{ ids?: [string] }`                                                                                                                                                 | remove listed cards, or all if `ids` omitted                                                                                   |
| `PRESENCE`           | `{ state: "HOME"\|"AWAY", confidence: 0.0-1.0, source: string }`                                                                                                     | **authoritative** presence; overrides local until a newer `PRESENCE` or a staleness timeout                                    |
| `WAKE` / `SLEEP`     | `{ reason? }`                                                                                                                                                        | screen power                                                                                                                   |
| `CONFIG`             | `{ configVersion, config: {…} }` (§7)                                                                                                                                | apply + persist; reply `CONFIG_APPLIED`                                                                                        |
| `REQUEST_SCREENSHOT` | `{ requestId }`                                                                                                                                                      | companion replies with an `event` `AGENT_STEP_RESULT`-style frame carrying `screenshotB64` (or a dedicated `SCREENSHOT` event) |
| `PING_DIAG`          | `{ requestId }`                                                                                                                                                      | companion replies with a full `HEARTBEAT` immediately                                                                          |
| `REVOKE`             | `{ reason }`                                                                                                                                                         | companion wipes tokens, unpairs                                                                                                |

### 6.1 `ActionObject` (matches the app's existing `TaskStep` vocabulary)

```json
{ "action": "CLICK_TEXT", "params": { "text": "Search" } }
```

| `action`      | `params`                                       |
| ------------- | ---------------------------------------------- |
| `CLICK_TEXT`  | `{ text }`                                     |
| `CLICK_AT`    | `{ x, y }`                                     |
| `TYPE_TEXT`   | `{ text }`                                     |
| `PRESS_ENTER` | `{}`                                           |
| `SCROLL`      | `{ direction: "UP"\|"DOWN"\|"LEFT"\|"RIGHT" }` |
| `SWIPE`       | `{ startX, startY, endX, endY, durationMs? }`  |
| `PRESS_BACK`  | `{}`                                           |
| `PRESS_HOME`  | `{}`                                           |
| `OPEN_APP`    | `{ app: "<name or package>" }`                 |
| `WAIT`        | `{ ms }` (≤ 10000)                             |
| `DONE`        | `{}` — goal complete                           |

> The companion maps these 1:1 onto the current wire vocabulary in
> [lib/services/ai_service.dart](../lib/services/ai_service.dart) / `task_step.dart`
> (`click_text`, `click_at`, …). Casing is normalised at the boundary.

### 6.2 `Card`

```json
{ "id": "card_reminder_88",
  "kind": "REMINDER" | "TASK" | "HEALTH" | "CALENDAR" | "INFO" | "ALERT",
  "title": "Call the bank",
  "subtitle": "Due 4:00 PM",
  "body?": "Ask about the statement charge",
  "accent?": "AMBER" | "BLUE" | "GREEN" | "RED" | "NEUTRAL",
  "icon?": "phone",
  "at?": "2026-09-05T16:00:00Z",
  "actions?": [ { "id": "snooze", "label": "Snooze 10m" } ],   // taps come back as CARD_ACTION event
  "expiresAt?": "…" }
```

Cards are **display-only** state owned by the brain. Card action taps are reported as an event
`CARD_ACTION { cardId, actionId }` (add to §5 when card actions are used).

---

## 7. Config object

Pushed at pairing, in `welcome`, and via `CONFIG`. Companion persists the last-applied version and
re-applies on boot. All keys optional; unknown keys ignored (forward-compatible).

```json
{
  "wakePhrase": "Hey Genie",
  "wakeWordEnabled": true,
  "quietHours": { "start": "22:30", "end": "07:00", "tz": "Asia/Kolkata" },
  "presence": { "staleAfterSec": 300, "trustLocalFallback": true },
  "screenPower": { "autoSleepOnAwaySec": 120, "stayAwakeWhileCharging": false },
  "agent": {
    "maxSteps": 15,
    "stepDelayMs": 1200,
    "sendScreenshots": "ON_REQUEST"
  }, // ALWAYS | ON_REQUEST | NEVER
  "heartbeatSec": 60,
  "localFallback": { "enabled": true },
  "dock": { "theme": "SYSTEM", "showClock": true, "cardLimit": 6 },
  "notificationForwarding": { "enabled": false, "packages": [] }
}
```

---

## 8. Sub-protocols

### 8.1 Voice round-trip

```
Companion: event WAKE_TRIGGERED {requestId}
Companion: event VOICE_INPUT {requestId, transcript, wantsSpoken:true, foregroundApp}
Brain:     (assembles context: tasks, calendar, health, history)
Brain:     command SPEAK {requestId, text:"You have 3 meetings…"}          // plain answer
   — or —
Brain:     command RUN_GOAL {goalId, goal:"…", origin:"VOICE"}             // it's an action request
Companion: ack + (SPEAK → TTS)  /  (RUN_GOAL → §8.2)
```

If the brain doesn't answer a `VOICE_INPUT` within `agent.voiceTimeoutSec` (default 8 s), the
companion falls back to the local LLM (§9) and speaks that, tagging `GOAL_FINISHED`/reply with
`usedLocalFallback:true` for later reconciliation.

### 8.2 Agent goal loop (brain-driven "think")

```
Brain:     command RUN_GOAL {goalId, goal, constraints}
Companion: (accessibility gate; if off → event GOAL_REJECTED {ACCESSIBILITY_OFF}; stop)
loop, step = 1..maxSteps:
   Companion: event AGENT_SCREEN {goalId, step, nodes, compact}
   Brain:     command AGENT_ACTION {goalId, step, action, reasoning}
   Companion: (execute one action)
   Companion: event AGENT_STEP_RESULT {goalId, step, action, ok, changed, screenshotB64?}
   if action == DONE  → break
   if CANCEL_GOAL received → break
Companion: event GOAL_FINISHED {goalId, status, steps, summary}
```

- The companion keeps its existing safeguards locally (parse retries, repeat-action detection, `RecoveryEngine`) and reports them via `AGENT_STEP_RESULT.note`; the brain may also steer with the next `AGENT_ACTION`.
- Screenshots included per `config.agent.sendScreenshots`. `ON_REQUEST` → only after `REQUEST_SCREENSHOT`.
- **Skill memory:** if the companion has a memorised macro for `goal`, it MAY replay locally with zero brain round-trips, still emitting `AGENT_STEP_RESULT` + `GOAL_FINISHED` (with `usedLocalFallback:true`). Brain can disable this via `config.agent` (add `allowSkillReplay` when needed).

### 8.3 Announcement gating

`ANNOUNCE` → companion evaluates, in order:

1. `expiresAt` passed → `SUPPRESSED` (reported as `ANNOUNCEMENT_RESULT outcome=…`, use `EXPIRED`).
2. quiet hours active and not `quietHoursOverride` and priority < `URGENT` → `SUPPRESSED_QUIET_HOURS`, hold until quiet hours end (unless expired).
3. `requiresPresence` and presence != HOME → `QUEUED_NOT_PRESENT`, speak on next HOME transition.
4. else → speak now → `SPOKEN`.
   User can say "ok" / "snooze" → `ACKED_BY_USER` / `SNOOZED {snoozeUntil}`.

### 8.4 Presence resolution

- `PRESENCE` from the brain is authoritative and cached with its `ts`.
- If the last `PRESENCE` is older than `config.presence.staleAfterSec`, the companion uses its local signal (BLE anchor / manual / voice `sleep`) and emits `PRESENCE_LOCAL` on change.
- When a fresh `PRESENCE` arrives it immediately wins.
- Local BLE anchor is user-selected (Amazfit now, Galaxy Watch 4 later — see plan §9-4).

---

## 9. Degraded mode (brain unreachable)

Trigger: WSS down AND REST failing, or explicit `config.localFallback.enabled` path.

- **Voice Q&A / simple goals** → local fallback LLM ([lib/services/ai_service.dart](../lib/services/ai_service.dart), single provider, key in secure storage) using the app's existing on-device system prompt.
- **Presence** → local BLE + manual + voice.
- **Announcements** already queued still fire on their gates; no new ones arrive.
- **Cards** → last cached set shown with a "stale since HH:MM / offline" banner.
- **Outbound events** → appended to `hub_outbox` (sqflite, FIFO, capped). On reconnect: `hello {resumeFrom}` → then `POST /v1/companion/events` (batch) or replay over WSS in order; brain dedupes by `id`.
- `GOAL_FINISHED` / replies produced offline carry `usedLocalFallback:true` so the brain can reconcile history.

---

## 10. REST endpoints (secondary)

All under `/v1`, bearer auth, responses in the `{ "data": … }` envelope, errors per `error-handling.md`.

| Method   | Path                          | Purpose                                                                                                           |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/v1/companion/pair`          | §3.1                                                                                                              |
| `POST`   | `/v1/companion/token/refresh` | §3.2                                                                                                              |
| `GET`    | `/v1/companion/config`        | fetch current config (companion polls on boot if WSS not up yet)                                                  |
| `GET`    | `/v1/companion/cards`         | current dock cards (paginated per api-design.md)                                                                  |
| `POST`   | `/v1/companion/events`        | batch outbox replay: `{ "events": [ <envelope>, … ] }` → `{ "data": { "accepted": [ids], "duplicates": [ids] } }` |
| `POST`   | `/v1/companion/heartbeat`     | fallback heartbeat when WSS is down                                                                               |
| `DELETE` | `/v1/companion/pairing`       | companion-initiated unpair                                                                                        |

Rate limiting, `Idempotency-Key` on the `POST`s, and `Sunset` headers all per `api-design.md`.

---

## 11. FCM fallback payloads

Data-only, high priority. The companion treats these as **triggers**, re-establishes WSS, then
receives the real command over the socket.

```json
{ "data": {
    "kind": "RECONNECT" | "COMMAND",
    "deviceId": "dev_a1b2c3",
    "hint": "URGENT_ANNOUNCE" | "RUN_GOAL" | "CONFIG" | "",
    "cmdId": "msg_…"        // if kind=COMMAND, the brain replays this frame over WSS on connect
} }
```

No user content in the FCM payload (it transits Google). `URGENT` announcements: FCM wakes the
app, WSS reconnects, `welcome.missed` carries the `ANNOUNCE`.

---

## 12. Errors

Per `~/.claude/rules/error-handling.md`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "…",
    "details": [{ "field": "…", "message": "…" }]
  }
}
```

WSS close codes: `4401` token invalid/expired · `4403` device revoked · `4409` another session for this device · `4400` bad `hello` · `1013` try again later (brain overloaded → companion backs off with jitter).
Codes used: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `RESOURCE_NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

---

## 13. Versioning

- Envelope `v` = protocol major. This doc is `v:1`.
- New event/command types and new optional fields are non-breaking and may ship in `v:1`.
- Removing/renaming a type or changing a field's meaning → `v:2`; companion sends its supported
  range in `hello { protocol: { min: 1, max: 1 } }`; brain replies in `welcome` with the chosen `v`.
- The companion **ignores unknown command types** (acks with `ok:false, error.code="UNSUPPORTED"`)
  and **ignores unknown fields** — never crash on forward-compat input.

---

## 14. Open items (blocking Phase 3 build — decide during Azure design)

| #   | Question                                                                            | Plan assumption                                                            |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Auth: pairing code vs. account login on the companion                               | **Pairing code** → device token; re-pair on token loss                     |
| 2   | WSS tech: raw WebSocket (this doc) vs Azure SignalR Service vs Web PubSub           | **Raw WebSocket** with the §4 envelope                                     |
| 3   | Exact `Card` kinds + fields the brain will actually push                            | draft in §6.2                                                              |
| 4   | `config` keys the brain will actually send                                          | draft in §7                                                                |
| 5   | Screenshot cadence: `ALWAYS` / `ON_REQUEST` / `NEVER` default                       | **`ON_REQUEST`**                                                           |
| 6   | Does the brain want full `nodes[]` every step, or only `compact` string (bandwidth) | send **both**; brain can request companion drop `nodes[]` via config later |
| 7   | Skill-memory local replay allowed, or must every step go through the brain          | **allowed**, brain can disable via config                                  |
| 8   | Max size / retention of `welcome.missed` and `hub_outbox`                           | outbox cap ~500 events, oldest-drop; `missed` cap ~100, older → REST sync  |
