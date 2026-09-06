import { AzureHubClient, type WebSocketLike } from '../src/hub/AzureHubClient';
import type { HubSession } from '../src/hub/HubAuth';
import { makeFrame } from '../src/hub/types';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  push(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

describe('AzureHubClient', () => {
  const session: HubSession = {
    deviceId: 'dev_1',
    deviceToken: 'tok',
    refreshToken: 'ref',
    tokenExpiresAt: '2099-01-01T00:00:00Z',
    wsUrl: 'wss://lifeos.example/v1/companion/stream',
  };

  it('sends hello on connect and handles commands idempotently', async () => {
    let socket: FakeSocket | null = null;
    const WebSocketImpl = class {
      constructor(_url: string) {
        socket = new FakeSocket();
        return socket;
      }
    } as unknown as new (url: string) => WebSocketLike;

    const client = new AzureHubClient({
      session,
      WebSocketImpl,
      autoReconnect: false,
      heartbeatMs: 60_000,
    });

    const commands: string[] = [];
    client.onCommand(f => {
      commands.push(String(f.payload.command));
    });

    const connecting = client.connect();
    // open after listeners attached
    await Promise.resolve();
    socket!.open();
    await connecting;

    expect(client.isConnected()).toBe(true);
    const hello = JSON.parse(socket!.sent[0]!) as { type: string };
    expect(hello.type).toBe('hello');

    const cmd = makeFrame('command', { command: 'SPEAK' as const, text: 'hi' });
    socket!.push(cmd);
    await Promise.resolve();
    await Promise.resolve();
    expect(commands).toEqual(['SPEAK']);

    // duplicate id ignored for execution
    socket!.push(cmd);
    await Promise.resolve();
    await Promise.resolve();
    expect(commands).toEqual(['SPEAK']);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });
});
