// SECURITY REVIEW REQUIRED
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Uint8Array {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error('invalid length');
  }
  return hkdf(sha256, ikm, salt, info, length);
}
