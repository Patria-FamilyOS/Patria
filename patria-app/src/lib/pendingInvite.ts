import * as SecureStore from 'expo-secure-store';

import { queryClient } from './queryClient';

const KEY = 'patria.pendingInviteToken';

export async function savePendingInviteToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function readPendingInviteToken(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(KEY);
  return value && value.length > 0 ? value : null;
}

export async function clearPendingInviteToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  queryClient.removeQueries({ queryKey: ['pending-invite'] });
}
