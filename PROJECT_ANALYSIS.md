# PrivateAgent — Architecture & Technical Analysis

> **Document Version:** 2.0.0  
> **Target Project:** `private_agent` (Mobile App Agent)  
> **Platform:** Android (minSdk 26 / Android 8.0+)  
> **Framework:** Flutter (Dart `>=3.12.2`) with native Android Kotlin services  
> **New Feature Specification:** Local Multi-Device Mesh, Device Selection List & Telegram-Style In-App Remote Chat

---

## 1. Executive Summary

**PrivateAgent** is an on-device, privacy-preserving autonomous agent for Android. It bridges standard **OpenAI-compatible Large Language Models (LLMs)** with the **Android Accessibility API** to create a self-directed agent capable of observing, reasoning about, and interacting with arbitrary mobile applications without needing custom APIs or root access.

### Core Value Propositions

- **Privacy by Design:** Prompts and responses only flow to the user-configured LLM endpoint (which can be a 100% local/offline Ollama instance). All task histories, macros, and configuration settings are persisted strictly on-device in `SharedPreferences`.
- **Zero-Token Replay (Skill Memory):** Successful task runs can be saved as deterministic macros that can be replayed on demand without consuming LLM tokens.
- **Local Multi-Device Remote Control (NEW):** Instead of relying on a third-party Telegram bot or cloud relay, PrivateAgent devices discover each other over local Wi-Fi. Users can select any connected device from a list and interact with it through a rich, dedicated **Telegram-style chat interface** to dispatch goals, monitor live step reasoning, and view screen snapshots.
- **Multimodal Interaction:** Supports voice control (speech-to-text / text-to-speech), a floating system overlay assistant, and in-app chat.

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CONTROLLER DEVICE (Device A)                       │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     "Devices" List Screen                       │   │
│   │   • Discovers active nodes via mDNS / UDP broadcast             │   │
│   │   • Displays live device status (Online, Busy, Battery, A11y)   │   │
│   └────────────────────────────────┬────────────────────────────────┘   │
│                                    │ Tap Device                         │
│                                    ▼                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │             Telegram-Style Remote Device Chat Screen            │   │
│   │   • Chat transcript: User goals, Agent thinking, Action steps   │   │
│   │   • Quick action buttons: [Screenshot] [Status] [Cancel] [Mic]  │   │
│   │   • Inline image rendering for incoming remote screenshots      │   │
│   └────────────────────────────────┬────────────────────────────────┘   │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                   Local Wi-Fi WebSocket Connection
                   (Direct P2P, Zero Cloud Relay)
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        TARGET DEVICE (Device B)                         │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                   Local Agent WebSocket Server                  │   │
│   │   • Listens on local port (e.g., :8765)                         │   │
│   │   • One-time Pairing & Security approval dialog                 │   │
│   │   • Dispatches incoming goals to TaskExecutor                   │   │
│   └────────────────────────────────┬────────────────────────────────┘   │
│                                    │ Goal String                        │
│                                    ▼                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     TaskExecutor (lib/services/)                │   │
│   │                                                                 │   │
│   │   1. Accessibility Check: Ensure Android Accessibility is ON    │   │
│   │   2. Skill Lookup: Check local cache for memorized macros       │   │
│   │      ├─► [Match Found] ──► Fast-Path Replay (0 LLM Tokens)     │   │
│   │      └─► [No Match]    ──► Initiate Autonomous AI Loop          │   │
│   │   3. Stream live steps, status, & screenshots back to Socket    │   │
│   └────────────────────────────────┬────────────────────────────────┘   │
│                                    │                                    │
│          ┌─────────────────────────┴─────────────────────────┐          │
│          ▼                                                   ▼          │
│┌──────────────────────────────┐              ┌─────────────────────────┐│
││       OBSERVE PHASE          │              │       THINK PHASE       ││
││ Android Accessibility Tree   │              │ Compact screen dump +   ││
││ dumped via MethodChannel     │              │ goal sent to local/cloud││
││ Parsed into ScreenNode list  │              │ LLM for JSON action     ││
│└─────────┬────────────────────┘              └─────────────┬───────────┘│
│          │                                                 │            │
│          └─────────────────────────┬───────────────────────┘            │
│                                    ▼                                    │
│┌───────────────────────────────────────────────────────────────────────┐│
││                         ACT & RECOVER PHASE                           ││
││ 1. Validate & parse action JSON into TaskStep                         ││
││ 2. ScreenAutomationService executes gesture/input on Android OS       ││
││ 3. RecoveryEngine evaluates screen diff & action history              ││
││ 4. Send step update & screenshot back to Controller Device over socket││
│└───────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Local Multi-Device Remote Control Subsystem (Detailed Spec)

