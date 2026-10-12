import { bytesToHex } from '@noble/hashes/utils.js';
import * as SecureStore from 'expo-secure-store';
import { secretsEqual, wipe } from './bytes';
import { ensureDeviceIdentity } from './deviceIdentity';
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

function memoryGateway(options?: {
  meta?: { keyEpoch: number } | null;
  commit?: FamilyKeyGateway['commitCeremony'];
  wraps?: string[];
}): FamilyKeyGateway {
  return {
    fetchMeta: async () => options?.meta ?? null,
    fetchOwnWrapDeviceIds: async () => options?.wraps ?? [],
    commitCeremony:
      options?.commit ??
      (async () => ({ ok: true as const })),
  };
}

describe('founding family key ceremony', () => {
  beforeEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('wraps keys for create family without sending plaintext', async () => {
    const device = await ensureDeviceIdentity();
    const material = createFoundingMaterial({
      spaceId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      deviceId: device.deviceId,
      publicKey: device.publicKey,
    });

    expect(material.payload.wrappedFamilyKey.length).toBeGreaterThan(32);
    expect(payloadContainsPlaintextKey(material.payload, material.familyKey)).toBe(false);
    expect(payloadContainsPlaintextKey(material.payload, material.recoveryKey)).toBe(false);

    const opened = unwrapFoundingFamilyKey(
      material.payload,
      device.privateKey,
      '22222222-2222-2222-2222-222222222222',
    );
    expect(secretsEqual(opened, material.familyKey)).toBe(true);
    wipe(material.familyKey);
    wipe(material.recoveryKey);
  });

  it('caches keys after a successful create-family commit', async () => {
    const stored = new Map<string, string>();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      return stored.get(key) ?? null;
    });
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        stored.set(key, value);
      },
    );

    const spaceId = '11111111-1111-1111-1111-111111111111';
    const status = await runFoundingCeremony(
      { spaceId, userId: '22222222-2222-2222-2222-222222222222' },
      memoryGateway(),
    );
    expect(status).toBe('ready');
    expect(await getSecretBytes(familyKeyStoreKey(spaceId))).not.toBeNull();
    expect(await getSecretBytes(recoveryKeyStoreKey(spaceId))).not.toBeNull();
  });

  it('runs lazy creation when an admin opens a family with no meta', async () => {
    const commit = jest.fn(async () => ({ ok: true as const }));
    const status = await ensureKeysForOpenFamily(
      {
        spaceId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        role: 'co_admin',
      },
      memoryGateway({ meta: null, commit }),
    );
    expect(commit).toHaveBeenCalled();
    expect(status).toBe('ready');
  });

  it('does not create a key when meta already exists', async () => {
    const commit = jest.fn(async () => ({ ok: true as const }));
    const status = await ensureKeysForOpenFamily(
      {
        spaceId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        role: 'family_admin',
      },
      memoryGateway({ meta: { keyEpoch: 1 }, commit, wraps: [] }),
    );
    expect(commit).not.toHaveBeenCalled();
    expect(status).toBe('waiting');
  });

  it('discards the local key when this phone loses the race', async () => {
    const stored = new Map<string, string>();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      return stored.get(key) ?? null;
    });
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        stored.set(key, value);
      },
    );
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      stored.delete(key);
    });

    const spaceId = '11111111-1111-1111-1111-111111111111';
    const status = await runFoundingCeremony(
      { spaceId, userId: '22222222-2222-2222-2222-222222222222' },
      memoryGateway({
        commit: async () => ({ ok: false, code: '23505' }),
      }),
    );
    expect(status).toBe('waiting');
    expect(await getSecretBytes(familyKeyStoreKey(spaceId))).toBeNull();
    expect(await getSecretBytes(recoveryKeyStoreKey(spaceId))).toBeNull();
  });

  it('never creates a family key for a non admin', async () => {
    const commit = jest.fn(async () => ({ ok: true as const }));
    const status = await ensureKeysForOpenFamily(
      {
        spaceId: '11111111-1111-1111-1111-111111111111',
        userId: '33333333-3333-3333-3333-333333333333',
        role: 'teen',
      },
      memoryGateway({ meta: null, commit }),
    );
    expect(commit).not.toHaveBeenCalled();
    expect(status).toBe('waiting');
  });

  it('leaves nothing half saved when the server call fails', async () => {
    const stored = new Map<string, string>();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      return stored.get(key) ?? null;
    });
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        stored.set(key, value);
      },
    );
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      stored.delete(key);
    });

    const spaceId = '11111111-1111-1111-1111-111111111111';
    const status = await runFoundingCeremony(
      { spaceId, userId: '22222222-2222-2222-2222-222222222222' },
      memoryGateway({
        commit: async () => {
          throw new Error('network');
        },
      }),
    );
    expect(status).toBe('waiting');
    expect(await getSecretBytes(familyKeyStoreKey(spaceId))).toBeNull();
    await discardLocalFamilySecrets(spaceId);
  });

  it('does not put the family key hex in the postgres payload', async () => {
    const device = await ensureDeviceIdentity();
    const material = createFoundingMaterial({
      spaceId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      deviceId: device.deviceId,
      publicKey: device.publicKey,
    });
    const familyHex = bytesToHex(material.familyKey);
    expect(bytesToHex(material.payload.wrappedFamilyKey).includes(familyHex)).toBe(false);
    expect(bytesToHex(material.payload.familyKeyUnderRecovery).includes(familyHex)).toBe(false);
  });
});
