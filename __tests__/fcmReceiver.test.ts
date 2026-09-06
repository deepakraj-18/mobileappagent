import { routeFcmMessage } from '../src/hub/fcmReceiver';

describe('routeFcmMessage', () => {
  it('forces reconnect on WAKE_RECONNECT', async () => {
    const onForceReconnect = jest.fn(async () => undefined);
    await routeFcmMessage(
      { type: 'WAKE_RECONNECT', payloadJson: '{}' },
      { onForceReconnect },
    );
    expect(onForceReconnect).toHaveBeenCalled();
  });

  it('routes COMPACT_COMMAND payload', async () => {
    const onCompactCommand = jest.fn(async () => undefined);
    await routeFcmMessage(
      {
        type: 'COMPACT_COMMAND',
        payloadJson: JSON.stringify({ command: 'PING_DIAG', requestId: 'r1' }),
      },
      { onCompactCommand },
    );
    expect(onCompactCommand).toHaveBeenCalledWith({
      command: 'PING_DIAG',
      requestId: 'r1',
    });
  });
});
