# QA061 — Offline / degraded-mode behaviour

**Date:** 2026-09-09  
**Scope:** Brain unreachable, internet down, token expired — local fallback LLM, BLE presence,
outbox replay, stale cards, Dock status messaging.

Phase 6 exit (plan.md): *documented behaviour when brain + internet are down.*

---

## 1. Scenario matrix

| # | Scenario | Expected behaviour | Automated evidence | Manual / gap |
|---|---|---|---|---|
| A | Brain unreachable (hub DISCONNECTED / RECONNECTING) | `DegradedMode.active` when local fallback enabled + provider configured; Dock banner “Hub offline — local fallback active”; connection chip “Hub · offline / connecting” | `__tests__/DegradedMode.test.tsx`, `__tests__/Qa061OfflineDegraded.test.ts` | Toggle airplane + open Dock on device |
| B | Internet down (same as A at transport layer) | Same degraded path; `HubOutbox` queues events; replay on reconnect | `__tests__/HubClient.test.ts` (`HubOutbox`), Qa061 suite | Confirm no crash with airplane mode overnight (pairs with QA060) |
| C | Token expired / near expiry | `HubAuth.ensureFreshToken` refreshes when expiry &lt; 24h; failed refresh still returns existing token (connect may fail → degraded) | `__tests__/HubAuth.test.ts` + Qa061 `ensureFreshToken` | Force expired `tokenExpiresAt` in Keystore only in debug builds |
| D | Local fallback LLM | `TaskExecutor` uses local OpenAI-compatible provider when hub think times out / unreachable | `__tests__/LocalFallbackLlm.test.ts` | Configure Fallback Provider screen; run a goal with hub down |
| E | BLE presence fallback | Hub `PRESENCE` authoritative while fresh; else duty-cycled BLE / manual / voice sleep; emits `PRESENCE_LOCAL` | `__tests__/PresenceService.test.ts` | Amazfit in range with a11y/BLE grants from FD060 |
| F | Outbox replay | Offline enqueue → `replayPending` on live client → ACK | `__tests__/HubClient.test.ts` | Watch sent events after reconnect |
| G | Stale / offline dock cards | `DockCardsController.setOffline(true)` sets `staleSince`; UI shows “Cards stale since … / offline” | `__tests__/DockCardsController.test.ts`, `__tests__/DockCardList.test.tsx`, Qa061 | Disconnect hub while cards cached |
| H | Status messaging | Degraded banner + hub chip + presence chip + announcement status line | DockScreen tests / Qa061 | Visual check on Y17 |

---

## 2. Code map

| Concern | Entry points |
|---|---|
| Degraded gate | `src/agent/DegradedMode.ts` ← `HubRuntime.setState` |
| Local LLM | `src/agent/LocalFallbackLlm.ts`, `LocalFallbackStore`, Settings → Fallback provider |
| Outbox | `src/hub/HubOutbox.ts` + `OutboxDao` |
| Token lifecycle | `src/hub/HubAuth.ts` (`refresh`, `ensureFreshToken`) |
| Presence offline | `src/proactivity/PresenceService.ts` + BLE scanner |
| Cards offline | `src/proactivity/DockCardsController.ts` ← `ProactivityRuntime` connection listener |
| Dock UX | `src/screens/DockScreen.tsx`, `dock/DockCardList.tsx` |

---

## 3. Pass criteria (Review bar)

Automated suite for this task must stay green:

```powershell
npx jest __tests__/Qa061OfflineDegraded.test.ts __tests__/DegradedMode.test.tsx __tests__/LocalFallbackLlm.test.ts __tests__/PresenceService.test.ts __tests__/DockCardsController.test.ts __tests__/DockCardList.test.tsx __tests__/HubClient.test.ts __tests__/HubAuth.test.ts --forceExit
npx tsc --noEmit
```

Manual gaps (honest): full airplane-mode soak on device and Keystore-forced token expiry are operator-run; not claimed as executed in this session.

---

## 4. Findings / notes

| Date | Note |
|---|---|
| 2026-09-09 | Degraded mode requires **both** hub unreachable **and** a configured local provider (`baseUrl` + `model`). Banner will not show if fallback was never configured — expected; surface via FD041 Fallback Provider screen / onboarding follow-up |
| 2026-09-09 | `ensureFreshToken` catches refresh failures and returns the old device token — connect may still fail; user sees DISCONNECTED / degraded rather than a hard crash |
| 2026-09-09 | Presence without BLE hardware still supports manual + voice sleep (tested) |
| 2026-09-09 | Outbox replay is FIFO; failed rows marked FAILED (no infinite retry in `replayPending`) |

---

## 5. Operator checklist (device)

1. Configure Fallback Provider (URL + model + key); enable local fallback.
2. Pair hub, confirm CONNECTED + no degraded banner.
3. Airplane mode ON → Dock: banner + offline chip + cards stale marker (if cards cached).
4. Trigger a goal / think → local LLM used (no hub think).
5. Airplane OFF → reconnect; outbox drains; banner clears when CONNECTED.
6. Optional: expire token via debug; confirm refresh or clear re-pair messaging on Hub Connection screen.
