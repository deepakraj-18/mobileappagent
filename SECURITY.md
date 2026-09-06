# PrivateAgent — Security model (SC001)

**Date:** 2026-09-06  
**Scope:** Post-IF004 React Native scaffold (`com.privateagent`)  
**Status:** Decisions recorded for review — not a substitute for SC002 (permission trim)

Telegram is **not** part of this product. Do not treat any historical Telegram bot / chatId
surface as in-scope attack surface.

---

## 1. Verified permission inventory (current `AndroidManifest.xml`)

Re-checked against `android/app/src/main/AndroidManifest.xml` on branch
`sc/SC001-threat-model` (post-IF004). All of these are present today:

| # | Declaration | Reach / notes |
|---|---|---|
| 1 | `INTERNET` | Network (LLM / future hub) |
| 2 | `ACCESS_NETWORK_STATE` | Connectivity checks |
| 3 | `WAKE_LOCK` | Keep CPU awake while agent runs |
| 4 | `SYSTEM_ALERT_WINDOW` | Draw over other apps |
| 5 | `FOREGROUND_SERVICE` | Long-running companion process |
| 6 | `FOREGROUND_SERVICE_SPECIAL_USE` | FGS subtype for companion / overlay-style use |
| 7 | `QUERY_ALL_PACKAGES` | Enumerate installed apps (launcher / automation) |
| 8 | `RECORD_AUDIO` | Microphone (voice — planned, not yet wired in RN UI) |
| 9 | `READ_CONTACTS` | Read contacts |
| 10 | `WRITE_CONTACTS` | Write contacts |
| 11 | `POST_NOTIFICATIONS` | Notifications (API 33+) |
| 12 | `VIBRATE` | Haptics / alerts |
| 13 | `WRITE_SETTINGS` | Modify system settings (protected) |
| 14 | `MODIFY_AUDIO_SETTINGS` | Volume / audio routing |
| 15 | `SET_ALARM` | Alarm intents |
| 16 | `BIND_ACCESSIBILITY_SERVICE` (on `AgentAccessibilityService`) | **Read and act on every screen in every app** |

Also noted (not a `<uses-permission>`, but security-relevant):

- `AgentAccessibilityService` is declared `android:exported="true"` with
  `android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"` (system-gated bind).
- `MainActivity` is `exported="true"` (launcher) — expected.
- `android:usesCleartextTraffic` is enabled via manifest placeholder — relevant if any HTTP
  endpoints are used; secrets must never ride cleartext.

SC002 will decide which of the above stay for day-one features. This document does **not**
remove permissions.

---

## 2. Threat model

### (a) Physical access to an unlocked device

**What the attacker can do**

- Open PrivateAgent and drive any UI that the in-app agent exposes (today: bridge status /
  open accessibility settings; later: goals, voice, dock).
- If the accessibility service is already enabled for PrivateAgent, any in-app path that
  calls `AccessibilityBridge` can dump screen content and inject taps/swipes/typing —
  including over banking / password-manager UIs currently on screen.
- Read whatever the app has stored locally (settings, future outbox/cache, action logs)
  without defeating encryption at rest if we store plaintext.
- Change system settings the app is allowed to change (`WRITE_SETTINGS`, audio, etc.) via
  future features that use those APIs.
- Grant or revoke the accessibility service in system Settings (user already unlocked).

**What they do *not* get “for free” from PrivateAgent alone**

- Remote control from another network (no external control channel — see §3).
- Bypass of Android’s lock screen if the device is locked (out of scope of this model;
  assume unlocked as stated).

**Mitigations (required going forward)**

- Biometric / device-credential app lock when companion features land (planned Phase 1).
- Destructive / irreversible agent actions require an **explicit in-app confirmation** step
  (§5) — never one tap from a prior screen without re-confirming high-impact actions.
- Prefer encrypting sensitive local state; never store API keys in plaintext files.

### (b) A malicious app on the same device

**What the attacker can try**

- Enumerate PrivateAgent as installed; attempt to start exported components.
- Attempt to bind or confuse the accessibility service — binding requires
  `BIND_ACCESSIBILITY_SERVICE`, which normal third-party apps do not hold; the system is the
  binder. A malicious app **cannot** simply call our service as if it were a public API.
- Abuse **overlay** (`SYSTEM_ALERT_WINDOW`) *if it has that permission itself* to socially
  engineer the user (classic tapjacking / fake UI) while PrivateAgent or Settings is open —
  this is a platform-wide class of attack, amplified because our agent can act on whatever
  is visible.
- Read world-readable logs or misuse accessibility *of its own* if the user also enables a
  malicious accessibility service (user-granted; outside our process).
- If our native module or JS accidentally exposes an exported, unauthenticated IPC surface
  later, that would expand this class — **do not add exported receivers/services/providers
  without an allow-list and a task**.

**What they gain if successful**

- Not automatic control of our accessibility gestures via our process, unless we ship a
  buggy exported bridge.
- Significant risk if the user enables a *second* malicious accessibility service, or if we
  later add an unauthenticated remote/local IPC trigger.

