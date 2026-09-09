# Device provisioning — Vivo Y17 desk companion (IF002)

**Target hardware:** Vivo Y17 (`vivo 1902`), Android 9 / API 28, Funtouch OS.  
**Verified ADB serial (2026-09-06):** `NR4DLF4HEIIVPNW4`  
**Package:** `com.privateagent` · Distribution: **sideload only** (see `SECURITY.md` §7)

Use this checklist whenever the phone is wiped, a new debug build is installed, or the
companion stops surviving overnight.

---

## 0. Prerequisites

- USB debugging enabled (Settings → System → Developer options).
- `adb` on the PC PATH; phone authorized for this machine.
- Debug APK built: `cd android && .\gradlew.bat :app:assembleDebug`  
  (or `npx react-native run-android --no-packager`).

Quick install:

```powershell
.\scripts\adb-install-debug.ps1 -Serial NR4DLF4HEIIVPNW4
```

---

## 1. Accessibility service (required)

PrivateAgent’s automation core is `AgentAccessibilityService`.

1. Open **Settings → Accessibility** (path may read “Special functions → Accessibility” on
   Funtouch).
2. Find **PrivateAgent** / the label from `accessibility_service_label`.
3. Enable the service; accept the system warning.
4. In-app: tap **Refresh bridge status** — expect `a11y=ON`.

ADB shortcut to the accessibility settings screen:

```text
adb -s NR4DLF4HEIIVPNW4 shell am start -a android.settings.ACCESSIBILITY_SETTINGS
```

---

## 2. Notifications (API 33+ / when prompted)

Companion FGS uses a persistent notification (`POST_NOTIFICATIONS`).

- On Android 13+: grant notifications when the app requests them (point of use — SC002 policy).
- On this Y17 (API 28): notification permission is install-time; still confirm
  **Settings → Apps → PrivateAgent → Notifications** are allowed (not blocked).

---

## 3. Vivo / Funtouch background survival (critical)

Funtouch aggressively kills background apps. Without these, the companion FGS and later
hub socket will die overnight.

### 3.1 Autostart

1. **iManager** (or **Settings → Apps → Autostart**) → enable **PrivateAgent**.
2. Alternate path: **Settings → Battery → High background power consumption** / **Background
   app management** → allow PrivateAgent.

### 3.2 Battery / background power whitelist

1. **Settings → Battery → High background power consumption** (wording varies by Funtouch
   version) → **PrivateAgent** → **Allow**.
2. Disable **battery saver** / **ultra power saving** while the phone is the desk body
   (or exempt PrivateAgent).
3. Prefer leaving the phone **plugged in** on the dock; companion mode assumes charging.

### 3.3 Lock-screen / recent-apps pin (optional but helpful)

- In Recents, long-press PrivateAgent → **Lock** / pin so a swipe-clear does not kill it.

### 3.4 App info deep link

```text
adb -s NR4DLF4HEIIVPNW4 shell am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:com.privateagent
```

---

## 4. Notification listener (Phase 5 / BD052)

Opt-in notification forwarding needs **Notification access** (off by default). Path:

**Settings → Apps → Special app access → Notification access → PrivateAgent**.

Also available from FD060 onboarding and Companion settings.

---

## 5. Verification

| Check             | How                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Package installed | `adb shell pm path com.privateagent`                                                            |
| App launches      | `adb shell am start -n com.privateagent/.MainActivity`                                          |
| A11y on           | In-app bridge status `a11y=ON`                                                                  |
| Autostart         | After reboot with companion docked (`pa_companion` pref), `BootReceiver` should restart FGS (QA060 §4) |
| Overnight         | Leave docked + charging; confirm companion notification still present next morning (QA060)      |
| Survival probes   | `.\scripts\qa060-survival-probes.ps1` — see [`QA060_FUNTOUCH_SURVIVAL.md`](./QA060_FUNTOUCH_SURVIVAL.md) |

---

## 6. Metro / dual-device note

If another RN app already owns port **8081**, run PrivateAgent Metro on **8082** and point
the device accordingly (`adb reverse tcp:8082 tcp:8082` when needed).
