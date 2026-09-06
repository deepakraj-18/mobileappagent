# AGENTS.md — deskcompanianapp (`private_agent`)

**Read this file completely before writing any code.** It is self-contained on purpose: it
inlines every rule that governs this repository. There is no other rule file to fetch.

You are working on **this repo only**. Do not touch `LifeOSAPI`, `lifeosweb`,
`lifeosmobilev2`, `tessrag`, or `tesspms`.

---

## 🔄 Stack change, 2026-09-06 — read this before anything else

**This app was originally built in Flutter. It is being rewritten in React Native.** If you
have any earlier context about this repo being Flutter, discard it — the sections below
describe the current, correct stack.

- The Flutter implementation is **fully preserved**, not deleted-and-gone: git tag
  `archive/flutter-final` (pushed to `origin`) and a filesystem copy at
  `E:\Projects\LifeOS\_archive\deskcompanianapp-flutter-2026-09-06\` in the parent repo.
- `IF004` is the task that cleans up Flutter and scaffolds React Native. If that hasn't
  happened yet in your session, **do it first** — everything else in this file assumes it's done.
- `AgentAccessibilityService.kt` (native Kotlin, the actual screen-automation logic) is
  **independent of Flutter and survives the rewrite unchanged.** Only the JS/TS app layer and
  the native-module bridge need building fresh.
- **Telegram has been removed from the project entirely** — not ported, not replaced yet. The
  control channel is an open product question (see `SC001`/`BD002`), not something to rebuild
  by default.

---

## Who else is working on this project

You are not working alone, and you are not the architect. **Two planning trees exist for this
app, both current, both kept in sync:**

1. **This repo's own `.claude-context/`** — `plan.md` (the detailed "Companion ⇄ Brain"
   architecture, hardware-verified against the actual target device), `hub-contract.md` (the
   full wire protocol), and `tasks/INDEX.md` (40+ tasks across 7 phases, ~45 ideal-days). **This
   is the primary source for feature scope** — what to build, in what order, and why.
2. **The LifeOS parent repo's `.claude-context/`** — `plan.md`,
   `companion-app-analysis.md` (with its 2026-09-06 addendum), and `tasks/` covers the
   cross-cutting gates that sit above this repo's own phase breakdown: submodule wiring
   (`IF002`), the React Native scaffold + Flutter cleanup (`IF004`), and security review
   (`SC001`/`SC002`, in the parent's numbering — don't confuse these with this repo's own
   `SC001`–`SC008` in Phase 1, which are different tasks despite the shared prefix).

Read both `plan.md`s. This repo's own describes *what* the app does; the parent's covers *how
this repo relates to the rest of the workspace* (nothing today, by design — see §1).

**Someone else reviews your submission independently before it counts as done.** You may set
`Status: Review`. You may never set `Status: PASS`. This is enforced at commit time (parent
repo's `scripts/hooks/pre-commit`) and again in CI — not left as a convention to remember.

---

## 1. What this is — and what it is not

This is **not** a LifeOS data client. It is an on-device AI agent that operates the phone:
screen automation via an Android AccessibilityService, system control, app launching, voice
input, backed by a self-hosted Ollama model (or whatever `BD003` decides).

**It has no LifeOS integration today.** Verified 2026-09-05: no calls to `LifeOSAPI`, no
shared auth, no shared data. Treat it as its own product sharing this workspace — do not
invent integration work that isn't in an approved task.

**The consequence that shapes every decision here:** this app is granted
`BIND_ACCESSIBILITY_SERVICE`, meaning it can read and act on the content of *every screen in
every app on the device* — including the user's password manager and banking apps. A bug here
is not cosmetic; it is a path to full device compromise. Treat every change to permission
handling, command authorization, or the accessibility service itself as security-critical, not
routine.

## 2. Stack and structure

| Layer | Technology |
|---|---|
| App | **React Native** (Community CLI — never Expo's scaffold/runtime) |
| Native | Kotlin (Android), `minSdk 26` |
| AI backend | Ollama, self-hosted (or per `BD003`) |
| Remote control | **None currently** — Telegram removed; see `SC001`/`BD002` for what, if anything, replaces it |

```
src/                  (post-IF004 — RN app; exact layout is IF004's scaffold output)
android/
├── app/src/main/kotlin/com/privateagent/private_agent/
│   └── AgentAccessibilityService.kt   PRESERVED — the actual automation logic, Kotlin, stack-independent
└── app/src/main/AndroidManifest.xml   permissions — audited in SC002, don't widen without a task
```

### React Native conventions (this project's standing rule — see `~/.claude/rules/react-native.md`)

- **Scaffold and runtime: Community CLI, never Expo.** No `expo init`, `expo start`,
  `import { ... } from 'expo'`, or `expo` in `package.json` dependencies. Individual `expo-*`
  packages (`expo-camera`, etc.) are fine if genuinely needed — install with `npm install
  expo-*`, never `expo install`.
- Function components with hooks only. No class components.
- Typed navigation if/when multiple screens exist (`React Navigation`, not `expo-router`).
- No web APIs (`window`, `document`). Use `Dimensions`, `Platform`, `AppState`.
- Bridge to `AgentAccessibilityService.kt` via a proper React Native **Native Module** (not a
  WebView bridge, not a hacky intent-based workaround) — this is the single most
  architecturally important piece of `IF004`.

### Commands

```bash
npm install
npx react-native run-android
npx tsc --noEmit
npx jest
```

**No verified build baseline exists yet until `IF004` completes.** If you are working on
`IF004` itself, establishing that baseline *is* the task — don't assume a prior "0 errors"
claim without re-running it yourself, and don't claim one without having actually run it.

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

`npx react-native clean` / `cd android && ./gradlew clean` are fine — they only remove build
output, not source. The git commands are not.

### Removing the Flutter implementation (`IF004` specifically)

This is the one task in this repo that legitimately deletes a large amount of source. It is
**pre-authorized and already backed up** (see the top of this file) — you do not need to ask
before removing `lib/`, `pubspec.yaml`, or Flutter's Android wiring as part of `IF004`
specifically. You **do** still need to:
1. Verify both backups exist first (the task file spells out the exact commands)
2. Preserve `AgentAccessibilityService.kt` and `AndroidManifest.xml` — don't delete these
3. Scope the deletion to Flutter-specific files only — don't run a blanket `rm -rf` over the
   repo; remove the specific files/directories named in `IF004`'s acceptance criteria

Outside of `IF004`, the "before deleting anything" checklist below applies as normal.

### Before deleting anything (outside IF004), answer all four. Cannot answer one? Do not delete.

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
- **Never trust an incoming command by default**, regardless of where it comes from. If a
  remote/external control channel is ever added (post `SC001`/`BD002` — not by default),
  every command must be checked against an explicit allow-list, denied otherwise.
- **Any secret (API keys, tokens) is stored in Android Keystore / secure storage.** Never in
  `AsyncStorage`, never in source, never in a tracked file, never in a log line.
- **Every permission in `AndroidManifest.xml` must be justified by a shipping feature.** If
  you find one that isn't (see `SC002`), flag it rather than assuming it's needed for
  something not yet built.
- **Destructive or irreversible agent actions require explicit in-app confirmation**, not a
  single trigger from any source. An agent that can act on every screen should never be one
  event away from an irreversible action.
- **Log command/action activity** (timestamp + what was executed) for anything the agent does
  on the device — this is the only audit trail if something goes wrong.

## 5. Project-specific traps

*Populated from review findings as they occur.*

**Known at project start (2026-09-06):**
- This repo was Flutter until 2026-09-06. Any documentation, comment, or prior task referring
  to Dart files, `pubspec.yaml`, or Flutter commands describes the **pre-rewrite** state — the
  archive (`archive/flutter-final` tag) is where that code now lives, not the working tree.
- `PROJECT_ANALYSIS.md` v2.0.0 describes a "Local Multi-Device Mesh" that **never existed in
  code**, in either the Flutter or React Native version — no P2P, socket, or mDNS
  implementation has been found. Treat that document as forward-looking specification, not a
  record of what's built.
- Flutter platform channels and React Native native modules are **not a 1:1 mapping** — if
  you're porting the `AgentAccessibilityService.kt` bridge, expect the JS-side API shape to
  change even though the Kotlin service itself doesn't need to.

---

## 6. Git

```
branch:  <stream>/<ID>-<short-description>     e.g. if/IF004-react-native-scaffold
commit:  [IF004] <imperative summary>
```

No AI-attribution trailers. Never commit directly to `main`; never force-push. **Push the
branch when you finish.**

This repo is wired as a submodule of the LifeOS parent repo. Commit and push here first; the
parent then updates its own pointer separately.

---

## 7. The task system

**Two task lists, two purposes — see "Who else is working on this project" above.**

- **Gate tasks** (submodule wiring, the RN scaffold itself, security review): parent repo's
  `../.claude-context/tasks/<STREAM>/<ID>.md`.
- **Feature tasks** (everything the app actually does — voice, hub client, agent execution,
  presence, dock cards): this repo's own `.claude-context/tasks/INDEX.md`, Phases 1–6.

**Sequence: gate tasks first.** `IF004` (React Native scaffold + Flutter cleanup — start
here) → `SC001` (threat model + control-channel design, parent numbering) → `SC002`
(permission audit, parent numbering) → **then** this repo's own Phase 1 (`IF001`, `IF002`,
`SC001`–`SC008` — a *different* `SC001`, don't confuse it with the parent's — `DB001`,
`BD013`).

The parent's `BD002` (day-one capability set) and `BD003` (integration posture) are
**resolved by this repo's own `plan.md`** — read it rather than treating those as still open;
they've been updated to point here instead of re-litigating what's already answered.

⚠️ `IF003` (the old "establish a Flutter toolchain" task, parent numbering) is **superseded**
— if you had claimed it, stop, its file explains why and points to `IF004`.

Per-task files for this repo's own Phase 1–7 breakdown are **not yet written** — `tasks/INDEX.md`
here is the agreed breakdown; individual task files get generated when a phase actually starts,
per that file's own note.

You set `Status: Review` when your work is ready. Only a reviewer sets `PASS`.
