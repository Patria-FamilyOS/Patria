import * as SecureStore from 'expo-secure-store';
import { bytesToHex } from '@noble/hashes/utils.js';
import { deviceIdStoreKey, devicePrivateStoreKey, ensureDeviceIdentity } from './deviceIdentity';

const ELENA = '11111111-1111-1111-1111-111111111111';
const MARCO = '22222222-2222-2222-2222-222222222222';

function installMemoryStore(store: Map<string, string>): void {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    return store.get(key) ?? null;
  });
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
}

describe('per-account device identity', () => {
  it('keeps a separate device pair for each account on the same phone', async () => {
    const phone = new Map<string, string>();
    installMemoryStore(phone);

    const elena = await ensureDeviceIdentity(ELENA);
    const marco = await ensureDeviceIdentity(MARCO);
    expect(elena.deviceId).not.toBe(marco.deviceId);
    expect(bytesToHex(elena.privateKey)).not.toBe(bytesToHex(marco.privateKey));
    expect(phone.get(deviceIdStoreKey(ELENA))).toBe(elena.deviceId);
    expect(phone.get(deviceIdStoreKey(MARCO))).toBe(marco.deviceId);
    expect(phone.get(devicePrivateStoreKey(ELENA))).toBe(bytesToHex(elena.privateKey));
    expect(phone.has(devicePrivateStoreKey(MARCO))).toBe(true);

    const elenaAgain = await ensureDeviceIdentity(ELENA);
    expect(elenaAgain.deviceId).toBe(elena.deviceId);
  });

  it('does not let one account read another account device private key', async () => {
    const phone = new Map<string, string>();
    installMemoryStore(phone);
    const elena = await ensureDeviceIdentity(ELENA);
    await ensureDeviceIdentity(MARCO);
    expect(phone.get(devicePrivateStoreKey(MARCO))).not.toBe(bytesToHex(elena.privateKey));
    expect(phone.get(deviceIdStoreKey(MARCO))).not.toBe(elena.deviceId);
  });
});
