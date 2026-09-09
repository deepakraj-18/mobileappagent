# QA060 — Funtouch background survival

**Device:** Vivo Y17 (`vivo 1902`) · serial `NR4DLF4HEIIVPNW4` · API 28 / Funtouch  
**Package:** `com.privateagent`  
**Date probed:** 2026-09-09  
**Related:** `docs/DEVICE_PROVISIONING.md`, FD060 onboarding whitelist step, SC004/SC005, BD033

Use `.\scripts\qa060-survival-probes.ps1 -Serial NR4DLF4HEIIVPNW4` for the automated slice.

---

## 1. Scenario matrix

| # | Scenario | How to run | Pass criteria | Status (2026-09-09) |
|---|---|---|---|---|
| A | Screen off while docked | Toggle Companion Mode docked → FGS notification visible → `adb shell input keyevent 26` | FGS notification (`id=42001`, channel `companion_runtime`) still present; process not killed after ≥5 min | **Partial** — screen went `Asleep` / `Display Power: OFF`; companion notification still listed. Full 5–30 min soak not completed in this session |
| B | Overnight (charging) | Docked + plugged in + whitelist complete → leave 8+ h | Notification still present next morning; hub reconnects or FCM wakes | **Not run** — requires overnight wall-clock. Protocol below |
| C | Force-stop | `adb shell am force-stop com.privateagent` | Documented: process dead; **force-stop intentionally disables restart until next launch** on stock Android. After in-app relaunch / docked toggle, FGS returns | **Observed** — after force-stop, `dumpsys activity services com.privateagent` empty. Stale `42001` notification can linger in dumpsys; treat process death as the signal, not the notif row alone. Relaunch restores companion path |
| D | Reboot | Real device reboot with `pa_companion.xml` `docked=true` | `BootReceiver` starts FGS when docked | **Not run** — do not reboot without operator consent. `BOOT_COMPLETED` cannot be faked from shell (`SecurityException`). Prefs confirmed: `docked=true` present |
| E | WSS drop → FCM recovery | Kill WSS / airplane mode briefly; send FCM `FORCE_RECONNECT` | `fcmReceiver` → `HubRuntime.retry()` | **Blocked** — `fcmReceiver.ts` notes live token registration waits on IF001 real `google-services.json`. Unit routing covered by `__tests__/fcmReceiver.test.ts` |

---

## 2. Probe findings (this session)

### 2.1 Package / runtime

- `pm path com.privateagent` → installed (`versionName=1.0`, `minSdk=26`, `targetSdk=36`).
- `BootReceiver` registered for `BOOT_COMPLETED` / `LOCKED_BOOT_COMPLETED` / `QUICKBOOT_POWERON`.
- `AgentAccessibilityService` declared; **`settings get secure enabled_accessibility_services` was empty** → a11y **off**. Fix: FD060 a11y step / `DEVICE_PROVISIONING` §1.
- Shared prefs `pa_companion.xml` contains `<boolean name="docked" value="true" />` → BootReceiver **would** start FGS after a real reboot.

### 2.2 Notifications / OEM pressure

- Channel `companion_runtime` exists; `mFgServiceShown=true`.
- dumpsys showed `moreNotificationsEnabled=false` for the package and repeated `muted`/`demoted` post_frequency rows — Funtouch may be **throttling / demoting** the companion notification. Mitigations:
  1. Settings → Apps → PrivateAgent → Notifications → allow
  2. Complete **Autostart + High background power** whitelist (`DEVICE_PROVISIONING` §3, FD060 Vivo step)
  3. Pin app in Recents
- Package **not** present on `dumpsys deviceidle whitelist`. Rely on Funtouch UI whitelist, not Doze whitelist APIs.

### 2.3 Force-stop vs START_STICKY

- `CompanionForegroundService.onStartCommand` returns `START_STICKY` (code review).
- **Force-stop** is stronger than a normal kill: Android will not restart the app until the user (or a privileged broadcast) starts it again. Expect FGS gone after `am force-stop`; recovery = launch app / BootReceiver after reboot if docked.
- Shell `am start-foreground-service -n …CompanionForegroundService` failed: service not exported (`Requires permission not exported`). Correct — only in-app `CompanionRuntime.start()` / BootReceiver may start it.

### 2.4 FCM / WSS

- JS path: `startFcmReceiver` → `FORCE_RECONNECT` / `WAKE_RECONNECT` → `HubRuntime.retry()`; compact commands applied when possible.
- **End-to-end FCM on this phone is blocked** until Firebase is real (IF001). Document as open QA debt; do not claim WSS↔FCM recovery on-device yet.

---

## 3. Overnight protocol (operator)

1. Complete FD060 (a11y ON, Vivo ack, pair if available).
2. Confirm whitelist: Autostart + High background power + notifications allowed + Recents lock.
3. Enable Companion Mode (docked); confirm notification “PrivateAgent companion / Docked · runtime active”.
4. Leave **plugged in**, screen can sleep.
5. Next morning:
   - Notification still present?
   - Open app → Hub connection chip state?
   - `adb shell dumpsys activity services | findstr CompanionForeground`
6. Log pass/fail + any Funtouch setting that was missing into §5 below.

---

## 4. Reboot protocol (operator)

1. Ensure docked (`pa_companion` pref true — Companion Mode on).
2. Reboot phone normally (not `adb reboot` unless consented).
3. After unlock: FGS notification should return via `BootReceiver` without opening the app.
4. If missing: open Autostart / battery screens again; re-toggle Companion Mode.

---

## 5. Breakages & whitelist fixes log

| Date | Breakage | Fix applied |
|---|---|---|
| 2026-09-09 | Accessibility services empty — automation/presence of agent features will fail | Enable via FD060 / Accessibility settings |
| 2026-09-09 | Notification demotion / `moreNotificationsEnabled=false` | Allow app notifications; complete Funtouch background whitelist |
| 2026-09-09 | Not on deviceidle whitelist | Expected on Y17; use iManager Autostart + High background power instead |
| 2026-09-09 | Cannot simulate `BOOT_COMPLETED` from adb | Use real reboot for BootReceiver proof |
| 2026-09-09 | FCM E2E blocked (placeholder google-services) | Unblock with IF001; keep unit tests for routing |
| 2026-09-09 | Overnight soak not executed | Leave for operator morning check (protocol §3) |

---

## 6. Code anchors

| Piece | Path |
|---|---|
| FGS + `START_STICKY` | `android/.../CompanionForegroundService.kt` |
| Boot restart when docked | `android/.../BootReceiver.kt` |
| FCM → reconnect | `src/hub/fcmReceiver.ts`, `HubRuntime.start` |
| Provisioning runbook | `docs/DEVICE_PROVISIONING.md` |
| First-run whitelist UI | `src/screens/OnboardingScreen.tsx` (FD060) |
