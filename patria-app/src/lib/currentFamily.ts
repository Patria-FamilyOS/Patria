import * as SecureStore from 'expo-secure-store';

const KEY = 'patria.currentFamilyId';

export async function readCurrentFamilyId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function writeCurrentFamilyId(id: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, id);
}
