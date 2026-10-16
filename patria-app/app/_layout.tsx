import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import { assertE2ePhotoSamplesGated } from '../src/features/memories/e2ePhotoSamples';
import { AuthProvider } from '../src/lib/auth-context';
import { hiddenRootHeader, pushedScreenHeader, screenTitles } from '../src/lib/navigation';
import { queryClient } from '../src/lib/queryClient';
import { colors } from '../src/theme';

assertE2ePhotoSamplesGated();

if (process.env.EXPO_PUBLIC_E2E === '1') {
  LogBox.ignoreAllLogs(true);
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                ...hiddenRootHeader,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" options={{ title: screenTitles.home }} />
              <Stack.Screen
                name="(signed-out)"
                options={{ ...hiddenRootHeader, title: screenTitles.home }}
              />
              <Stack.Screen
                name="(signed-in)"
                options={{ ...hiddenRootHeader, title: screenTitles.home }}
              />
              <Stack.Screen
                name="invite/[token]"
                options={{
                  ...pushedScreenHeader,
                  title: screenTitles.inviteAccept,
                  gestureEnabled: true,
                }}
              />
            </Stack>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
