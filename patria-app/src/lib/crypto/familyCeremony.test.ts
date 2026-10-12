import { bytesToHex } from '@noble/hashes/utils.js';
import * as SecureStore from 'expo-secure-store';
import { secretsEqual, wipe } from './bytes';
import { ensureDeviceIdentity } from './deviceIdentity';
import type { DeviceAccessGateway } from './deviceAccess';
import {
  createFoundingMaterial,
  discardLocalFamilySecrets,
  ensureKeysForOpenFamily,
  familyKeyStoreKey,
  payloadContainsPlaintextKey,
  recoveryKeyStoreKey,
  runFoundingCeremony,
  unwrapFoundingFamilyKey,
  type FamilyKeyGateway,
} from './familyCeremony';
import { getSecretBytes } from './secureKeys';

const USER = '22222222-2222-2222-2222-222222222222';
const TEEN = '33333333-3333-3333-3333-333333333333';
const SPACE = '11111111-1111-1111-1111-111111111111';

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

function memoryGateway(options?: {
  meta?: { keyEpoch: number } | null;
  commit?: FamilyKeyGateway['commitCeremony'];
  wraps?: FamilyKeyGateway['fetchOwnWraps'];
}): FamilyKeyGateway {
  return {
    fetchMeta: async () => options?.meta ?? null,
    fetchOwnWraps: options?.wraps ?? (async () => []),
    commitCeremony: options?.commit ?? (async () => ({ ok: true as const })),
  };
}

function memoryAccess(insertNotice = jest.fn(async () => undefined)): DeviceAccessGateway {
  return {
    upsertDevicePublicKey: jest.fn(async () => undefined),
    countOwnWraps: jest.fn(async () => 0),
    insertNotice,
    listNotices: jest.fn(async () => []),
    fetchOwnWrap: jest.fn(async () => null),
    insertFamilyWrap: jest.fn(async () => undefined),
    insertRecoveryWrap: jest.fn(async () => undefined),
    deleteNotice: jest.fn(async () => undefined),
  };
}

describe('founding family key ceremony', () => {
  beforeEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('wraps keys for create family without sending plaintext', async () => {
    const device = await ensureDeviceIdentity(USER);
    const material = createFoundingMaterial({
      spaceId: SPACE,
      userId: USER,
      deviceId: device.deviceId,
      publicKey: device.publicKey,
    });

    expect(material.payload.wrappedFamilyKey.length).toBeGreaterThan(32);
    expect(payloadContainsPlaintextKey(material.payload, material.familyKey)).toBe(false);
    expect(payloadContainsPlaintextKey(material.payload, material.recoveryKey)).toBe(false);

    const opened = unwrapFoundingFamilyKey(material.payload, device.privateKey, USER);
    expect(secretsEqual(opened, material.familyKey)).toBe(true);
    wipe(material.familyKey);
    wipe(material.recoveryKey);
  });

  it('caches keys after a successful create-family commit', async () => {
    const stored = new Map<string, string>();
    installMemoryStore(stored);

    const status = await runFoundingCeremony({ spaceId: SPACE, userId: USER }, memoryGateway());
    expect(status).toBe('ready');
    expect(await getSecretBytes(familyKeyStoreKey(USER, SPACE))).not.toBeNull();
    expect(await getSecretBytes(recoveryKeyStoreKey(USER, SPACE))).not.toBeNull();
  });

  it('runs lazy creation when an admin opens a family with no meta', async () => {
    const commit = jest.fn(async () => ({ ok: true as const }));
    const status = await ensureKeysForOpenFamily(
      { spaceId: SPACE, userId: USER, role: 'co_admin' },
      memoryGateway({ meta: null, commit }),
      memoryAccess(),
    );
    expect(commit).toHaveBeenCalled();
    expect(status).toBe('ready');
  });

  it('does not create a key when meta already exists', async () => {
    const commit = jest.fn(async () => ({ ok: true as const }));
    const insertNotice = jest.fn(async () => undefined);
    const status = await ensureKeysForOpenFamily(
      { spaceId: SPACE, userId: USER, role: 'family_admin' },
      memoryGateway({ meta: { keyEpoch: 1 }, commit }),
      memoryAccess(insertNotice),
    );
    expect(commit).not.toHaveBeenCalled();
    expect(insertNotice).toHaveBeenCalled();
    expect(status).toBe('waiting');
  });

  it('discards the local key when this phone loses the race', async () => {
    const stored = new Map<string, string>();
    installMemoryStore(stored);

    const status = await runFoundingCeremony(
      { spaceId: SPACE, userId: USER },
      memoryGateway({
        commit: async () => ({ ok: false, code: '23505' }),
      }),
    );
    expect(status).toBe('waiting');
    expect(await getSecretBytes(familyKeyStoreKey(USER, SPACE))).toBeNull();
    expect(await getSecretBytes(recoveryKeyStoreKey(USER, SPACE))).toBeNull();
  });

  it('never creates a family key for a non admin', async () => {
    const commit = jest.fn(async () => ({ ok: true as const }));
    const insertNotice = jest.fn(async () => undefined);
    const status = await ensureKeysForOpenFamily(
      { spaceId: SPACE, userId: TEEN, role: 'teen' },
      memoryGateway({ meta: null, commit }),
      memoryAccess(insertNotice),
    );
    expect(commit).not.toHaveBeenCalled();
    expect(insertNotice).toHaveBeenCalled();
    expect(status).toBe('waiting');
  });

  it('leaves nothing half saved when the server call fails', async () => {
    const stored = new Map<string, string>();
    installMemoryStore(stored);

    const status = await runFoundingCeremony(
      { spaceId: SPACE, userId: USER },
      memoryGateway({
        commit: async () => {
          throw new Error('network');
        },
      }),
    );
    expect(status).toBe('waiting');
    expect(await getSecretBytes(familyKeyStoreKey(USER, SPACE))).toBeNull();
    await discardLocalFamilySecrets(USER, SPACE);
  });

  it('does not put the family key hex in the postgres payload', async () => {
    const device = await ensureDeviceIdentity(USER);
    const material = createFoundingMaterial({
      spaceId: SPACE,
      userId: USER,
      deviceId: device.deviceId,
      publicKey: device.publicKey,
    });
    const familyHex = bytesToHex(material.familyKey);
    expect(bytesToHex(material.payload.wrappedFamilyKey).includes(familyHex)).toBe(false);
    expect(bytesToHex(material.payload.familyKeyUnderRecovery).includes(familyHex)).toBe(false);
  });
});
