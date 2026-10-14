import * as SecureStore from 'expo-secure-store';

import { secretsEqual, wipe } from './bytes';
import {
  deviceIdStoreKey,
  devicePrivateStoreKey,
  ensureDeviceIdentity,
} from './deviceIdentity';
import {
  cacheFamilySecrets,
  discardLocalFamilySecrets,
  familyKeyStoreKey,
  loadCachedFamilyKey,
  recoveryKeyStoreKey,
  resetFamilyKeyMemory,
} from './keyStore';
import { randomKey32 } from './random';
import { getSecretBytes, getSecretText } from './secureKeys';

function installMemoryStore(store: Map<string, string>): void {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    return store.get(key) ?? null;
  });
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
}

describe('discardLocalFamilySecrets', () => {
  it('wipes this space family key from memory and SecureStore and keeps the device key pair', async () => {
    const store = new Map<string, string>();
    installMemoryStore(store);
    resetFamilyKeyMemory();
    const userId = '11111111-1111-1111-1111-111111111111';
    const spaceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const otherSpace = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const device = await ensureDeviceIdentity(userId);
    const familyKey = randomKey32();
    const otherKey = randomKey32();
    await cacheFamilySecrets(userId, spaceId, familyKey);
    await cacheFamilySecrets(userId, otherSpace, otherKey);

    await discardLocalFamilySecrets(userId, spaceId);

    expect(await loadCachedFamilyKey(userId, spaceId)).toBeNull();
    expect(store.has(familyKeyStoreKey(userId, spaceId))).toBe(false);
    expect(store.has(recoveryKeyStoreKey(userId, spaceId))).toBe(false);
    const kept = await loadCachedFamilyKey(userId, otherSpace);
    expect(kept && secretsEqual(kept, otherKey)).toBe(true);
    expect(await getSecretText(deviceIdStoreKey(userId))).toBe(device.deviceId);
    expect(await getSecretBytes(devicePrivateStoreKey(userId))).not.toBeNull();
    wipe(familyKey);
    wipe(otherKey);
    if (kept) {
      wipe(kept);
    }
  });
});
