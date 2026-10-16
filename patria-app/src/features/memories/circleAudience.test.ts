import { defaultMemoryCircleId, moveNeedsConfirm } from './circleAudience';

describe('memory circle picker and move confirm', () => {
  it('defaults to Household when the uploader belongs to it', () => {
    expect(
      defaultMemoryCircleId([
        { id: 'ext', kind: 'extended_family' },
        { id: 'hh', kind: 'household' },
        { id: 'me', kind: 'only_me' },
      ]),
    ).toBe('hh');
  });

  it('asks to confirm only when the new circle has someone new', () => {
    expect(moveNeedsConfirm(['a', 'b'], ['a'])).toBe(false);
    expect(moveNeedsConfirm(['a', 'b'], ['a', 'b'])).toBe(false);
    expect(moveNeedsConfirm(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
  });
});
