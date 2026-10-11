import { Redirect, Stack } from 'expo-router';

import { LoadingState, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth-context';
import { copy } from '../../src/lib/copy';
import { headerWhenPushed, hiddenRootHeader, pushedScreenHeader } from '../../src/lib/navigation';

export const unstable_settings = {
  initialRouteName: 'home',
};

export default function SignedInLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <Screen>
        <LoadingState message={copy.common.loading} />
      </Screen>
    );
  }

  if (!session) {
    return <Redirect href="/" />;
  }

  return (
    <Stack initialRouteName="home" screenOptions={hiddenRootHeader}>
      <Stack.Screen name="home" options={hiddenRootHeader} />
      <Stack.Screen
        name="create"
        options={({ navigation }) => headerWhenPushed(navigation.canGoBack())}
      />
      <Stack.Screen
        name="ready"
        options={({ navigation }) => headerWhenPushed(navigation.canGoBack())}
      />
      <Stack.Screen name="invite-someone" options={pushedScreenHeader} />
      <Stack.Screen name="add-child" options={pushedScreenHeader} />
      <Stack.Screen name="member/[userId]" options={pushedScreenHeader} />
      <Stack.Screen name="child/[childId]" options={pushedScreenHeader} />
    </Stack>
  );
}
