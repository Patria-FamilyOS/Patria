import { Redirect, Stack } from 'expo-router';

import { LoadingState, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth-context';
import { copy } from '../../src/lib/copy';
import {
  headerWhenPushed,
  hiddenRootHeader,
  pushedScreenHeader,
  screenTitles,
} from '../../src/lib/navigation';

export const unstable_settings = {
  initialRouteName: 'welcome',
};

export default function SignedOutLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <Screen>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <Stack initialRouteName="welcome" screenOptions={hiddenRootHeader}>
      <Stack.Screen name="welcome" options={{ ...hiddenRootHeader, title: screenTitles.welcome }} />
      <Stack.Screen name="sign-in" options={{ ...pushedScreenHeader, title: screenTitles.signIn }} />
      <Stack.Screen name="sign-up" options={{ ...pushedScreenHeader, title: screenTitles.signUp }} />
      <Stack.Screen
        name="verify"
        options={({ navigation }) => ({
          ...headerWhenPushed(navigation.canGoBack()),
          title: screenTitles.verify,
        })}
      />
    </Stack>
  );
}
