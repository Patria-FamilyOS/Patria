export type EntryHref =
  | '/(signed-out)/welcome'
  | '/(signed-in)/your-name'
  | '/(signed-in)/create'
  | '/(signed-in)/home'
  | `/invite/${string}`;

export function resolveEntryHref(input: {
  hasSession: boolean;
  membershipCount: number;
  pendingInviteToken: string | null;
  needsDisplayName?: boolean;
}): EntryHref {
  if (!input.hasSession) {
    return '/(signed-out)/welcome';
  }
  if (input.needsDisplayName) {
    return '/(signed-in)/your-name';
  }
  if (input.pendingInviteToken) {
    return `/invite/${input.pendingInviteToken}`;
  }
  if (input.membershipCount === 0) {
    return '/(signed-in)/create';
  }
  return '/(signed-in)/home';
}
