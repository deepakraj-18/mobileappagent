# AGENTS.md — deskcompanianapp (`private_agent`)

**Read this file completely before writing any code.** It is self-contained on purpose: it
inlines every rule that governs this repository. There is no other rule file to fetch.

You are working on **this repo only**. Do not touch `LifeOSAPI`, `lifeosweb`,
`lifeosmobilev2`, `tessrag`, or `tesspms`.

---

## Who else is working on this project

You are not working alone, and you are not the architect. Requirements were gathered, a plan
approved, and this repo's tasks broken out — before any task reached you. See
`../.claude-context/plan.md` and `../.claude-context/companion-app-analysis.md` for the full
picture; read the analysis file in particular, it documents exactly what this app is and is
not, verified by direct code inspection.

**Someone else reviews your submission independently before it counts as done.** You may set
`Status: Review`. You may never set `Status: PASS`. This is enforced at commit time (parent
repo's `scripts/hooks/pre-commit`) and again in CI — not left as a convention to remember.

---

## 1. What this is — and what it is not

This is **not** a LifeOS data client. It is an on-device AI agent that operates the phone:
screen automation via an Android AccessibilityService, system control, app launching, voice
input, remote-controlled over Telegram, backed by a self-hosted Ollama model.

**It has no LifeOS integration today.** Verified 2026-09-05: no calls to `LifeOSAPI`, no
shared auth, no shared data. Its only network configuration is an Ollama `baseUrl`. Treat it
as its own product sharing this workspace — do not invent integration work that isn't in an
approved task.

**The consequence that shapes every decision here:** this app is granted
`BIND_ACCESSIBILITY_SERVICE`, meaning it can read and act on the content of *every screen in
every app on the device* — including the user's password manager and banking apps — driven
by commands that arrive over Telegram. A bug here is not cosmetic; it is a path to full
device compromise. Treat every change to permission handling, command authorization, or the
accessibility service itself as security-critical, not routine.

## 2. Stack and structure

| Layer | Technology |
|---|---|
| App | Flutter (Dart) |
| Native | Kotlin (Android), `minSdk 26` |
| AI backend | Ollama, self-hosted |
| Remote control | Telegram Bot API |

```
lib/
├── app.dart, main.dart
├── models/       data models
├── overlay/       screen overlay UI
├── screens/       home, onboarding, sessions, history, settings
├── services/
│   ├── ai_service.dart               Ollama client
│   ├── screen_automation_service.dart Drives the UI via AccessibilityService
│   ├── system_control_service.dart   Device/system settings
│   ├── app_launcher_service.dart     Launches other installed apps
│   ├── telegram_service.dart         Remote command channel — see §4
│   ├── voice_service.dart            Microphone / speech
│   ├── task_executor.dart            Agent task loop
│   ├── recovery_engine.dart          Retry / failure recovery
│   └── skill_memory_service.dart     Learned skills
├── widgets/, theme/
android/            native Kotlin, AccessibilityService, manifest permissions
```

### Commands

```bash
flutter pub get
flutter analyze
flutter build apk --debug
flutter run
```

**No verified build baseline exists yet as of 2026-09-05** — `flutter` was not on the
machine that last touched this repo. If you are the first to run these commands, that
establishment *is* the task (see `IF003`); do not assume a prior "0 errors" claim without
re-running it yourself.

---

## 3. HARD SAFETY RULES — read before any shell command

### Never run these. No task here requires them.

- `git clean` in any form
- `git reset --hard`
- `git checkout -- <path>` / `git restore <path>`
- `git rm -r`, `git stash drop`, `git stash clear`
- `git push --force`, `git branch -D`, `git filter-branch`
- `rm -rf`, `rm -r`, wildcard deletes
- Redirecting over an existing file, `truncate`, `dd`

`flutter clean` is fine — it only removes build output, not source. The git command is not.

### Before deleting anything, answer all four. Cannot answer one? Do not delete.

1. What exactly will this remove? Preview first.
2. Is it recoverable? `git log --oneline -1` — if it errors, nothing is recoverable.
3. Did I create it? The path must have been empty before you wrote there.
4. Is there a non-destructive alternative?

### If you destroy something anyway

Stop immediately. Say so at the top of your report. The task is failed regardless of whether
its criteria are met.

---

## 4. 🔴 The security surface — non-negotiable rules

- **Never widen the accessibility service's reach** without an explicit task asking for it.
  If a change seems to require it, stop and say so rather than deciding alone.
- **Never trust an incoming Telegram message by default.** Every command must be checked
  against an explicit allow-list of authorized `chatId`s, denied otherwise. See `SC001`.
- **The Telegram bot token is a secret.** Store it in Android Keystore / secure storage.
  Never in `SharedPreferences`, never in source, never in a tracked file, never in a log line.
- **Every permission in `AndroidManifest.xml` must be justified by a shipping feature.** If
  you find one that isn't (see `SC002`), flag it rather than assuming it's needed for
  something not yet built.
- **Destructive or irreversible agent actions require explicit confirmation**, not just
  receipt of a chat command. An agent that can act on every screen should never be one
  message away from an irreversible action.
- **Log command activity** (timestamp + originating `chatId`) for anything the agent
  executes on the device — this is the only audit trail if something goes wrong.

## 5. Project-specific traps

*Populated from review findings as they occur.*

**Known at project start (2026-09-05):**
- `PROJECT_ANALYSIS.md` v2.0.0 describes a "Local Multi-Device Mesh" that **does not exist in
  code** — no P2P, socket, or mDNS implementation was found anywhere in `lib/`. Treat that
  document as forward-looking specification, not a record of what's built. Don't assume a
  capability exists because the analysis doc mentions it.
- The app was checked out on `feature/local-multi-device-mesh` when last touched, not `main`
  — confirm which branch you're actually building from.

---

## 6. Git

```
branch:  <stream>/<ID>-<short-description>     e.g. sc/SC001-telegram-auth
commit:  [SC001] <imperative summary>
```

No AI-attribution trailers. Never commit directly to `main`; never force-push. **Push the
branch when you finish.**

This repo has its own remote (`github.com/deepakraj-18/mobileappagent`) but is **not yet**
wired as a submodule of the parent (`IF002`, pending). Commit and push here regardless —
wiring is independent of your task.

---

## 7. The task system

Tasks live at `../.claude-context/tasks/<STREAM>/<ID>.md`.

**Most tasks for this repo are currently `Status: Blocked`** — not because effort is
missing, but because they depend on product decisions not yet made (see `BD002`, `BD003`,
`FD002` in the task index). **Do not start implementation on a blocked task to "make
progress."** If you believe a blocking question has since been answered, say so in your
report and point to where — don't assume and proceed.

Ready-to-work tasks as of 2026-09-05: `IF002` (submodule wiring, done by the human/parent
side), `IF003` (Flutter toolchain + build baseline), `SC001` (Telegram/threat-model
hardening), `SC002` (permission audit) — in that dependency order.

You set `Status: Review` when your work is ready. Only a reviewer sets `PASS`.
