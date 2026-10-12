// SECURITY REVIEW REQUIRED
import { logKeyStep } from '../devLog';
import { isKeyEligibleRole, isSpaceAdmin } from '../roles';
import { supabase } from '../supabase';
import { wipe } from './bytes';
import type { DeviceIdentity } from './deviceIdentity';
import { loadCachedRecoveryKey, obtainFamilyKey } from './keyStore';
import { fromPgBytea, requireX25519PublicKey, toPgBytea } from './pgBytea';
import { wrapKeyToDevice, type MemberWrapAad } from './wrap';

export type FirstDeviceNotice = {
  id: string;
  spaceId: string;
  userId: string;
  deviceId: string;
  publicKey: Uint8Array;
  deviceCreatedAt: string;
};

export type DeviceAccessGateway = {
  upsertDevicePublicKey(
    userId: string,
    deviceId: string,
    publicKey: Uint8Array,
  ): Promise<void>;
  countOwnWraps(spaceId: string, userId: string): Promise<number>;
  insertNotice(spaceId: string, userId: string, deviceId: string): Promise<void>;
  listNotices(spaceId: string): Promise<FirstDeviceNotice[]>;
  fetchOwnWrap(
    spaceId: string,
    userId: string,
    deviceId: string,
  ): Promise<{ wrappedKey: Uint8Array; keyEpoch: number } | null>;
  insertFamilyWrap(input: {
    spaceId: string;
    userId: string;
    deviceId: string;
    wrappedKey: Uint8Array;
    keyEpoch: number;
    approvedBy: string;
  }): Promise<void>;
  insertRecoveryWrap(input: {
    spaceId: string;
    userId: string;
    deviceId: string;
    wrappedKey: Uint8Array;
    approvedBy: string;
  }): Promise<void>;
  deleteNotice(noticeId: string): Promise<void>;
};

export function firstDeviceWrapAad(input: {
  spaceId: string;
  userId: string;
  deviceId: string;
  keyEpoch?: number;
}): MemberWrapAad {
  return {
    familySpaceId: input.spaceId,
    keyEpoch: input.keyEpoch ?? 1,
    userId: input.userId,
    deviceId: input.deviceId,
  };
}

export function wrapFamilyKeyForFirstDevice(
  familyKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  aad: MemberWrapAad,
): Uint8Array {
  return wrapKeyToDevice(familyKey, recipientPublicKey, aad);
}

export const supabaseDeviceAccessGateway: DeviceAccessGateway = {
  async upsertDevicePublicKey(userId, deviceId, publicKey) {
    const { error } = await supabase.from('device_keys').insert({
      user_id: userId,
      device_id: deviceId,
      public_key: toPgBytea(publicKey),
    });
    if (error && error.code !== '23505') {
      logKeyStep('upsert_device_public_key', error.code ?? 'unknown');
      throw error;
    }
  },

  async countOwnWraps(spaceId, userId) {
    const { data, error } = await supabase
      .from('family_key_wraps')
      .select('device_id')
      .eq('family_space_id', spaceId)
      .eq('user_id', userId);
    if (error) {
      logKeyStep('count_own_wraps', error.code ?? 'unknown');
      throw error;
    }
    return (data ?? []).length;
  },

  async insertNotice(spaceId, userId, deviceId) {
    const { error } = await supabase.from('device_approval_notices').insert({
      family_space_id: spaceId,
      user_id: userId,
      device_id: deviceId,
    });
    if (error && error.code !== '23505') {
      logKeyStep('insert_notice', error.code ?? 'unknown');
      throw error;
    }
  },

  async listNotices(spaceId) {
    const { data: notices, error } = await supabase
      .from('device_approval_notices')
      .select('id, user_id, device_id')
      .eq('family_space_id', spaceId);
    if (error) {
      logKeyStep('list_notices', error.code ?? 'unknown');
      throw error;
    }
    const rows = notices ?? [];
    if (rows.length === 0) {
      return [];
    }
    const { data: keys, error: keysError } = await supabase
      .from('device_keys')
      .select('user_id, device_id, public_key, created_at');
    if (keysError) {
      logKeyStep('list_notice_device_keys', keysError.code ?? 'unknown');
      throw keysError;
    }
    const byPair = new Map(
      (keys ?? []).map((row) => [
        `${row.user_id as string}:${row.device_id as string}`,
        row,
      ]),
    );
    return rows.flatMap((notice) => {
      const key = byPair.get(`${notice.user_id as string}:${notice.device_id as string}`);
      if (!key) {
        return [];
      }
      return [
        {
          id: notice.id as string,
          spaceId,
          userId: notice.user_id as string,
          deviceId: notice.device_id as string,
          publicKey: requireX25519PublicKey(fromPgBytea(key.public_key)),
          deviceCreatedAt: key.created_at as string,
        },
      ];
    });
  },

  async fetchOwnWrap(spaceId, userId, deviceId) {
    const { data, error } = await supabase
      .from('family_key_wraps')
      .select('wrapped_key, key_epoch')
      .eq('family_space_id', spaceId)
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .maybeSingle();
    if (error) {
      logKeyStep('fetch_own_wrap', error.code ?? 'unknown');
      throw error;
    }
    if (!data) {
      return null;
    }
    return {
      wrappedKey: fromPgBytea(data.wrapped_key),
      keyEpoch: data.key_epoch as number,
    };
  },

  async insertFamilyWrap(input) {
    const { error } = await supabase.from('family_key_wraps').insert({
      family_space_id: input.spaceId,
      user_id: input.userId,
      device_id: input.deviceId,
      wrapped_key: toPgBytea(input.wrappedKey),
      key_epoch: input.keyEpoch,
      approved_by: input.approvedBy,
    });
    if (error) {
      logKeyStep('insert_family_wrap', error.code ?? 'unknown');
      throw error;
    }
  },

  async insertRecoveryWrap(input) {
    const { error } = await supabase.from('recovery_key_wraps').insert({
      family_space_id: input.spaceId,
      user_id: input.userId,
      device_id: input.deviceId,
      wrapped_key: toPgBytea(input.wrappedKey),
      recovery_key_epoch: 1,
      approved_by: input.approvedBy,
    });
    if (error) {
      logKeyStep('insert_recovery_wrap', error.code ?? 'unknown');
      throw error;
    }
  },

  async deleteNotice(noticeId) {
    const { error } = await supabase.from('device_approval_notices').delete().eq('id', noticeId);
    if (error) {
      logKeyStep('delete_notice', error.code ?? 'unknown');
      throw error;
    }
  },
};

