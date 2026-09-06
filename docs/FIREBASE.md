# Firebase / FCM setup (IF001)

## Current state

- Package: `com.privateagent`
- `android/app/google-services.json` is a **placeholder** so the Google Services Gradle
  plugin can resolve and later FCM work (`BD033`) has a file path.
- Placeholder `project_id`: `privateagent-fcm-placeholder` — **does not deliver real FCM**.

## Owner action (required before BD033)

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com/)
   (suggested name: `PrivateAgent` / `desk-companion`).
2. Add an Android app with package name **`com.privateagent`**.
3. Download the real `google-services.json` and replace
   `android/app/google-services.json`.
4. Enable **Cloud Messaging** (FCM) in the project.
5. Do **not** commit server keys; the client JSON is expected in-repo for sideload builds.

Messaging native/JS modules ship in **BD033**, not IF001.
