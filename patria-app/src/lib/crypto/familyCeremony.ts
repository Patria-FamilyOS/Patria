// SECURITY REVIEW REQUIRED
import { bytesToHex } from '@noble/hashes/utils.js';
import { logKeyStep } from '../devLog';
import { isSpaceAdmin } from '../roles';
import { supabase } from '../supabase';
import { sealXChaCha20Poly1305 } from './aead';
import { wipe } from './bytes';
import { ensureDeviceIdentity } from './deviceIdentity';
import {
  requestFirstDeviceAccess,
  supabaseDeviceAccessGateway,
  type DeviceAccessGateway,
} from './deviceAccess';
import {
  cacheFamilySecrets,
  discardLocalFamilySecrets,
  familyKeyStoreKey,
} from './keyStore';
import { fromPgBytea, toPgBytea } from './pgBytea';
import { randomKey32 } from './random';
import { getSecretBytes } from './secureKeys';
import { encodeEpochAad, unwrapKeyFromDevice, wrapKeyToDevice } from './wrap';

export {
  cacheFamilySecrets,
  discardLocalFamilySecrets,
  familyKeyStoreKey,
  recoveryKeyStoreKey,
} from './keyStore';

export type FamilyKeyStatus = 'ready' | 'waiting';

export type OwnWrap = {
  deviceId: string;
  wrappedKey: Uint8Array;
  keyEpoch: number;
};

export type CeremonyPayload = {
  spaceId: string;
  deviceId: string;
  publicKey: Uint8Array;
  wrappedFamilyKey: Uint8Array;
  wrappedRecoveryKey: Uint8Array;
  familyKeyUnderRecovery: Uint8Array;
  keyEpoch: number;
};

export type FamilyKeyGateway = {
  fetchMeta(spaceId: string): Promise<{ keyEpoch: number } | null>;
  fetchOwnWraps(spaceId: string, userId: string): Promise<OwnWrap[]>;
  commitCeremony(payload: CeremonyPayload): Promise<{ ok: true } | { ok: false; code: string }>;
};

const KEY_EPOCH = 1;

export { toPgBytea };

export function createFoundingMaterial(input: {
  spaceId: string;
  userId: string;
  deviceId: string;
  publicKey: Uint8Array;
}): {
  familyKey: Uint8Array;
  recoveryKey: Uint8Array;
  payload: CeremonyPayload;
} {
  const familyKey = randomKey32();
  const recoveryKey = randomKey32();
  const aad = {
    familySpaceId: input.spaceId,
    keyEpoch: KEY_EPOCH,
    userId: input.userId,
    deviceId: input.deviceId,
  };
  const wrappedFamilyKey = wrapKeyToDevice(familyKey, input.publicKey, aad);
  const wrappedRecoveryKey = wrapKeyToDevice(recoveryKey, input.publicKey, aad);
  const familyKeyUnderRecovery = sealXChaCha20Poly1305(
    recoveryKey,
    familyKey,
    encodeEpochAad(input.spaceId, KEY_EPOCH),
  );
  return {
    familyKey,
    recoveryKey,
    payload: {
      spaceId: input.spaceId,
      deviceId: input.deviceId,
      publicKey: input.publicKey,
      wrappedFamilyKey,
      wrappedRecoveryKey,
      familyKeyUnderRecovery,
      keyEpoch: KEY_EPOCH,
    },
  };
}

export function payloadContainsPlaintextKey(
  payload: CeremonyPayload,
  secret: Uint8Array,
): boolean {
  const needle = bytesToHex(secret);
  return (
    bytesToHex(payload.publicKey) === needle ||
    bytesToHex(payload.wrappedFamilyKey) === needle ||
    bytesToHex(payload.wrappedRecoveryKey) === needle ||
    bytesToHex(payload.familyKeyUnderRecovery) === needle
  );
}

