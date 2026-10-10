import { Redirect, Stack } from 'expo-router';

import { LoadingState, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth-context';
import { copy } from '../../src/lib/copy';
import { headerWhenPushed, hiddenRootHeader, pushedScreenHeader } from '../../src/lib/navigation';

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
      <Stack.Screen name="welcome" options={hiddenRootHeader} />
      <Stack.Screen name="sign-in" options={pushedScreenHeader} />
      <Stack.Screen name="sign-up" options={pushedScreenHeader} />
      <Stack.Screen
        name="verify"
        options={({ navigation }) => headerWhenPushed(navigation.canGoBack())}
      />
    </Stack>
  );
}
