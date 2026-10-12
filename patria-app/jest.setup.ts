/// <reference types="jest" />

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomValues: (typedArray: Uint8Array): Uint8Array => {
    globalThis.crypto.getRandomValues(typedArray as never);
    return typedArray;
  },
}));

jest.mock('expo-router', () => {
  const push = jest.fn();
  const replace = jest.fn();
  return {
    useRouter: () => ({ push, replace }),
    useNavigation: () => ({
      canGoBack: () => false,
      addListener: () => () => undefined,
    }),
    useLocalSearchParams: () => ({}),
    Redirect: () => null,
    Stack: () => null,
  };
});
