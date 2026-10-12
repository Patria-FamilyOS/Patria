// SECURITY REVIEW REQUIRED
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateDeviceKeyPair, x25519PublicKey } from './x25519';
import { randomBytes } from './random';
import { getSecretBytes, getSecretText, setSecretBytes, setSecretText } from './secureKeys';

export type DeviceIdentity = {
  deviceId: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

export function deviceIdStoreKey(userId: string): string {
  return `patria.u.${userId}.device.id`;
}

export function devicePrivateStoreKey(userId: string): string {
  return `patria.u.${userId}.device.private`;
}

function randomDeviceId(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function ensureDeviceIdentity(userId: string): Promise<DeviceIdentity> {
  const existingId = await getSecretText(deviceIdStoreKey(userId));
  const existingPrivate = await getSecretBytes(devicePrivateStoreKey(userId));
  if (existingId && existingPrivate) {
    return {
      deviceId: existingId,
      privateKey: existingPrivate,
      publicKey: x25519PublicKey(existingPrivate),
    };
  }

  const pair = generateDeviceKeyPair();
  const deviceId = randomDeviceId();
  await setSecretText(deviceIdStoreKey(userId), deviceId);
  await setSecretBytes(devicePrivateStoreKey(userId), pair.privateKey);
  return {
    deviceId,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
  };
}
