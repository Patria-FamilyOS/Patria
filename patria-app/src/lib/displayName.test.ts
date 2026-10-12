import { copy } from './copy';
import { hasDisplayName, memberDisplayName } from './displayName';

describe('member display names', () => {
  it('treats blank and whitespace as missing', () => {
    expect(hasDisplayName(null)).toBe(false);
    expect(hasDisplayName('')).toBe(false);
    expect(hasDisplayName('   ')).toBe(false);
    expect(hasDisplayName('Elena')).toBe(true);
  });

  it('falls back to Family member instead of a blank card', () => {
    expect(memberDisplayName(null)).toBe(copy.member.fallbackName);
    expect(memberDisplayName('')).toBe(copy.member.fallbackName);
    expect(memberDisplayName('  ')).toBe(copy.member.fallbackName);
    expect(memberDisplayName('Elena Rivera')).toBe('Elena Rivera');
  });
});
