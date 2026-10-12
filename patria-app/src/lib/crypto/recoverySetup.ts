// SECURITY REVIEW REQUIRED
import { logKeyStep } from '../devLog';
import { isSpaceAdmin, type SpaceRole } from '../roles';
import { wipe } from './bytes';
import { ensureDeviceIdentity } from './deviceIdentity';
import {
  cacheRecoveryKey,
  obtainFamilyKey,
  obtainRecoveryKey,
} from './keyStore';
import { sealXChaCha20Poly1305 } from './aead';
import { requireX25519PublicKey } from './pgBytea';
import {
  generatePrintedCode,
  printedChecksMatch,
  type PrintedCode,
} from './printedCode';
import { randomKey32 } from './random';
import {
  createRecoveryBoxes,
  openRecoveryPair,
  type RecoveryBoxes,
} from './recovery';
import {
  eligibleRecoveryMembers,
  supabaseRecoveryAccessGateway,
  type RecoveryAccessGateway,
  type RecoveryContactRow,
  type RecoverySlot,
} from './recoveryAccess';
import { deleteSecret, getSecretBytes, setSecretBytes } from './secureKeys';
import { encodeEpochAad, wrapKeyToDevice, type MemberWrapAad } from './wrap';
import { supabaseDeviceAccessGateway } from './deviceAccess';

export type RecoveryHomeStatus =
  | 'not_setup'
  | 'one_of_two'
  | 'setup'
  | 'contact';

export type RecoverySnapshot = {
  contacts: RecoveryContactRow[];
  accepted: number;
  pending: RecoveryContactRow[];
  hasPaper: boolean;
  recoveryKeyEpoch: number;
  keyEpoch: number;
  status: RecoveryHomeStatus;
};

function holderStoreKey(userId: string, spaceId: string, slot: RecoverySlot): string {
  return `patria.u.${userId}.holder.${spaceId}.${slot}`;
}

function wrapAad(input: {
  spaceId: string;
  epoch: number;
  userId: string;
  deviceId: string;
}): MemberWrapAad {
  return {
    familySpaceId: input.spaceId,
    keyEpoch: input.epoch,
    userId: input.userId,
    deviceId: input.deviceId,
  };
}

export function recoveryStatusCopyKey(
  snapshot: RecoverySnapshot,
  userId: string,
  isAdmin: boolean,
): RecoveryHomeStatus {
  if (isAdmin) {
    if (snapshot.accepted >= 2) {
      return 'setup';
    }
    if (snapshot.accepted === 1) {
      return 'one_of_two';
    }
    return 'not_setup';
  }
  const mine = snapshot.contacts.find(
    (row) => row.userId === userId && row.status === 'accepted',
  );
  return mine ? 'contact' : 'not_setup';
}

export async function loadRecoverySnapshot(
  spaceId: string,
  userId: string,
  role: string | null | undefined,
  gateway: RecoveryAccessGateway = supabaseRecoveryAccessGateway,
): Promise<RecoverySnapshot> {
  const meta = await gateway.fetchMeta(spaceId);
  const contacts = await gateway.listContacts(spaceId);
  const accepted = contacts.filter((row) => row.status === 'accepted').length;
  const pairIds = meta
    ? await gateway.listPairIds(spaceId, meta.recoveryKeyEpoch)
    : [];
  const snapshot: RecoverySnapshot = {
    contacts,
    accepted,
    pending: contacts.filter((row) => row.status === 'pending'),
    hasPaper: pairIds.includes('ap') && pairIds.includes('bp'),
    recoveryKeyEpoch: meta?.recoveryKeyEpoch ?? 1,
    keyEpoch: meta?.keyEpoch ?? 1,
    status: 'not_setup',
  };
  snapshot.status = recoveryStatusCopyKey(snapshot, userId, isSpaceAdmin(role));
  return snapshot;
}

