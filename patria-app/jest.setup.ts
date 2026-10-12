/// <reference types="jest" />

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
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
