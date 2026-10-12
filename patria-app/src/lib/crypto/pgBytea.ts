// SECURITY REVIEW REQUIRED
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export function toPgBytea(bytes: Uint8Array): string {
  return `\\x${bytesToHex(bytes)}`;
}

export function fromPgBytea(value: string | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  const hex = value.startsWith('\\x') || value.startsWith('\\X') ? value.slice(2) : value;
  return hexToBytes(hex);
}