export function selectableRecoveryContacts(
  members: { userId: string; role: SpaceRole }[],
  approvedUserIds: Set<string>,
  pickerUserId: string,
): { userId: string; role: SpaceRole }[] {
  return eligibleRecoveryMembers(members, approvedUserIds, pickerUserId);
}

async function wrapRecoveryToAdmins(
  input: {
    spaceId: string;
    adminUserId: string;
    recoveryKey: Uint8Array;
    recoveryKeyEpoch: number;
    adminUserIds: string[];
  },
  gateway: RecoveryAccessGateway,
): Promise<void> {
  for (const adminId of input.adminUserIds) {
    const devices = await gateway.listApprovedDevices(input.spaceId, adminId);
    for (const device of devices) {
      const publicKey = requireX25519PublicKey(device.publicKey);
      const wrapped = wrapKeyToDevice(
        input.recoveryKey,
        publicKey,
        wrapAad({
          spaceId: input.spaceId,
          epoch: input.recoveryKeyEpoch,
          userId: adminId,
          deviceId: device.deviceId,
        }),
      );
      try {
        await gateway.insertRecoveryWrap({
          spaceId: input.spaceId,
          userId: adminId,
          deviceId: device.deviceId,
          wrappedKey: wrapped,
          recoveryKeyEpoch: input.recoveryKeyEpoch,
          approvedBy: input.adminUserId,
        });
      } catch {
        logKeyStep('recovery_wrap_exists');
      }
    }
  }
}

async function sealFamilyUnderRecovery(
  input: {
    spaceId: string;
    userId: string;
    deviceId: string;
    privateKey: Uint8Array;
    recoveryKey: Uint8Array;
    keyEpoch: number;
  },
  gateway: RecoveryAccessGateway,
): Promise<void> {
  const familyKey = await obtainFamilyKey({
    userId: input.userId,
    spaceId: input.spaceId,
    deviceId: input.deviceId,
    privateKey: input.privateKey,
    fetchOwnWrap: supabaseDeviceAccessGateway.fetchOwnWrap,
  });
  if (!familyKey) {
    throw new Error('missing family key');
  }
  try {
    const wrapped = sealXChaCha20Poly1305(
      input.recoveryKey,
      familyKey,
      encodeEpochAad(input.spaceId, input.keyEpoch),
    );
    await gateway.upsertFamilyKeyUnderRecovery({
      spaceId: input.spaceId,
      keyEpoch: input.keyEpoch,
      wrappedFamilyKey: wrapped,
    });
  } finally {
    wipe(familyKey);
  }
}

export async function ensureRecoveryKeyMaterial(
  input: {
    spaceId: string;
    userId: string;
    adminUserIds: string[];
  },
  gateway: RecoveryAccessGateway = supabaseRecoveryAccessGateway,
): Promise<{ recoveryKey: Uint8Array; recoveryKeyEpoch: number; keyEpoch: number }> {
  const device = await ensureDeviceIdentity(input.userId);
  const meta = await gateway.fetchMeta(input.spaceId);
  if (!meta) {
    throw new Error('missing family key');
  }
  let recoveryKey = await obtainRecoveryKey({
    userId: input.userId,
    spaceId: input.spaceId,
    deviceId: device.deviceId,
    privateKey: device.privateKey,
    recoveryKeyEpoch: meta.recoveryKeyEpoch,
    fetchOwnWrap: gateway.fetchOwnRecoveryWrap,
  });
  if (!recoveryKey) {
    recoveryKey = randomKey32();
    await cacheRecoveryKey(input.userId, input.spaceId, recoveryKey);
  }
  await wrapRecoveryToAdmins(
    {
      spaceId: input.spaceId,
      adminUserId: input.userId,
      recoveryKey,
      recoveryKeyEpoch: meta.recoveryKeyEpoch,
      adminUserIds: input.adminUserIds,
    },
    gateway,
  );
  await sealFamilyUnderRecovery(
    {
      spaceId: input.spaceId,
      userId: input.userId,
      deviceId: device.deviceId,
      privateKey: device.privateKey,
      recoveryKey,
      keyEpoch: meta.keyEpoch,
    },
    gateway,
  );
  return {
    recoveryKey,
    recoveryKeyEpoch: meta.recoveryKeyEpoch,
    keyEpoch: meta.keyEpoch,
  };
}

