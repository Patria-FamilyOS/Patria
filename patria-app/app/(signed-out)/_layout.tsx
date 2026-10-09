import { Stack } from 'expo-router';

export default function SignedOutLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
