// SECURITY REVIEW REQUIRED
import { logKeyStep } from '../devLog';
import { isKeyEligibleRole, isSpaceAdmin } from '../roles';
import { supabase } from '../supabase';
import { wipe } from './bytes';
import type { DeviceIdentity } from './deviceIdentity';
import {
  cacheFamilySecrets,
  loadCachedFamilyKey,
  loadCachedRecoveryKey,
} from './keyStore';
import { fromPgBytea, toPgBytea } from './pgBytea';
import { unwrapKeyFromDevice, wrapKeyToDevice, type MemberWrapAad } from './wrap';

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
      logKeyStep('upsert_device_public_key');
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
      logKeyStep('count_own_wraps');
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
      logKeyStep('insert_notice', `${spaceId} ${deviceId}`);
      throw error;
    }
  },

  async listNotices(spaceId) {
    const { data: notices, error } = await supabase
      .from('device_approval_notices')
      .select('id, user_id, device_id')
      .eq('family_space_id', spaceId);
    if (error) {
      logKeyStep('list_notices', spaceId);
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
      logKeyStep('list_notice_device_keys', spaceId);
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
          publicKey: fromPgBytea(key.public_key as string | Uint8Array),
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
      logKeyStep('fetch_own_wrap');
      throw error;
    }
    if (!data) {
      return null;
    }
    return {
      wrappedKey: fromPgBytea(data.wrapped_key as string | Uint8Array),
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
      logKeyStep('insert_family_wrap', `${input.spaceId} ${input.deviceId}`);
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
      logKeyStep('insert_recovery_wrap', `${input.spaceId} ${input.deviceId}`);
      throw error;
    }
  },

  async deleteNotice(noticeId) {
    const { error } = await supabase.from('device_approval_notices').delete().eq('id', noticeId);
    if (error) {
      logKeyStep('delete_notice', noticeId);
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
  const wraps = await gateway.countOwnWraps(input.spaceId, input.userId);
  if (wraps > 0) {
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
  const aad = firstDeviceWrapAad({
    spaceId: input.spaceId,
    userId: input.notice.userId,
    deviceId: input.notice.deviceId,
  });
  let familyKey = await loadCachedFamilyKey(input.adminUserId, input.spaceId);
  if (!familyKey) {
    const own = await gateway.fetchOwnWrap(input.spaceId, input.adminUserId, input.adminDeviceId);
    if (!own) {
      throw new Error('missing family key');
    }
    familyKey = unwrapKeyFromDevice(own.wrappedKey, input.adminPrivateKey, {
      familySpaceId: input.spaceId,
      keyEpoch: own.keyEpoch,
      userId: input.adminUserId,
      deviceId: input.adminDeviceId,
    });
    await cacheFamilySecrets(input.adminUserId, input.spaceId, familyKey);
  }
  try {
    const wrapped = wrapFamilyKeyForFirstDevice(familyKey, input.notice.publicKey, aad);
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
          const wrappedRecovery = wrapKeyToDevice(recoveryKey, input.notice.publicKey, aad);
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