export async function inviteRecoveryContacts(
  input: {
    spaceId: string;
    createdBy: string;
    contactUserIds: [string, string] | [string];
    members: { userId: string; role: SpaceRole }[];
    approvedUserIds: Set<string>;
  },
  gateway: RecoveryAccessGateway = supabaseRecoveryAccessGateway,
): Promise<void> {
  const allowed = selectableRecoveryContacts(
    input.members,
    input.approvedUserIds,
    input.createdBy,
  );
  const allowedIds = new Set(allowed.map((row) => row.userId));
  for (const userId of input.contactUserIds) {
    if (!allowedIds.has(userId)) {
      throw new Error('ineligible recovery contact');
    }
  }
  const existing = await gateway.listContacts(input.spaceId);
  const usedSlots = new Set(
    existing.filter((row) => row.status !== 'declined').map((row) => row.slot),
  );
  const slots: RecoverySlot[] = [];
  if (!usedSlots.has('a')) {
    slots.push('a');
  }
  if (!usedSlots.has('b')) {
    slots.push('b');
  }
  if (slots.length < input.contactUserIds.length) {
    throw new Error('recovery slots full');
  }
  for (let i = 0; i < input.contactUserIds.length; i += 1) {
    await gateway.inviteContact({
      spaceId: input.spaceId,
      userId: input.contactUserIds[i],
      slot: slots[i],
      createdBy: input.createdBy,
    });
  }
}

export async function respondRecoveryInvite(
  input: { spaceId: string; userId: string; accept: boolean },
  gateway: RecoveryAccessGateway = supabaseRecoveryAccessGateway,
): Promise<void> {
  await gateway.setContactStatus(
    input.spaceId,
    input.userId,
    input.accept ? 'accepted' : 'declined',
  );
}

async function wrapHolderToDevices(
  input: {
    spaceId: string;
    userId: string;
    secret: Uint8Array;
    recoveryKeyEpoch: number;
  },
  gateway: RecoveryAccessGateway,
): Promise<void> {
  const devices = await gateway.listApprovedDevices(input.spaceId, input.userId);
  for (const device of devices) {
    const publicKey = requireX25519PublicKey(device.publicKey);
    const wrapped = wrapKeyToDevice(
      input.secret,
      publicKey,
      wrapAad({
        spaceId: input.spaceId,
        epoch: input.recoveryKeyEpoch,
        userId: input.userId,
        deviceId: device.deviceId,
      }),
    );
    await gateway.insertHolderSecret({
      spaceId: input.spaceId,
      userId: input.userId,
      deviceId: device.deviceId,
      wrappedSecret: wrapped,
      recoveryKeyEpoch: input.recoveryKeyEpoch,
    });
  }
}

export async function fulfillAcceptedContacts(
  input: {
    spaceId: string;
    adminUserId: string;
    adminUserIds: string[];
  },
  gateway: RecoveryAccessGateway = supabaseRecoveryAccessGateway,
): Promise<void> {
  const material = await ensureRecoveryKeyMaterial(
    {
      spaceId: input.spaceId,
      userId: input.adminUserId,
      adminUserIds: input.adminUserIds,
    },
    gateway,
  );
  try {
    const contacts = (await gateway.listContacts(input.spaceId)).filter(
      (row) => row.status === 'accepted',
    );
    for (const contact of contacts) {
      const stored = await getSecretBytes(
        holderStoreKey(input.adminUserId, input.spaceId, contact.slot),
      );
      if (stored) {
        wipe(stored);
        continue;
      }
      const secret = randomKey32();
      try {
        await setSecretBytes(
          holderStoreKey(input.adminUserId, input.spaceId, contact.slot),
          secret,
        );
        await wrapHolderToDevices(
          {
            spaceId: input.spaceId,
            userId: contact.userId,
            secret,
            recoveryKeyEpoch: material.recoveryKeyEpoch,
          },
          gateway,
        );
      } finally {
        wipe(secret);
      }
    }
    await rebuildPairBoxes(
      {
        spaceId: input.spaceId,
        adminUserId: input.adminUserId,
        recoveryKey: material.recoveryKey,
        recoveryKeyEpoch: material.recoveryKeyEpoch,
        paper: null,
      },
      gateway,
    );
  } finally {
    wipe(material.recoveryKey);
  }
}

