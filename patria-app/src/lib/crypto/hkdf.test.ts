import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { hkdfSha256 } from './hkdf';

describe('HKDF-SHA256 RFC 5869', () => {
  it('matches test case 1', () => {
    const ikm = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hexToBytes('000102030405060708090a0b0c');
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');
    const okm = hkdfSha256(ikm, salt, info, 42);
    expect(bytesToHex(okm)).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });

  it('is deterministic and changes when info or salt changes', () => {
    const ikm = hexToBytes('0b'.repeat(32));
    const salt = hexToBytes('11'.repeat(16));
    const info = hexToBytes('22'.repeat(8));
    const a = hkdfSha256(ikm, salt, info, 32);
    const b = hkdfSha256(ikm, salt, info, 32);
    const c = hkdfSha256(ikm, salt, hexToBytes('33'.repeat(8)), 32);
    const d = hkdfSha256(ikm, hexToBytes('44'.repeat(16)), info, 32);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
    expect(bytesToHex(a)).not.toBe(bytesToHex(c));
    expect(bytesToHex(a)).not.toBe(bytesToHex(d));
  });
});
