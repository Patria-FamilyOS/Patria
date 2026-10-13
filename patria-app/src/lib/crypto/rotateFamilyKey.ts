// SECURITY REVIEW REQUIRED
import { logKeyStep } from '../devLog';
import { isSpaceAdmin } from '../roles';
import { supabase } from '../supabase';
import { wipe } from './bytes';
import { ensureDeviceIdentity } from './deviceIdentity';
import { cacheFamilySecrets, obtainFamilyKey } from './keyStore';
import { fromPgBytea, requireX25519PublicKey, toPgBytea } from './pgBytea';
import { randomKey32 } from './random';
import { wrapFamilyKeyToRecoveryPublic, wrapKeyToDevice } from './wrap';
import { supabaseDeviceAccessGateway } from './deviceAccess';

export type RotationTarget = {
  userId: string;
  deviceId: string;
  publicKey: Uint8Array;
};

export type RecoverySealTarget = {
  userId: string;
  publicKey: Uint8Array;
};

export type RotateFamilyKeyGateway = {
  fetchRotationNeeded(spaceId: string): Promise<{ needed: boolean; keyEpoch: number } | null>;
  listWrapTargets(spaceId: string): Promise<RotationTarget[]>;
  listSealTargets(spaceId: string): Promise<RecoverySealTarget[]>;
  commitRotation(input: {
    spaceId: string;
    expectedEpoch: number;
    userIds: string[];
    deviceIds: string[];
    wrappedKeys: Uint8Array[];
    sealUserIds: string[];
    sealedKeys: Uint8Array[];
  }): Promise<number>;
};

export const supabaseRotateFamilyKeyGateway: RotateFamilyKeyGateway = {
  async fetchRotationNeeded(spaceId) {
    const { data: space, error: spaceError } = await supabase
      .from('family_spaces')
      .select('rotation_needed')
      .eq('id', spaceId)
      .maybeSingle();
    if (spaceError) {
      logKeyStep('fetch_rotation_needed', spaceError.code ?? 'unknown');
      throw spaceError;
    }
    if (!space) {
      return null;
    }
    const { data: meta, error: metaError } = await supabase
      .from('family_key_meta')
      .select('key_epoch')
      .eq('family_space_id', spaceId)
      .maybeSingle();
    if (metaError) {
      logKeyStep('fetch_rotation_epoch', metaError.code ?? 'unknown');
      throw metaError;
    }
    if (!meta) {
      return null;
    }
    return {
      needed: Boolean(space.rotation_needed),
      keyEpoch: meta.key_epoch as number,
    };
  },

  async listWrapTargets(spaceId) {
    const { data, error } = await supabase.rpc('rotation_wrap_targets', {
      p_space_id: spaceId,
    });
    if (error) {
      logKeyStep('list_rotation_targets', error.code ?? 'unknown');
      throw error;
    }
    return ((data ?? []) as { user_id: string; device_id: string; public_key: unknown }[]).map(
      (row) => ({
        userId: row.user_id,
        deviceId: row.device_id,
        publicKey: requireX25519PublicKey(fromPgBytea(row.public_key)),
      }),
    );
  },

  async listSealTargets(spaceId) {
    const { data, error } = await supabase
      .from('recovery_public_keys')
      .select('user_id, public_key')
      .eq('family_space_id', spaceId);
    if (error) {
      logKeyStep('list_recovery_public_keys', error.code ?? 'unknown');
      throw error;
    }
    return (data ?? []).map((row) => ({
      userId: row.user_id as string,
      publicKey: requireX25519PublicKey(fromPgBytea(row.public_key)),
    }));
  },

  async commitRotation(input) {
    const { data, error } = await supabase.rpc('rotate_family_key', {
      p_space_id: input.spaceId,
      p_expected_epoch: input.expectedEpoch,
      p_user_ids: input.userIds,
      p_device_ids: input.deviceIds,
      p_wrapped_keys: input.wrappedKeys.map((row) => toPgBytea(row)),
      p_seal_user_ids: input.sealUserIds,
      p_sealed_keys: input.sealedKeys.map((row) => toPgBytea(row)),
    });
    if (error) {
      logKeyStep('rotate_family_key', error.code ?? 'unknown');
      throw error;
    }
    return data as number;
  },
};

export async function rotateFamilyKeyIfNeeded(
  input: { spaceId: string; userId: string; role: string | null | undefined },
  gateway: RotateFamilyKeyGateway = supabaseRotateFamilyKeyGateway,
): Promise<boolean> {
  if (!isSpaceAdmin(input.role)) {
    return false;
  }
  const state = await gateway.fetchRotationNeeded(input.spaceId);
  if (!state?.needed) {
    return false;
  }
  const device = await ensureDeviceIdentity(input.userId);
  const oldKey = await obtainFamilyKey({
    userId: input.userId,
    spaceId: input.spaceId,
    deviceId: device.deviceId,
    privateKey: device.privateKey,
    fetchOwnWrap: supabaseDeviceAccessGateway.fetchOwnWrap,
  });
  if (!oldKey) {
    return false;
  }
  const nextEpoch = state.keyEpoch + 1;
  const newKey = randomKey32();
  const opened: Uint8Array[] = [oldKey, newKey];
  try {
    const targets = await gateway.listWrapTargets(input.spaceId);
    const seals = await gateway.listSealTargets(input.spaceId);
    const wrappedKeys = targets.map((row) =>
      wrapKeyToDevice(newKey, row.publicKey, {
        familySpaceId: input.spaceId,
        keyEpoch: nextEpoch,
        userId: row.userId,
        deviceId: row.deviceId,
      }),
    );
    const sealedKeys = seals.map((row) =>
      wrapFamilyKeyToRecoveryPublic(newKey, row.publicKey, {
        familySpaceId: input.spaceId,
        keyEpoch: nextEpoch,
        userId: row.userId,
      }),
    );
    await gateway.commitRotation({
      spaceId: input.spaceId,
      expectedEpoch: state.keyEpoch,
      userIds: targets.map((row) => row.userId),
      deviceIds: targets.map((row) => row.deviceId),
      wrappedKeys,
      sealUserIds: seals.map((row) => row.userId),
      sealedKeys,
    });
    await cacheFamilySecrets(input.userId, input.spaceId, newKey);
    logKeyStep('rotate_family_key', `${input.spaceId} ${nextEpoch}`);
    return true;
  } finally {
    for (const secret of opened) {
      wipe(secret);
    }
  }
}