async function loadHolder(
  adminUserId: string,
  spaceId: string,
  slot: RecoverySlot,
): Promise<Uint8Array | null> {
  return getSecretBytes(holderStoreKey(adminUserId, spaceId, slot));
}

async function rebuildPairBoxes(
  input: {
    spaceId: string;
    adminUserId: string;
    recoveryKey: Uint8Array;
    recoveryKeyEpoch: number;
    paper: Uint8Array | null;
  },
  gateway: RecoveryAccessGateway,
): Promise<RecoveryBoxes | null> {
  const secretA = await loadHolder(input.adminUserId, input.spaceId, 'a');
  const secretB = await loadHolder(input.adminUserId, input.spaceId, 'b');
  if (!secretA || !secretB) {
    if (secretA) {
      wipe(secretA);
    }
    if (secretB) {
      wipe(secretB);
    }
    return null;
  }
  const paper = input.paper ?? randomKey32();
  const generatedPaper = !input.paper;
  try {
    const ctx = {
      familySpaceId: input.spaceId,
      recoveryKeyEpoch: input.recoveryKeyEpoch,
    };
    const boxes = createRecoveryBoxes(input.recoveryKey, secretA, secretB, paper, ctx);
    const existing = await gateway.listPairIds(input.spaceId, input.recoveryKeyEpoch);
    if (!existing.includes('ab')) {
      await gateway.insertPairWrap({
        spaceId: input.spaceId,
        recoveryKeyEpoch: input.recoveryKeyEpoch,
        pairId: 'ab',
        wrappedRecoveryKey: boxes.boxAb,
      });
    }
    if (!generatedPaper) {
      if (!existing.includes('ap')) {
        await gateway.insertPairWrap({
          spaceId: input.spaceId,
          recoveryKeyEpoch: input.recoveryKeyEpoch,
          pairId: 'ap',
          wrappedRecoveryKey: boxes.boxAp,
        });
      }
      if (!existing.includes('bp')) {
        await gateway.insertPairWrap({
          spaceId: input.spaceId,
          recoveryKeyEpoch: input.recoveryKeyEpoch,
          pairId: 'bp',
          wrappedRecoveryKey: boxes.boxBp,
        });
      }
    }
    return boxes;
  } finally {
    wipe(secretA);
    wipe(secretB);
    if (generatedPaper) {
      wipe(paper);
    }
  }
}

export function confirmPrintedCodeLocally(
  recoveryKey: Uint8Array,
  secretA: Uint8Array,
  secretB: Uint8Array,
  printed: PrintedCode,
  ctx: { familySpaceId: string; recoveryKeyEpoch: number },
  answers: { index: number; word: string }[],
): RecoveryBoxes {
  if (!printedChecksMatch(printed.words, answers)) {
    throw new Error('printed code failed');
  }
  const boxes = createRecoveryBoxes(
    recoveryKey,
    secretA,
    secretB,
    printed.secret,
    ctx,
  );
  const opened = openRecoveryPair(boxes.boxAp, secretA, printed.secret, ctx, 'ap');
  wipe(opened);
  return boxes;
}

