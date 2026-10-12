import { bytesToHex } from '@noble/hashes/utils.js';

import { generateDeviceKeyPair } from './x25519';
import { fromPgBytea, requireX25519PublicKey, toPgBytea } from './pgBytea';

describe('pgBytea', () => {
  it('round-trips bytes through the PostgREST hex upload and read formats', () => {
    const { publicKey } = generateDeviceKeyPair();
    const uploaded = toPgBytea(publicKey);
    expect(uploaded.startsWith('\\x')).toBe(true);
    const asRead = uploaded;
    const decoded = fromPgBytea(asRead);
    expect(bytesToHex(decoded)).toBe(bytesToHex(publicKey));
    expect(requireX25519PublicKey(decoded).length).toBe(32);
  });

  it('accepts hex without a prefix, base64, arrays, and JSON-cloned keys', () => {
    const { publicKey } = generateDeviceKeyPair();
    const hex = bytesToHex(publicKey);
    expect(bytesToHex(fromPgBytea(hex))).toBe(hex);
    expect(bytesToHex(fromPgBytea(Array.from(publicKey)))).toBe(hex);
    expect(bytesToHex(fromPgBytea(JSON.parse(JSON.stringify(publicKey))))).toBe(hex);
    const asciiHex = new TextEncoder().encode(`\\x${hex}`);
    expect(bytesToHex(fromPgBytea(asciiHex))).toBe(hex);
    const base64 = globalThis.btoa(String.fromCharCode(...publicKey));
    expect(bytesToHex(fromPgBytea(base64))).toBe(hex);
  });

  it('rejects a public key that is not 32 bytes', () => {
    expect(() => requireX25519PublicKey(new Uint8Array(31))).toThrow(
      'invalid public key length 31',
    );
  });
});
