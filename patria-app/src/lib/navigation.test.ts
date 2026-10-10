import { headerWhenPushed, hiddenRootHeader, pushedScreenHeader, shouldInterceptInviteBack } from './navigation';

describe('navigation headers', () => {
  it('hides the header and back gesture on root screens', () => {
    expect(headerWhenPushed(false)).toBe(hiddenRootHeader);
    expect(hiddenRootHeader.headerShown).toBe(false);
    expect(hiddenRootHeader.gestureEnabled).toBe(false);
  });

  it('shows a back header and swipe gesture on pushed screens', () => {
    expect(headerWhenPushed(true)).toBe(pushedScreenHeader);
    expect(pushedScreenHeader.headerShown).toBe(true);
    expect(pushedScreenHeader.gestureEnabled).toBe(true);
  });

  it('sends invite swipe-back to the gate instead of popping a group', () => {
    expect(shouldInterceptInviteBack('GO_BACK')).toBe(true);
    expect(shouldInterceptInviteBack('POP')).toBe(true);
    expect(shouldInterceptInviteBack('REPLACE')).toBe(false);
    expect(shouldInterceptInviteBack('NAVIGATE')).toBe(false);
  });
});
