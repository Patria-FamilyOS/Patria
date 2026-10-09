import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number): string {
  return `${key}.chunk.${index}`;
}

function countKey(key: string): string {
  return `${key}.count`;
}

async function deleteNativeChunks(key: string): Promise<void> {
  const rawCount = await SecureStore.getItemAsync(countKey(key));
  if (rawCount) {
    const count = Number(rawCount);
    for (let index = 0; index < count; index += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, index));
    }
    await SecureStore.deleteItemAsync(countKey(key));
  }
  await SecureStore.deleteItemAsync(key);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(key) ?? null;
    }

    const rawCount = await SecureStore.getItemAsync(countKey(key));
    if (!rawCount) {
      return SecureStore.getItemAsync(key);
    }

    const count = Number(rawCount);
    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, index));
      if (part == null) {
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }

    await deleteNativeChunks(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(countKey(key), String(chunks));
    for (let index = 0; index < chunks; index += 1) {
      await SecureStore.setItemAsync(
        chunkKey(key, index),
        value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
      );
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await deleteNativeChunks(key);
  },
};
