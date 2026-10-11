import {
  authBoundaryNav,
  headerWhenPushed,
  hiddenRootHeader,
  inviteAcceptBackHref,
  isRootWithoutBack,
  pushedScreenHeader,
  routes,
  shouldInterceptInviteBack,
} from './navigation';

describe('navigation headers', () => {
  it('hides the header and back gesture on root screens', () => {
    expect(headerWhenPushed(false)).toBe(hiddenRootHeader);
    expect(hiddenRootHeader.headerShown).toBe(false);
    expect(hiddenRootHeader.gestureEnabled).toBe(false);
    expect(isRootWithoutBack('welcome', true)).toBe(true);
    expect(isRootWithoutBack('home', true)).toBe(true);
    expect(isRootWithoutBack('create', false)).toBe(true);
    expect(isRootWithoutBack('create', true)).toBe(false);
  });

  it('shows a back header and swipe gesture on pushed screens', () => {
    expect(headerWhenPushed(true)).toBe(pushedScreenHeader);
    expect(pushedScreenHeader.headerShown).toBe(true);
    expect(pushedScreenHeader.gestureEnabled).toBe(true);
    expect(headerWhenPushed(true)).toEqual(
      expect.objectContaining({
        headerShown: true,
        gestureEnabled: true,
      }),
    );
  });

  it('keeps compose invite off the accept-invite path', () => {
    expect(routes.inviteSomeone).toBe('/(signed-in)/invite-someone');
    expect(routes.inviteAccept('abc')).toBe('/invite/abc');
  });

  it('sends invite swipe-back to the gate instead of popping a group', () => {
    expect(shouldInterceptInviteBack('GO_BACK')).toBe(true);
    expect(shouldInterceptInviteBack('POP')).toBe(true);
    expect(shouldInterceptInviteBack('REPLACE')).toBe(false);
    expect(shouldInterceptInviteBack('NAVIGATE')).toBe(false);
    expect(inviteAcceptBackHref()).toBe('/');
  });

  it('crosses signed-in and signed-out with replace, never push', () => {
    expect(authBoundaryNav()).toBe('replace');
    expect(authBoundaryNav()).not.toBe('push');
  });
});
