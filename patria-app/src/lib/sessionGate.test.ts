import { resolveEntryHref } from './sessionGate';

describe('resolveEntryHref', () => {
  it('sends a signed-out user to welcome', () => {
    expect(
      resolveEntryHref({
        hasSession: false,
        membershipCount: 0,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-out)/welcome');
  });

  it('sends a signed-in user with no family to create family', () => {
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 0,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-in)/create');
  });

  it('sends a signed-in user with a family to home', () => {
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 2,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-in)/home');
  });

  it('returns a signed-out invite visitor to sign in first, not the invite screen', () => {
    expect(
      resolveEntryHref({
        hasSession: false,
        membershipCount: 0,
        pendingInviteToken: 'invite-token',
      }),
    ).toBe('/(signed-out)/welcome');
  });

  it('returns a signed-in user to the invite they opened before auth', () => {
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 0,
        pendingInviteToken: 'invite-token',
      }),
    ).toBe('/invite/invite-token');
  });
});