**Mitigations**

- Keep control **in-app only** (§3) — no broadcast/intent “run goal” API without auth.
- Do not widen `exported=true` surfaces without review.
- Confirm destructive actions in-app (§5).
- Action audit log (§6) so post-compromise forensics have a trail.

### (c) Compromise of PrivateAgent itself (bug in app / accessibility bridge)

**What the attacker gains**

- Full use of every granted permission above from inside our UID.
- Via `AgentAccessibilityService` + `AccessibilityBridge`: **observe and operate any
  foreground app’s UI**, including reading on-screen secrets (OTP, passwords if visible),
  approving payments, sending messages, changing settings.
- Network exfiltration if `INTERNET` is used by compromised JS/native code (future LLM/hub
  clients amplify this).
- Contact graph read/write if those permissions remain and features call them.
- Microphone capture if `RECORD_AUDIO` paths are reachable.

**This is the catastrophic case.** A single RCE, malicious dependency, or logic bug that
auto-runs agent steps without confirmation is equivalent to a human sitting at the phone
with Settings → Accessibility already granted to us.

**Mitigations**

- No unauthenticated external trigger (§3).
- Mandatory confirmation for destructive/irreversible actions (§5).
- Least privilege over time (SC002) — drop contacts / write-settings / etc. if unused.
- Secrets only in Keystore / secure storage (§4); never log secrets.
- Local action log (§6); fail closed when the accessibility service is off.
- Treat the native module surface as security-critical code review forever.

---

## 3. Control channel — **decision: in-app only**

**Decision (2026-09-06, SC001):** The only authorized way to trigger agent actions is
**inside the PrivateAgent app UI** (and later, in-app voice *within this process* once
Phase 2 ships). There is **no remote or cross-app control channel**.

| Option | Status |
|---|---|
| Telegram / chat bots | **Removed — not returning in this task** |
| Other remote push / third-party messenger | **Not adopted** |
| Exported Intent / bound service for other apps | **Not adopted** |
| **In-app UI only** | **Selected** |

**Remote allow-list / deny-by-default auth:** **Not applicable** — there is no remote
caller. If a future product decision adds an external channel (e.g. Azure hub commands in
Phase 3), that **must** come with an explicit allow-list and deny-by-default design in a
new security task; it is **not** implied by this document.

**Why in-app only is acceptable here:** With Telegram gone, inventing a replacement remote
channel would be a product call (`BD002` / hub phases), not an implementer default. The
current scaffold has no outside trigger; documenting that as intentional keeps the
catastrophic surface (§2c) from being one network message away.

---

## 4. Secrets storage — policy

- API keys, device tokens, refresh tokens, and any bearer credentials **must** be stored in
  **Android Keystore–backed secure storage** (e.g. `react-native-keychain` or equivalent).
- **Never** store secrets in `AsyncStorage`, plaintext SharedPreferences, source, CI logs,
  or tracked files.
- **Never** log secret values (error-handling rule).

(IF004 scaffold does not yet ship a settings/secrets module; this policy binds all follow-on
work.)

---

## 5. Destructive / irreversible actions — policy

Examples (non-exhaustive): sending messages, confirming payments, deleting data, changing
security settings, locking the device, mass contact mutation, granting permissions.

**Rule:** Such actions require an **explicit in-app confirmation** (dedicated confirm UI /
biometric step as features land). A single gesture, voice utterance, or future hub message
must **not** be enough without that confirmation gate.

---

## 6. Action audit log — policy

Every agent action executed on-device (bridge calls that mutate UI or read screen dumps used
to drive a goal, plus high-level goal start/finish) **must** be logged locally with at least:

- UTC timestamp  
- Action type / method name  
- Outcome (success / failure / rejected)  
- Correlation id for the goal/session when available  

Logs must **not** include secrets, full password fields, or raw token material. Screen-dump
payloads should be omitted or heavily redacted in the durable log.

(Implementation of the log store is follow-on work; the requirement is binding from SC001.)

---

## 7. Distribution — **decision: sideload-only**

**Decision (2026-09-06, SC001):** PrivateAgent is **sideload-only** (ADB / internal APK
distribution). It will **not** be submitted to the Google Play Store.

**Rationale:** Google’s accessibility policies effectively rule out Play distribution for
general-purpose UI automation agents; `QUERY_ALL_PACKAGES` and overlay permissions compound
review risk. Personal / fleet sideload matches the desk-companion use case (Vivo Y17 body).

---

## 8. Summary for reviewers

| Topic | Recorded answer |
|---|---|
| Threat model (a)(b)(c) | §2 |
| Control channel | **In-app only** — no remote trigger (§3) |
| Remote allow-list | **N/A** until a remote channel is product-approved |
| Secrets | Keystore / secure storage only (§4) |
| Destructive actions | In-app confirmation required (§5) |
| Audit log | Required; timestamped; no secrets (§6) |
| Play Store | **Sideload-only** (§7) |
| Manifest | Re-verified; 15 `<uses-permission>` + a11y bind on service (§1) |
