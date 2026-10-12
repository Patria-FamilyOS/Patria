// SECURITY REVIEW REQUIRED
import { deleteSecret, getSecretBytes, setSecretBytes } from './secureKeys';

export function familyKeyStoreKey(userId: string, spaceId: string): string {
  return `patria.u.${userId}.familyKey.${spaceId}`;
}

export function recoveryKeyStoreKey(userId: string, spaceId: string): string {
  return `patria.u.${userId}.recoveryKey.${spaceId}`;
}

export async function discardLocalFamilySecrets(userId: string, spaceId: string): Promise<void> {
  await deleteSecret(familyKeyStoreKey(userId, spaceId));
  await deleteSecret(recoveryKeyStoreKey(userId, spaceId));
}

export async function cacheFamilySecrets(
  userId: string,
  spaceId: string,
  familyKey: Uint8Array,
  recoveryKey?: Uint8Array,
): Promise<void> {
  await setSecretBytes(familyKeyStoreKey(userId, spaceId), familyKey);
  if (recoveryKey) {
    await setSecretBytes(recoveryKeyStoreKey(userId, spaceId), recoveryKey);
  }
}

export async function loadCachedFamilyKey(
  userId: string,
  spaceId: string,
): Promise<Uint8Array | null> {
  return getSecretBytes(familyKeyStoreKey(userId, spaceId));
}

export async function loadCachedRecoveryKey(
  userId: string,
  spaceId: string,
): Promise<Uint8Array | null> {
  return getSecretBytes(recoveryKeyStoreKey(userId, spaceId));
}