export async function savePrintedCode(
  input: {
    spaceId: string;
    adminUserId: string;
    adminUserIds: string[];
    printed: PrintedCode;
    answers: { index: number; word: string }[];
  },
  gateway: RecoveryAccessGateway = supabaseRecoveryAccessGateway,
): Promise<void> {
  const material = await ensureRecoveryKeyMaterial(
    {
      spaceId: input.spaceId,
      userId: input.adminUserId,
      adminUserIds: input.adminUserIds,
    },
    gateway,
  );
  const secretA = await loadHolder(input.adminUserId, input.spaceId, 'a');
  const secretB = await loadHolder(input.adminUserId, input.spaceId, 'b');
  if (!secretA || !secretB) {
    wipe(material.recoveryKey);
    if (secretA) {
      wipe(secretA);
    }
    if (secretB) {
      wipe(secretB);
    }
    throw new Error('missing holder secret');
  }
  try {
    const ctx = {
      familySpaceId: input.spaceId,
      recoveryKeyEpoch: material.recoveryKeyEpoch,
    };
    const boxes = confirmPrintedCodeLocally(
      material.recoveryKey,
      secretA,
      secretB,
      input.printed,
      ctx,
      input.answers,
    );
    await gateway.insertPairWrap({
      spaceId: input.spaceId,
      recoveryKeyEpoch: material.recoveryKeyEpoch,
      pairId: 'ap',
      wrappedRecoveryKey: boxes.boxAp,
    });
    await gateway.insertPairWrap({
      spaceId: input.spaceId,
      recoveryKeyEpoch: material.recoveryKeyEpoch,
      pairId: 'bp',
      wrappedRecoveryKey: boxes.boxBp,
    });
  } finally {
    wipe(secretA);
    wipe(secretB);
    wipe(material.recoveryKey);
  }
}

export { generatePrintedCode };

export async function rotateRecoveryKey(
  input: {
    spaceId: string;
    adminUserId: string;
    adminUserIds: string[];
    removeUserId?: string;
  },
  gateway: RecoveryAccessGateway = supabaseRecoveryAccessGateway,
): Promise<void> {
  if (input.removeUserId) {
    await gateway.deleteContact(input.spaceId, input.removeUserId);
  }
  await gateway.purgeCiphertext(input.spaceId);
  const nextEpoch = await gateway.bumpRecoveryKeyEpoch(input.spaceId);
  const recoveryKey = randomKey32();
  await cacheRecoveryKey(input.adminUserId, input.spaceId, recoveryKey);
  await deleteSecret(holderStoreKey(input.adminUserId, input.spaceId, 'a'));
  await deleteSecret(holderStoreKey(input.adminUserId, input.spaceId, 'b'));
  try {
    await wrapRecoveryToAdmins(
      {
        spaceId: input.spaceId,
        adminUserId: input.adminUserId,
        recoveryKey,
        recoveryKeyEpoch: nextEpoch,
        adminUserIds: input.adminUserIds,
      },
      gateway,
    );
    const device = await ensureDeviceIdentity(input.adminUserId);
    const meta = await gateway.fetchMeta(input.spaceId);
    await sealFamilyUnderRecovery(
      {
        spaceId: input.spaceId,
        userId: input.adminUserId,
        deviceId: device.deviceId,
        privateKey: device.privateKey,
        recoveryKey,
        keyEpoch: meta?.keyEpoch ?? 1,
      },
      gateway,
    );
    await fulfillAcceptedContacts(
      {
        spaceId: input.spaceId,
        adminUserId: input.adminUserId,
        adminUserIds: input.adminUserIds,
      },
      gateway,
    );
  } finally {
    wipe(recoveryKey);
  }
  logKeyStep('rotate_recovery_key', `${input.spaceId} ${nextEpoch}`);
}

export async function approvedMemberIds(
  spaceId: string,
  memberIds: string[],
  gateway: RecoveryAccessGateway = supabaseRecoveryAccessGateway,
): Promise<Set<string>> {
  const approved = new Set<string>();
  for (const userId of memberIds) {
    const devices = await gateway.listApprovedDevices(spaceId, userId);
    if (devices.length > 0) {
      approved.add(userId);
    }
  }
  return approved;
}
