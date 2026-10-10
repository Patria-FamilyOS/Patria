import { countAdmins, isSpaceAdmin } from './roles';

describe('roles', () => {
  it('treats family admin and co admin as the same permission level', () => {
    expect(isSpaceAdmin('family_admin')).toBe(true);
    expect(isSpaceAdmin('co_admin')).toBe(true);
    expect(isSpaceAdmin('teen')).toBe(false);
  });

  it('counts the last remaining admin', () => {
    expect(countAdmins(['family_admin', 'teen'])).toBe(1);
    expect(countAdmins(['family_admin', 'co_admin'])).toBe(2);
  });
});
