import { isSpaceAdmin } from '../../lib/roles';

describe('home actions', () => {
  it('shows invite and add child only for admins', () => {
    expect(isSpaceAdmin('family_admin')).toBe(true);
    expect(isSpaceAdmin('co_admin')).toBe(true);
    expect(isSpaceAdmin('teen')).toBe(false);
    expect(isSpaceAdmin('elder')).toBe(false);
    expect(isSpaceAdmin('extended_relative')).toBe(false);
    expect(isSpaceAdmin('caregiver')).toBe(false);
    expect(isSpaceAdmin('successor')).toBe(false);
  });
});
