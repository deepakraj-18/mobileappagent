import { NativeEventEmitter, NativeModules } from 'react-native';

export type FcmDataMessage = {
  type: string;
  payloadJson: string;
};

export type FcmHandlers = {
  /** Force WSS reconnect when FCM says the socket is stale. */
  onForceReconnect?: () => void | Promise<void>;
  /** Compact command JSON when WSS is down (hub-contract §2). */
  onCompactCommand?: (payload: Record<string, unknown>) => void | Promise<void>;
};

type FcmNative = {
  getToken(): Promise<{ token: string | null; reason?: string }>;
  emitDataMessage(type: string, payloadJson: string): Promise<boolean>;
};

const native = NativeModules.FcmBridge as FcmNative | undefined;

/**
 * Routes FCM data messages into hub reconnect / compact-command handlers.
 * Live token registration blocked until IF001 replaces placeholder google-services.json.
 */
export function startFcmReceiver(handlers: FcmHandlers): () => void {
  if (!native) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.FcmBridge);
  const sub = emitter.addListener('FcmDataMessage', (msg: FcmDataMessage) => {
    void routeFcmMessage(msg, handlers);
  });
  return () => sub.remove();
}

export async function routeFcmMessage(
  msg: FcmDataMessage,
  handlers: FcmHandlers,
): Promise<void> {
  const type = (msg.type || '').toUpperCase();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(msg.payloadJson || '{}') as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (type === 'FORCE_RECONNECT' || type === 'WAKE_RECONNECT') {
    await handlers.onForceReconnect?.();
    return;
  }
  if (type === 'COMPACT_COMMAND' || type === 'COMMAND') {
    await handlers.onCompactCommand?.(payload);
  }
}

export async function getFcmToken(): Promise<string | null> {
  if (!native) {
    return null;
  }
  const result = await native.getToken();
  return result.token;
}