### 3.1 Motivation & Comparison with Telegram

In the original architecture, remote control was handled through a long-polling **Telegram bot** (`telegram_service.dart`):

- **Limitations of Telegram:**
  - Requires public internet access and Telegram API servers.
  - Requires creating a Telegram Bot token and knowing user Chat IDs.
  - Device telemetry and screenshots traverse third-party servers.
  - Only one device can be easily targeted without complex bot command routing.
- **Advantages of Local In-App Device Chat:**
  - **100% Local & Offline:** Functions on any local Wi-Fi / Hotspot without internet.
  - **Zero Third-Party Relays:** Complete privacy; screen data and commands stay on the local network.
  - **Multi-Device Selection:** Discover multiple phones/tablets running PrivateAgent and command any one of them with a single tap.
  - **Rich In-App UX:** Custom Telegram-style UI with quick-action shortcut buttons, live status indicators, and full voice integration.

### 3.2 Device Roles & Topology

- **Dual-Role Model:** Every instance of the app acts as both:
  1. **A Server / Worker Agent:** Broadcasts its presence, listens for incoming connections, and executes tasks on its own screen via its Accessibility Service.
  2. **A Client / Controller:** Discovers other devices on the network and connects to them via a dedicated chat page to control them remotely.

### 3.3 Discovery, Pairing & Security Protocol

1. **Discovery (mDNS / UDP Broadcast):**
   - Each device advertises a local service (e.g. `_privateagent._tcp`) containing:
     - `deviceId`: Unique persistent UUID.
     - `deviceName`: User-friendly name (e.g. "Pixel 7 Pro", "Galaxy S23").
     - `port`: Local WebSocket server port (e.g. `8765`).
     - `status`: `idle` or `running`.
     - `accessibilityOn`: `true` or `false`.
2. **Pairing & Approval:**
   - Because the Android Accessibility Service grants complete control over the phone, **unauthorized access must be prevented**.
   - When Device A connects to Device B for the first time, Device B displays a native system prompt / dialog:
     ```
     ┌──────────────────────────────────────────────────┐
     │          Remote Control Request                  │
     │ "Deepak's Pixel" wants to connect to this device.│
     │                                                  │
     │          [ Reject ]        [ Approve ]           │
     └──────────────────────────────────────────────────┘
     ```
   - Upon approval, an authentication token is exchanged and saved in `SharedPreferences`. Subsequent connections from paired devices are automatically accepted.

### 3.4 WebSocket Communication Protocol

Communication occurs over a bidirectional WebSocket connection using lightweight JSON payloads:

#### Controller → Target:

- **`pair_request`**: `{ "type": "pair_request", "clientName": "Laptop/Phone", "clientId": "uuid" }`
- **`start_task`**: `{ "type": "start_task", "goal": "Open WhatsApp and message Alice" }`
- **`command`**: `{ "type": "command", "cmd": "status" | "screenshot" | "pause" | "resume" | "cancel" }`

#### Target → Controller:

- **`pair_response`**: `{ "type": "pair_response", "accepted": true, "token": "auth_token" }`
- **`status_update`**: `{ "type": "status_update", "state": "running" | "idle", "step": 3, "goal": "..." }`
- **`step_log`**: `{ "type": "step_log", "step": 3, "role": "agent", "action": "click_text", "reasoning": "Tapping search bar" }`
- **`screenshot`**: `{ "type": "screenshot", "base64": "...", "caption": "Step #3 screenshot" }`
- **`task_completed`**: `{ "type": "task_completed", "status": "success" | "failed", "summary": "..." }`

---

## 4. In-App User Interface Specification

### 4.1 "Devices" Tab / Screen (`lib/screens/devices/devices_screen.dart`)

