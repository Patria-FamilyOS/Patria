import { countAdmins, isKeyEligibleRole, isSpaceAdmin } from './roles';

describe('roles', () => {
  it('treats family admin and co admin as the same permission level', () => {
    expect(isSpaceAdmin('family_admin')).toBe(true);
    expect(isSpaceAdmin('co_admin')).toBe(true);
    expect(isSpaceAdmin('teen')).toBe(false);
  });

  it('gives family keys only to admin, co admin, teen and elder', () => {
    expect(isKeyEligibleRole('family_admin')).toBe(true);
    expect(isKeyEligibleRole('co_admin')).toBe(true);
    expect(isKeyEligibleRole('teen')).toBe(true);
    expect(isKeyEligibleRole('elder')).toBe(true);
    expect(isKeyEligibleRole('extended_relative')).toBe(false);
    expect(isKeyEligibleRole('caregiver')).toBe(false);
    expect(isKeyEligibleRole('successor')).toBe(false);
  });

  it('counts the last remaining admin', () => {
    expect(countAdmins(['family_admin', 'teen'])).toBe(1);
    expect(countAdmins(['family_admin', 'co_admin'])).toBe(2);
  });
});
