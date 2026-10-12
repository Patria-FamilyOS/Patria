// SECURITY REVIEW REQUIRED
import { isRecoveryContactRole, type SpaceRole } from '../roles';
import { logKeyStep } from '../devLog';
import { supabase } from '../supabase';
import { fromPgBytea, requireX25519PublicKey, toPgBytea } from './pgBytea';

export type RecoveryContactStatus = 'pending' | 'accepted' | 'declined';
export type RecoverySlot = 'a' | 'b';

export type RecoveryContactRow = {
  id: string;
  spaceId: string;
  userId: string;
  slot: RecoverySlot;
  status: RecoveryContactStatus;
};

export type ApprovedDevice = {
  deviceId: string;
  publicKey: Uint8Array;
};

export type RecoveryAccessGateway = {
  fetchMeta(
    spaceId: string,
  ): Promise<{ keyEpoch: number; recoveryKeyEpoch: number } | null>;
  listContacts(spaceId: string): Promise<RecoveryContactRow[]>;
  inviteContact(input: {
    spaceId: string;
    userId: string;
    slot: RecoverySlot;
    createdBy: string;
  }): Promise<void>;
  setContactStatus(
    spaceId: string,
    userId: string,
    status: 'accepted' | 'declined',
  ): Promise<void>;
  deleteContact(spaceId: string, userId: string): Promise<void>;
  listApprovedDevices(spaceId: string, userId: string): Promise<ApprovedDevice[]>;
  fetchOwnRecoveryWrap(
    spaceId: string,
    userId: string,
    deviceId: string,
  ): Promise<{ wrappedKey: Uint8Array; keyEpoch: number } | null>;
  insertRecoveryWrap(input: {
    spaceId: string;
    userId: string;
    deviceId: string;
    wrappedKey: Uint8Array;
    recoveryKeyEpoch: number;
    approvedBy: string;
  }): Promise<void>;
  upsertFamilyKeyUnderRecovery(input: {
    spaceId: string;
    keyEpoch: number;
    wrappedFamilyKey: Uint8Array;
  }): Promise<void>;
  insertHolderSecret(input: {
    spaceId: string;
    userId: string;
    deviceId: string;
    wrappedSecret: Uint8Array;
    recoveryKeyEpoch: number;
  }): Promise<void>;
  insertPairWrap(input: {
    spaceId: string;
    recoveryKeyEpoch: number;
    pairId: 'ab' | 'ap' | 'bp';
    wrappedRecoveryKey: Uint8Array;
  }): Promise<void>;
  listPairIds(spaceId: string, recoveryKeyEpoch: number): Promise<string[]>;
  purgeCiphertext(spaceId: string): Promise<void>;
  bumpRecoveryKeyEpoch(spaceId: string): Promise<number>;
};

function parseSlot(value: unknown): RecoverySlot {
  return value === 'b' ? 'b' : 'a';
}

function parseStatus(value: unknown): RecoveryContactStatus {
  if (value === 'accepted' || value === 'declined' || value === 'pending') {
    return value;
  }
  return 'pending';
}

export function eligibleRecoveryMembers(
  members: { userId: string; role: SpaceRole }[],
  approvedUserIds: Set<string>,
  pickerUserId: string,
): { userId: string; role: SpaceRole }[] {
  return members.filter(
    (row) =>
      row.userId !== pickerUserId &&
      isRecoveryContactRole(row.role) &&
      approvedUserIds.has(row.userId),
  );
}