- **Device Cards List:** Shows all discovered and previously paired devices on the local Wi-Fi.
  - Device Name & Model (e.g., _"Living Room Tablet (Galaxy Tab S8)"_).
  - Connection Status Chip: `Online` (green), `Offline` (grey), `Connecting` (amber).
  - Agent State Chip: `Idle` (blue) or `Executing Goal: ...` (purple).
  - Health Indicators: Battery level, Wi-Fi signal, Accessibility Service status (`Active ✅` / `Disabled ❌`).
- **Quick Actions:** Tap card to open the **Telegram-style Remote Chat**; pull-to-refresh to re-scan mDNS.

### 4.2 Telegram-Style Remote Device Chat (`lib/screens/devices/device_chat_screen.dart`)

- **App Bar:**
  - Target device avatar, name, and real-time status subtitle (`Online • Ready`, or `Running step 4/25`).
  - Device info popover (IP address, paired status, disconnect option).
- **Message Transcript View:**
  - **User Bubbles:** Outgoing goals and commands sent to the remote device.
  - **Agent Step Bubbles:** Real-time updates showing what the remote agent is currently doing (Action name, parameters, concise LLM reasoning).
  - **Screenshot Cards:** Expandable high-res screen snapshots received directly from the remote device.
  - **Status / System Cards:** Info cards showing task started, paused, finished, or recovery notices.
- **Quick-Action Toolbar (Above Input Field):**
  - 📸 **`/screenshot` Button:** Requests an instant live screenshot from the target screen.
  - ℹ️ **`/status` Button:** Queries real-time accessibility and task execution state.
  - ⏹️ **`/cancel` Button:** Instantly aborts the remote task in progress.
  - ⏸️ **Pause / Resume:** Temporarily freezes or unfreezes the target's loop.
- **Message Input Area:**
  - Text input for natural language goals (e.g., _"Open Spotify and play my Liked Songs"_).
  - 🎙️ **Voice Mic Button:** Direct speech-to-text to dictate goals hands-free.
  - Send button dispatches the goal directly over the local WebSocket.

---

## 5. Core Agent Mechanics (Observe → Think → Act)

### 5.1 Screen Observation & Serialization (`AgentAccessibilityService.kt` & `screen_node.dart`)

Instead of heavy raw image screenshots that consume massive vision model tokens and introduce latency, PrivateAgent queries Android's `AccessibilityNodeInfo` tree directly:

- **Filtering:** Filters out non-interactive elements and invisible containers, keeping only actionable widgets (clickable, editable, scrollable, checkable) or widgets with visible labels.
- **Serialization Format:** Each visible element is encoded as a single concise text line:
  ```text
  #<index> "<label>" [<widget class>] @(<centerX>,<centerY>) <flags>
  ```
- **Context Preservation:** Prevents self-reference loops by skipping PrivateAgent's own UI window if a foreign application window is active in the background.

### 5.2 Cognitive Decision Loop (`task_executor.dart` & `ai_service.dart`)

