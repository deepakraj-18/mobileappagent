<div align="center">

# 🧞 PrivateAgent

**A fully private, on-device autonomous agent for Android**

PrivateAgent turns any OpenAI-compatible LLM into an autonomous Android UI
automation agent. It observes the screen through Android's Accessibility
Service, reasons about what it sees with an LLM of your choice, and acts —
tapping, typing, and swiping — until your goal is accomplished.

_Your keys. Your data. Your device. Nothing leaves your phone except LLM calls
you configure yourself._

</div>

---

## ✨ Features

| Capability                         | Description                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🤖 **Autonomous task execution**   | Observe → think → act feedback loop: dumps the visible UI, asks the LLM for one JSON action, executes it, and repeats until the goal is done (with step caps and repeat-action detection). |
| 🧠 **Skill memory (macro replay)** | Successful action sequences are stored locally per goal. Repeated tasks replay as macros — zero LLM tokens spent.                                                                          |
| 🔌 **Any OpenAI-compatible LLM**   | Works with DeepSeek, OpenRouter, NVIDIA NIM, Ollama (fully local), or a custom base URL.                                                                                                   |
| ♿ **Screen automation**           | Native Android accessibility service for screen dumps, taps, text input, swipes, back/home gestures, and screenshots.                                                                      |
| 📱 **Telegram remote control**     | Drive your phone from anywhere via a Telegram bot — send goals, get status updates and screenshots back.                                                                                   |
| 🎙️ **Voice interface**             | Speech-to-text input and text-to-speech replies.                                                                                                                                           |
| 🪟 **Overlay assistant**           | Floating overlay window to launch tasks from any app.                                                                                                                                      |
| 🔁 **Recovery engine**             | Detects stuck states and autonomously recovers (retry, scroll, back out).                                                                                                                  |
| 🔐 **Private by design**           | All state (settings, skills, history) stays on-device via `SharedPreferences`. No telemetry, no third-party analytics.                                                                     |
| ⚙️ **System control**              | Volume, brightness, app launching, intents, sharing, and notifications.                                                                                                                    |

## 🏗️ How it works

```
        ┌─────────────────────────────────────────────┐
        │              TaskExecutor                   │
        │                                             │
        │  1. Verify accessibility service            │
        │  2. Try skill-memory replay (no LLM)        │
        │  3. Loop:                                   │
        │     dump screen ──► LLM decides one JSON    │
        │     action ──► execute ──► repeat           │
        │     (+ step caps, repeat detection,         │
        │        RecoveryEngine for stuck states)     │
        └─────────────────────────────────────────────┘
```

The screen is serialized into a compact, token-friendly format:

```
#<index> "<label>" [<widget class>] @(<centerX>,<centerY>) <flags>
```

## 📂 Project structure

```
lib/
├── main.dart                    # Entry point, Telegram & overlay wiring
├── app.dart                     # Root widget / navigation
├── models/                      # ChatMessage, Skill, ScreenNode, TaskStep, ...
├── screens/
│   ├── home/                    # Main chat / task screen
│   ├── onboarding/              # First-run setup
│   ├── sessions/                # Session detail view
│   ├── history/                 # Task history
│   └── settings/                # Provider, API key, Telegram config
├── services/
│   ├── task_executor.dart       # The observe → think → act loop
│   ├── ai_service.dart          # OpenAI-compatible chat completions
│   ├── screen_automation_service.dart  # Accessibility MethodChannel bridge
│   ├── skill_memory_service.dart      # Macro replay memory
│   ├── recovery_engine.dart     # Stuck-state recovery
│   ├── telegram_service.dart    # Bot long-poll remote control
│   ├── voice_service.dart       # STT / TTS
│   ├── system_control_service.dart    # Volume, brightness, intents
│   ├── app_launcher_service.dart      # Installed apps & launching
│   └── settings_service.dart    # Persisted app settings
├── overlay/overlay_app.dart     # Floating overlay UI
├── theme/                       # App theming
└── widgets/                     # Chat bubbles, status chips, ...
```

## 🚀 Getting started

### Prerequisites

- Flutter SDK (Dart `>= 3.12.2`)
- Android SDK (minSdk 26 / Android 8.0+)
- An API key for an OpenAI-compatible provider — **or** a local
  [Ollama](https://ollama.com) server for a 100% offline setup

### Install & run

```bash
# Clone
git clone https://github.com/AbuZar-Ansarii/PrivateAgent.git
cd PrivateAgent

# Fetch dependencies
flutter pub get

# Run on a connected device / emulator
flutter run
```

### Setup

1. Launch the app and complete onboarding.
2. In **Settings**, pick a provider (DeepSeek, OpenRouter, NVIDIA NIM, Ollama,
   or custom) and enter your API key.
3. Enable the **PrivateAgent Accessibility Service** in Android settings when
   prompted — this is required for screen automation.
4. (Optional) Configure the **Telegram bot** token for remote control.
5. Give it a goal — e.g. _"Open WhatsApp and send 'hi' to Mom"_ — and watch it
   work.

### Telegram commands

| Command       | Action                                            |
| ------------- | ------------------------------------------------- |
| `/status`     | Current task state + accessibility service status |
| `/screenshot` | Capture and send the current screen               |
| _(any text)_  | Executed as an agent task                         |

## 🛠️ Development

```bash
flutter analyze     # Static analysis
flutter test        # Run tests
flutter build apk   # Release APK
```

A mock LLM server for offline development is provided:

```bash
python tool/mock_llm.py
```

## 🔒 Privacy

- LLM requests go **only** to the base URL you configure.
- Skills, task history, and settings are stored locally (`SharedPreferences`).
- No analytics, no crash reporting, no tracking of any kind.

## ⚠️ Disclaimer

PrivateAgent controls your device's UI. Autonomy comes with risk — review what
it's doing, start with simple goals, and never give it credentials you can't
afford to expose. Intended for personal, lawful use on your own devices.

## 📄 License

All rights reserved. (Add a LICENSE file if you'd like to open-source this
project.)
