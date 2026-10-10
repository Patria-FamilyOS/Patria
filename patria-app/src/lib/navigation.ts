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

export function headerWhenPushed(canGoBack: boolean) {
  return canGoBack ? pushedScreenHeader : hiddenRootHeader;
}

export function shouldInterceptInviteBack(actionType: string): boolean {
  return actionType === 'GO_BACK' || actionType === 'POP';
}
