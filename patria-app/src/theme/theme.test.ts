import { textScale, type } from './index';

describe('type tokens', () => {
  it('caps scaling at 1.3 and does not pin line height', () => {
    expect(type.heading).not.toHaveProperty('lineHeight');
    expect(type.body).not.toHaveProperty('lineHeight');
    expect(type.caption).not.toHaveProperty('lineHeight');
    expect(textScale.maxFontSizeMultiplier).toBe(1.3);
  });
});
