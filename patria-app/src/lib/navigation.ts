import { colors } from '../theme';

export const hiddenRootHeader = {
  headerShown: false,
  gestureEnabled: false,
} as const;

export const pushedScreenHeader = {
  headerShown: true,
  gestureEnabled: true,
  headerBackTitle: '',
  headerTitle: '',
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerStyle: { backgroundColor: colors.background },
} as const;

export const routes = {
  gate: '/',
  welcome: '/(signed-out)/welcome',
  home: '/(signed-in)/home',
  createFamily: '/(signed-in)/create',
  inviteSomeone: '/(signed-in)/invite-someone',
  addChild: '/(signed-in)/add-child',
  member: (userId: string) => `/(signed-in)/member/${userId}` as const,
  inviteAccept: (token: string) => `/invite/${token}` as const,
} as const;

export function headerWhenPushed(canGoBack: boolean) {
  return canGoBack ? pushedScreenHeader : hiddenRootHeader;
}

export function isRootWithoutBack(
  screen: 'welcome' | 'home' | 'create',
  canGoBack: boolean,
): boolean {
  if (screen === 'welcome' || screen === 'home') {
    return true;
  }
  return !canGoBack;
}

export function shouldInterceptInviteBack(actionType: string): boolean {
  return actionType === 'GO_BACK' || actionType === 'POP';
}

export function inviteAcceptBackHref(): '/' {
  return routes.gate;
}

/** Crossing signed-in / signed-out must not leave a swipe-back stack. */
export type AuthBoundaryNav = 'replace' | 'redirect';

export function authBoundaryNav(): AuthBoundaryNav {
  return 'replace';
}
