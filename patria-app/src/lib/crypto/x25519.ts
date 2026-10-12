// SECURITY REVIEW REQUIRED
import { x25519 } from '@noble/curves/ed25519.js';
import { requireLength, wipe } from './bytes';
import { KEY_BYTES, randomKey32 } from './random';

export type DeviceKeyPair = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
};

export function generateDeviceKeyPair(): DeviceKeyPair {
  const privateKey = randomKey32();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function x25519PublicKey(privateKey: Uint8Array): Uint8Array {
  requireLength(privateKey, KEY_BYTES);
  return x25519.getPublicKey(privateKey);
}

export function x25519SharedSecret(privateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  requireLength(privateKey, KEY_BYTES);
  requireLength(peerPublicKey, KEY_BYTES);
  return x25519.getSharedSecret(privateKey, peerPublicKey);
}

export function wipeDevicePrivateKey(privateKey: Uint8Array): void {
  wipe(privateKey);
}
