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

  it('only the gate decides whether a name is missing', () => {
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 1,
        pendingInviteToken: null,
        needsDisplayName: false,
      }),
    ).toBe('/(signed-in)/home');
  });

  it('asks for a display name before family or invite screens', () => {
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 2,
        pendingInviteToken: 'invite-token',
        needsDisplayName: true,
      }),
    ).toBe('/(signed-in)/your-name');
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

  it('never redirects to an invite after the pending token is cleared', () => {
    expect(
      resolveEntryHref({
        hasSession: false,
        membershipCount: 0,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-out)/welcome');
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 0,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-in)/create');
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 1,
        pendingInviteToken: null,
      }),
    ).toBe('/(signed-in)/home');
    expect(
      resolveEntryHref({
        hasSession: true,
        membershipCount: 0,
        pendingInviteToken: null,
      }),
    ).not.toMatch(/^\/invite\//);
  });
});