export const supabaseFamilyKeyGateway: FamilyKeyGateway = {
  async fetchMeta(spaceId) {
    const { data, error } = await supabase
      .from('family_key_meta')
      .select('key_epoch')
      .eq('family_space_id', spaceId)
      .maybeSingle();
    if (error) {
      logKeyStep('fetch_family_key_meta');
      throw error;
    }
    if (!data) {
      return null;
    }
    return { keyEpoch: data.key_epoch as number };
  },

  async fetchOwnWraps(spaceId, userId) {
    const { data, error } = await supabase
      .from('family_key_wraps')
      .select('device_id, wrapped_key, key_epoch')
      .eq('family_space_id', spaceId)
      .eq('user_id', userId);
    if (error) {
      logKeyStep('fetch_family_key_wraps');
      throw error;
    }
    return (data ?? []).map((row) => ({
      deviceId: row.device_id as string,
      wrappedKey: fromPgBytea(row.wrapped_key),
      keyEpoch: row.key_epoch as number,
    }));
  },

  async commitCeremony(payload) {
    const { error } = await supabase.rpc('commit_family_key_ceremony', {
      p_space_id: payload.spaceId,
      p_device_id: payload.deviceId,
      p_public_key: toPgBytea(payload.publicKey),
      p_wrapped_family_key: toPgBytea(payload.wrappedFamilyKey),
      p_wrapped_recovery_key: toPgBytea(payload.wrappedRecoveryKey),
      p_family_key_under_recovery: toPgBytea(payload.familyKeyUnderRecovery),
      p_key_epoch: payload.keyEpoch,
    });
    if (!error) {
      return { ok: true };
    }
    return { ok: false, code: error.code ?? 'unknown' };
  },
};

export async function runFoundingCeremony(
  input: { spaceId: string; userId: string },
  gateway: FamilyKeyGateway = supabaseFamilyKeyGateway,
): Promise<FamilyKeyStatus> {
  const device = await ensureDeviceIdentity(input.userId);
  const material = createFoundingMaterial({
    spaceId: input.spaceId,
    userId: input.userId,
    deviceId: device.deviceId,
    publicKey: device.publicKey,
  });
  try {
    const result = await gateway.commitCeremony(material.payload);
    if (result.ok) {
      await cacheFamilySecrets(
        input.userId,
        input.spaceId,
        material.familyKey,
        material.recoveryKey,
      );
      return 'ready';
    }
    logKeyStep('commit_family_key_ceremony');
    await discardLocalFamilySecrets(input.userId, input.spaceId);
    return 'waiting';
  } catch {
    logKeyStep('commit_family_key_ceremony');
    await discardLocalFamilySecrets(input.userId, input.spaceId);
    return 'waiting';
  } finally {
    wipe(material.familyKey);
    wipe(material.recoveryKey);
  }
}

export async function ensureKeysForOpenFamily(
  input: { spaceId: string; userId: string; role: string | null | undefined },
  gateway: FamilyKeyGateway = supabaseFamilyKeyGateway,
  access: DeviceAccessGateway = supabaseDeviceAccessGateway,
): Promise<FamilyKeyStatus> {
  const device = await ensureDeviceIdentity(input.userId);
  if (isSpaceAdmin(input.role)) {
    try {
      const meta = await gateway.fetchMeta(input.spaceId);
      if (!meta) {
        return runFoundingCeremony({ spaceId: input.spaceId, userId: input.userId }, gateway);
      }
    } catch {
      return 'waiting';
    }
  }

  const status = await statusForDevice(input.spaceId, input.userId, device, gateway);
  if (status === 'ready') {
    return 'ready';
  }

  await requestFirstDeviceAccess(
    {
      spaceId: input.spaceId,
      userId: input.userId,
      role: input.role,
      device,
    },
    access,
  );
  return 'waiting';
}

async function statusForDevice(
  spaceId: string,
  userId: string,
  device: { deviceId: string; privateKey: Uint8Array },
  gateway: FamilyKeyGateway,
): Promise<FamilyKeyStatus> {
  const cached = await getSecretBytes(familyKeyStoreKey(userId, spaceId));
  if (cached) {
    wipe(cached);
    return 'ready';
  }
  try {
    const wraps = await gateway.fetchOwnWraps(spaceId, userId);
    const mine = wraps.find((row) => row.deviceId === device.deviceId);
    if (!mine) {
      return 'waiting';
    }
    const opened = unwrapKeyFromDevice(mine.wrappedKey, device.privateKey, {
      familySpaceId: spaceId,
      keyEpoch: mine.keyEpoch,
      userId,
      deviceId: device.deviceId,
    });
    try {
      await cacheFamilySecrets(userId, spaceId, opened);
      return 'ready';
    } finally {
      wipe(opened);
    }
  } catch {
    return 'waiting';
  }
}

export function unwrapFoundingFamilyKey(
  payload: CeremonyPayload,
  privateKey: Uint8Array,
  userId: string,
): Uint8Array {
  return unwrapKeyFromDevice(payload.wrappedFamilyKey, privateKey, {
    familySpaceId: payload.spaceId,
    keyEpoch: payload.keyEpoch,
    userId,
    deviceId: payload.deviceId,
  });
}
