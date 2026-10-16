import {
  countAdmins,
  isKeyEligibleRole,
  isMemoryRole,
  isRecoveryContactRole,
  isSpaceAdmin,
} from './roles';

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

  it('allows only adult members with keys as recovery contacts', () => {
    expect(isRecoveryContactRole('family_admin')).toBe(true);
    expect(isRecoveryContactRole('co_admin')).toBe(true);
    expect(isRecoveryContactRole('elder')).toBe(true);
    expect(isRecoveryContactRole('teen')).toBe(false);
    expect(isRecoveryContactRole('extended_relative')).toBe(false);
    expect(isRecoveryContactRole('caregiver')).toBe(false);
    expect(isRecoveryContactRole('successor')).toBe(false);
  });

  it('gives Memories to admins, teens, elders and extended relatives only', () => {
    expect(isMemoryRole('family_admin')).toBe(true);
    expect(isMemoryRole('co_admin')).toBe(true);
    expect(isMemoryRole('teen')).toBe(true);
    expect(isMemoryRole('elder')).toBe(true);
    expect(isMemoryRole('extended_relative')).toBe(true);
    expect(isMemoryRole('caregiver')).toBe(false);
    expect(isMemoryRole('successor')).toBe(false);
  });

  it('counts the last remaining admin', () => {
    expect(countAdmins(['family_admin', 'teen'])).toBe(1);
    expect(countAdmins(['family_admin', 'co_admin'])).toBe(2);
  });
});
