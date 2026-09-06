# PrivateAgent / deskcompanianapp — progress

## IF004 baseline (2026-09-06)

**Stack:** React Native Community CLI (not Expo) · RN **0.82.1** · React **19.1.1** · TypeScript

**Scaffold command used:**
```text
npx @react-native-community/cli@15.1.3 init PrivateAgent --version 0.82.1 --directory … --skip-git-init --pm npm
```
(Note: `@latest` / RN 0.87 template failed with missing `template.config.js`; pinned to 0.82.1 to match `lifeosmobilev2`.)

**Flutter archive verified before delete:**
- Tag `archive/flutter-final` → `f7fae81` (on origin)
- Filesystem copy `E:\Projects\LifeOS\_archive\deskcompanianapp-flutter-2026-09-06\`

**Preserved:**
- `AgentAccessibilityService.kt` (package now `com.privateagent`; Flutter `MethodChannel.Result` replaced with framework-neutral `AccessibilityResult`)
- Accessibility service config + permission set in `AndroidManifest.xml` (Telegram/overlay Flutter plugin services removed)

**Native bridge:** `AccessibilityBridge` (`AccessibilityModule` + `AccessibilityPackage`) registered in `MainApplication`

**Checks:**
| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `./gradlew assembleDebug` | BUILD SUCCESSFUL |
| Install + launch on Vivo Y17 (`NR4DLF4HEIIVPNW4`, Android 9 / API 28) | Success (`com.privateagent/.MainActivity`) |
| `minSdkVersion` | **26** |

**Out of scope (intentional):** porting Dart services, Telegram, hub client — follow-on phases in `.claude-context/tasks/INDEX.md`.
