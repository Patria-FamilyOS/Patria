import { copy } from './copy';
import { colors } from '../theme';

export const hiddenRootHeader = {
  headerShown: false,
  gestureEnabled: false,
  title: copy.appName,
  headerBackTitle: '',
  headerBackButtonDisplayMode: 'minimal',
} as const;

export const pushedScreenHeader = {
  headerShown: true,
  gestureEnabled: true,
  headerBackTitle: '',
  headerBackButtonDisplayMode: 'minimal',
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerStyle: { backgroundColor: colors.background },
} as const;

export const screenTitles = {
  welcome: copy.welcome.title,
  signIn: copy.auth.signInTitle,
  signUp: copy.auth.signUpTitle,
  verify: copy.auth.verifyTitle,
  home: copy.appName,
  createFamily: copy.createFamily.title,
  ready: copy.ready.title,
  inviteSomeone: copy.invite.title,
  addChild: copy.child.title,
  member: copy.member.title,
  child: copy.child.title,
  inviteAccept: copy.invitePreview.title,
  joinFamily: copy.home.joinFamily,
  yourName: copy.auth.nameLabel,
  yourPhones: copy.phones.title,
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
  joinFamily: '/(signed-in)/join-family',
  yourName: '/(signed-in)/your-name',
  yourPhones: '/(signed-in)/your-phones',
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

export function inviteAcceptBackHref(): '/' {
  return routes.gate;
}

/** Crossing signed-in / signed-out must not leave a swipe-back stack. */
export type AuthBoundaryNav = 'replace' | 'redirect';

export function authBoundaryNav(): AuthBoundaryNav {
  return 'replace';
}
