import { type } from './index';

describe('type tokens', () => {
  it('lets Dynamic Type grow instead of pinning line height', () => {
    expect(type.heading).not.toHaveProperty('lineHeight');
    expect(type.body).not.toHaveProperty('lineHeight');
    expect(type.caption).not.toHaveProperty('lineHeight');
    expect(type.titleMaxMultiplier).toBe(2);
  });
});
