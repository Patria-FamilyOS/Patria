export const ADMIN_ROLES = ['family_admin', 'co_admin'] as const;

export type SpaceRole =
  | 'family_admin'
  | 'co_admin'
  | 'teen'
  | 'elder'
  | 'extended_relative'
  | 'caregiver'
  | 'successor';

export const INVITE_ROLES: SpaceRole[] = [
  'family_admin',
  'co_admin',
  'teen',
  'elder',
  'extended_relative',
  'caregiver',
  'successor',
];

export function isSpaceAdmin(role: string | null | undefined): boolean {
  return role === 'family_admin' || role === 'co_admin';
}

export function countAdmins(roles: (string | null | undefined)[]): number {
  return roles.filter((role) => isSpaceAdmin(role)).length;
}
