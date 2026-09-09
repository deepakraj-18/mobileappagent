import { TaskStep } from '../src/agent/TaskStep';

describe('TaskStep.tryParse', () => {
  it('parses click_text from Flutter wire JSON', () => {
    const step = TaskStep.tryParse(
      '{"action":"click_text","params":{"text":"Search"},"reasoning":"tap"}',
    );
    expect(step?.action).toBe(TaskStep.actionClickText);
    expect(step?.stringParam('text')).toBe('Search');
  });

  it('normalises hub SCREAMING_SNAKE actions', () => {
    const step = TaskStep.tryParse(
      '{"action":"CLICK_TEXT","params":{"text":"OK"}}',
    );
    expect(step?.action).toBe('click_text');
  });

  it('parses done / is_complete', () => {
    const step = TaskStep.tryParse('{"action":"done","is_complete":true}');
    expect(step?.action).toBe(TaskStep.actionDone);
    expect(step?.isComplete).toBe(true);
  });

  it('rejects prose and unknown actions', () => {
    expect(TaskStep.tryParse('I cannot help with that')).toBeNull();
    expect(TaskStep.tryParse('{"action":"explode"}')).toBeNull();
  });

  it('fromHubAction accepts ActionObject', () => {
    const step = TaskStep.fromHubAction(
      { action: 'WAIT', params: { ms: 100 } },
      'pause',
    );
    expect(step?.action).toBe('wait');
    expect(step?.intParam('ms')).toBe(100);
    expect(step?.reasoning).toBe('pause');
  });
});
