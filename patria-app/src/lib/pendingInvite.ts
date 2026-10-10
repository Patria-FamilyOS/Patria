import * as SecureStore from 'expo-secure-store';

const KEY = 'patria.pendingInviteToken';

export async function savePendingInviteToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function readPendingInviteToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function clearPendingInviteToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