export async function requestFirstDeviceAccess(
  input: {
    spaceId: string;
    userId: string;
    role: string | null | undefined;
    device: DeviceIdentity;
  },
  gateway: DeviceAccessGateway = supabaseDeviceAccessGateway,
): Promise<'notice' | 'skipped'> {
  if (!isKeyEligibleRole(input.role)) {
    return 'skipped';
  }
  await gateway.upsertDevicePublicKey(input.userId, input.device.deviceId, input.device.publicKey);
  const own = await gateway.fetchOwnWrap(input.spaceId, input.userId, input.device.deviceId);
  if (own) {
    return 'skipped';
  }
  await gateway.insertNotice(input.spaceId, input.userId, input.device.deviceId);
  logKeyStep('request_first_device', `${input.spaceId} ${input.device.deviceId}`);
  return 'notice';
}

export async function fetchFirstDeviceNotices(
  spaceId: string,
  gateway: DeviceAccessGateway = supabaseDeviceAccessGateway,
): Promise<FirstDeviceNotice[]> {
  return gateway.listNotices(spaceId);
}

export async function declineFirstDevice(
  noticeId: string,
  gateway: DeviceAccessGateway = supabaseDeviceAccessGateway,
): Promise<void> {
  await gateway.deleteNotice(noticeId);
  logKeyStep('decline_first_device', noticeId);
}

export async function approveFirstDevice(
  input: {
    spaceId: string;
    adminUserId: string;
    adminDeviceId: string;
    adminPrivateKey: Uint8Array;
    notice: FirstDeviceNotice;
    memberRole: string | null | undefined;
  },
  gateway: DeviceAccessGateway = supabaseDeviceAccessGateway,
): Promise<void> {
  const recipientPublicKey = requireX25519PublicKey(fromPgBytea(input.notice.publicKey));
  const aad = firstDeviceWrapAad({
    spaceId: input.spaceId,
    userId: input.notice.userId,
    deviceId: input.notice.deviceId,
  });
  const familyKey = await obtainFamilyKey({
    userId: input.adminUserId,
    spaceId: input.spaceId,
    deviceId: input.adminDeviceId,
    privateKey: input.adminPrivateKey,
    fetchOwnWrap: gateway.fetchOwnWrap,
  });
  if (!familyKey) {
    throw new Error('missing family key');
  }
  try {
    const wrapped = wrapFamilyKeyForFirstDevice(familyKey, recipientPublicKey, aad);
    await gateway.insertFamilyWrap({
      spaceId: input.spaceId,
      userId: input.notice.userId,
      deviceId: input.notice.deviceId,
      wrappedKey: wrapped,
      keyEpoch: aad.keyEpoch,
      approvedBy: input.adminUserId,
    });
    if (isSpaceAdmin(input.memberRole)) {
      const recoveryKey = await loadCachedRecoveryKey(input.adminUserId, input.spaceId);
      if (recoveryKey) {
        try {
          const wrappedRecovery = wrapKeyToDevice(recoveryKey, recipientPublicKey, aad);
          await gateway.insertRecoveryWrap({
            spaceId: input.spaceId,
            userId: input.notice.userId,
            deviceId: input.notice.deviceId,
            wrappedKey: wrappedRecovery,
            approvedBy: input.adminUserId,
          });
        } finally {
          wipe(recoveryKey);
        }
      }
    }
    await gateway.deleteNotice(input.notice.id);
    logKeyStep('approve_first_device', `${input.spaceId} ${input.notice.deviceId}`);
  } finally {
    wipe(familyKey);
  }
}