- **Autonomous Execution on Target:** The target device runs the full loop autonomously:
  1. Accessibility tree dump.
  2. LLM reasoning (via target's configured provider or local Ollama).
  3. Action execution (`click_text`, `click_at`, `type_text`, `scroll`, `swipe`, `press_back`, `open_app`).
  4. Streams every step and screenshot back to the Controller's chat page in real time.

### 5.3 Recovery Engine (`recovery_engine.dart`)

Monitors the execution state after every turn:

- **Stagnation Detection:** Compares consecutive screen dumps to check if the screen failed to change following an action.
- **Repetition Detection:** Flags repeated failed attempts on identical UI elements.
- **Autonomous Mitigation:** Automatically suggests corrective operations (e.g. scroll forward to reveal content, swipe back, or invoke alternative navigation).

### 5.4 Skill Memory & Macro Replay (`skill_memory_service.dart`)

- Once a goal succeeds through the AI loop, the sequence of successful `TaskStep` commands is recorded into a `Skill` schema.
- When matched, the task bypasses LLM inference entirely, replaying the stored sequence at rapid step intervals (0 tokens spent).

---

## 6. Technology Stack & Planned Dependencies

| Category                   | Existing / Added Libraries                              | Role                                                          |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| **Framework**              | Flutter / Dart 3.12.2+                                  | Cross-platform UI and reactive state management               |
| **Native Bridge**          | Android Kotlin, MethodChannel                           | Accessibility services, screen dumps, gesture simulation      |
| **Local Discovery (NEW)**  | `nsd` or `bonsoir`                                      | ZeroConf / mDNS local network service broadcast and discovery |
| **Local WebSockets (NEW)** | `shelf_web_socket`, `web_socket_channel`                | Local embedded WebSocket server and client for P2P connection |
| **Voice / Speech**         | `speech_to_text`, `flutter_tts`                         | Voice command parsing and spoken responses                    |
| **System Integrations**    | `installed_apps`, `android_intent_plus`, `url_launcher` | App discovery, execution, intent launching                    |
| **Permissions & Storage**  | `permission_handler`, `shared_preferences`              | System permissions, local state and macro persistence         |
| **Overlay UI**             | `flutter_overlay_window`                                | System alert window floating UI                               |

---

## 7. Updated Repository Structure

```
mobileappagent/
├── android/
│   └── app/src/main/kotlin/com/privateagent/private_agent/
│       ├── AgentAccessibilityService.kt   # Native Android Accessibility Service
│       └── MainActivity.kt                # MethodChannel event dispatcher
├── lib/
│   ├── app.dart                           # App root widget & tab navigation
│   ├── main.dart                          # App startup & background listeners
│   ├── models/
│   │   ├── connected_device.dart          # [NEW] Remote device model (IP, name, status, paired)
│   │   ├── chat_message.dart              # Chat transcript model
│   │   ├── screen_node.dart               # Serialized UI tree node
│   │   ├── skill.dart                     # Macro skill model
│   │   ├── task_history_entry.dart        # Historic run record
│   │   └── task_step.dart                 # Atomic UI action definition & JSON parser
│   ├── screens/
│   │   ├── devices/                       # [NEW] Multi-device screens
│   │   │   ├── devices_screen.dart        # [NEW] Discovered & paired devices list
│   │   │   └── device_chat_screen.dart    # [NEW] Telegram-style remote device chat view
│   │   ├── home/                          # Local device chat / task execution view
│   │   ├── history/ & sessions/           # Task review and logs
│   │   ├── onboarding/                    # Accessibility permission setup flow
│   │   └── settings/                      # Local device config & remote server toggle
│   ├── services/
│   │   ├── device_discovery_service.dart  # [NEW] mDNS advertiser and scanner
│   │   ├── device_server_service.dart     # [NEW] Local WebSocket server (accepts remote commands)
│   │   ├── device_client_service.dart     # [NEW] WebSocket client (talks to remote devices)
│   │   ├── task_executor.dart             # Observe-Think-Act central state machine
│   │   ├── screen_automation_service.dart # Dart wrapper for Android accessibility
│   │   ├── ai_service.dart                # OpenAI-compatible API gateway
│   │   ├── recovery_engine.dart           # Failure detector & recovery generator
│   │   ├── skill_memory_service.dart      # Macro persistence and replay engine
│   │   ├── telegram_service.dart          # Optional Telegram bot bridge
│   │   └── voice_service.dart             # Speech-to-Text and Text-to-Speech service
│   ├── theme/                             # UI color schemes and styles
│   └── widgets/                           # Reusable UI widgets
├── PROJECT_ANALYSIS.md                    # This document
├── pubspec.yaml                           # Dependency definitions and assets
└── README.md                              # Upstream documentation
```

---

## 8. Requirements to Build and Run

1. **Flutter SDK:** Version `3.12.2` or later.
2. **Android SDK:** Configured with API level 35/36 and `minSdk 26` (Android 8.0 Oreo or higher).
3. **Local Wi-Fi Network:** Devices must be connected to the same local Wi-Fi router, or one device can host a mobile Wi-Fi hotspot while the other connects to it.
4. **Device Permissions:**
   - **Accessibility Service:** Toggle `PrivateAgent Screen Control` in Android `Settings > Accessibility` on target devices.
   - **Local Network / Multicast:** Standard Android Wi-Fi multicast lock to receive mDNS packets.
5. **LLM Provider:**
   - Either a cloud API key (DeepSeek, OpenRouter, NVIDIA NIM, or custom OpenAI-compatible endpoint).
   - Or a local instance of Ollama running on the network with model access.
