import { CompanionMode } from '../src/constants/appConstants';
import { PhoneEmbodiment } from '../src/embodiment/PhoneEmbodiment';

describe('PhoneEmbodiment', () => {
  it('records present/express and treats move as no-op', async () => {
    const body = new PhoneEmbodiment();
    await body.present(CompanionMode.DOCKED);
    await body.express('listening');
    await body.move('forward');
    expect(body.getMode()).toBe(CompanionMode.DOCKED);
    expect(body.getEmotion()).toBe('listening');
  });
});