export const supabaseRecoveryAccessGateway: RecoveryAccessGateway = {
  async fetchMeta(spaceId) {
    const { data, error } = await supabase
      .from('family_key_meta')
      .select('key_epoch, recovery_key_epoch')
      .eq('family_space_id', spaceId)
      .maybeSingle();
    if (error) {
      logKeyStep('fetch_recovery_meta', error.code ?? 'unknown');
      throw error;
    }
    if (!data) {
      return null;
    }
    return {
      keyEpoch: data.key_epoch as number,
      recoveryKeyEpoch: data.recovery_key_epoch as number,
    };
  },

  async listContacts(spaceId) {
    const { data, error } = await supabase
      .from('recovery_contacts')
      .select('id, user_id, slot, status')
      .eq('family_space_id', spaceId);
    if (error) {
      logKeyStep('list_recovery_contacts', error.code ?? 'unknown');
      throw error;
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      spaceId,
      userId: row.user_id as string,
      slot: parseSlot(row.slot),
      status: parseStatus(row.status),
    }));
  },

  async inviteContact(input) {
    const { error } = await supabase.from('recovery_contacts').insert({
      family_space_id: input.spaceId,
      user_id: input.userId,
      slot: input.slot,
      created_by: input.createdBy,
      status: 'pending',
    });
    if (error) {
      logKeyStep('invite_recovery_contact', error.code ?? 'unknown');
      throw error;
    }
  },

  async setContactStatus(spaceId, userId, status) {
    const { error } = await supabase
      .from('recovery_contacts')
      .update({ status })
      .eq('family_space_id', spaceId)
      .eq('user_id', userId)
      .eq('status', 'pending');
    if (error) {
      logKeyStep('set_recovery_contact_status', error.code ?? 'unknown');
      throw error;
    }
  },

  async deleteContact(spaceId, userId) {
    const { error } = await supabase
      .from('recovery_contacts')
      .delete()
      .eq('family_space_id', spaceId)
      .eq('user_id', userId);
    if (error) {
      logKeyStep('delete_recovery_contact', error.code ?? 'unknown');
      throw error;
    }
  },

  async listApprovedDevices(spaceId, userId) {
    const { data, error } = await supabase.rpc('approved_devices_for_member', {
      p_space_id: spaceId,
      p_user_id: userId,
    });
    if (error) {
      logKeyStep('list_approved_devices', error.code ?? 'unknown');
      throw error;
    }
    const rows = (data ?? []) as { device_id: string; public_key: unknown }[];
    return rows.map((row) => ({
      deviceId: row.device_id,
      publicKey: requireX25519PublicKey(fromPgBytea(row.public_key)),
    }));
  },

  async fetchOwnRecoveryWrap(spaceId, userId, deviceId) {
    const { data, error } = await supabase
      .from('recovery_key_wraps')
      .select('wrapped_key, recovery_key_epoch')
      .eq('family_space_id', spaceId)
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .maybeSingle();
    if (error) {
      logKeyStep('fetch_own_recovery_wrap', error.code ?? 'unknown');
      throw error;
    }
    if (!data) {
      return null;
    }
    return {
      wrappedKey: fromPgBytea(data.wrapped_key),
      keyEpoch: data.recovery_key_epoch as number,
    };
  },

  async insertRecoveryWrap(input) {
    const { error } = await supabase.rpc('insert_recovery_key_wrap_setup', {
      p_space_id: input.spaceId,
      p_user_id: input.userId,
      p_device_id: input.deviceId,
      p_wrapped_key: toPgBytea(input.wrappedKey),
      p_recovery_key_epoch: input.recoveryKeyEpoch,
    });
    if (error) {
      logKeyStep('insert_recovery_key_wrap', error.code ?? 'unknown');
      throw error;
    }
  },

  async upsertFamilyKeyUnderRecovery(input) {
    const { error } = await supabase.rpc('upsert_family_key_under_recovery', {
      p_space_id: input.spaceId,
      p_key_epoch: input.keyEpoch,
      p_wrapped_family_key: toPgBytea(input.wrappedFamilyKey),
    });
    if (error) {
      logKeyStep('upsert_family_key_under_recovery', error.code ?? 'unknown');
      throw error;
    }
  },

  async insertHolderSecret(input) {
    const { error } = await supabase.from('recovery_contact_secrets').insert({
      family_space_id: input.spaceId,
      user_id: input.userId,
      device_id: input.deviceId,
      wrapped_secret: toPgBytea(input.wrappedSecret),
      recovery_key_epoch: input.recoveryKeyEpoch,
    });
    if (error) {
      logKeyStep('insert_holder_secret', error.code ?? 'unknown');
      throw error;
    }
  },

  async insertPairWrap(input) {
    const { error } = await supabase.from('recovery_pair_wraps').insert({
      family_space_id: input.spaceId,
      recovery_key_epoch: input.recoveryKeyEpoch,
      pair_id: input.pairId,
      wrapped_recovery_key: toPgBytea(input.wrappedRecoveryKey),
    });
    if (error) {
      logKeyStep('insert_pair_wrap', error.code ?? 'unknown');
      throw error;
    }
  },

  async listPairIds(spaceId, recoveryKeyEpoch) {
    const { data, error } = await supabase
      .from('recovery_pair_wraps')
      .select('pair_id')
      .eq('family_space_id', spaceId)
      .eq('recovery_key_epoch', recoveryKeyEpoch);
    if (error) {
      logKeyStep('list_pair_ids', error.code ?? 'unknown');
      throw error;
    }
    return (data ?? []).map((row) => row.pair_id as string);
  },

  async purgeCiphertext(spaceId) {
    const { error } = await supabase.rpc('purge_recovery_ciphertext', {
      p_space_id: spaceId,
    });
    if (error) {
      logKeyStep('purge_recovery_ciphertext', error.code ?? 'unknown');
      throw error;
    }
  },

  async bumpRecoveryKeyEpoch(spaceId) {
    const { data, error } = await supabase.rpc('bump_recovery_key_epoch', {
      p_space_id: spaceId,
    });
    if (error) {
      logKeyStep('bump_recovery_key_epoch', error.code ?? 'unknown');
      throw error;
    }
    return data as number;
  },
};
