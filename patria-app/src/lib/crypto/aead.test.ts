import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { encryptXChaCha20Poly1305Raw, openXChaCha20Poly1305, sealXChaCha20Poly1305 } from './aead';
import { randomKey32 } from './random';

describe('XChaCha20-Poly1305 IETF draft vector', () => {
  it('matches draft-irtf-cfrg-xchacha-03 AEAD_XCHACHA20_POLY1305', () => {
    const key = hexToBytes(
      '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f',
    );
    const nonce = hexToBytes('404142434445464748494a4b4c4d4e4f5051525354555657');
    const aad = hexToBytes('50515253c0c1c2c3c4c5c6c7');
    const plaintext = hexToBytes(
      '4c616469657320616e642047656e746c656d656e206f662074686520636c617373206f66202739393a204966204920636f756c64206f6666657220796f75206f6e6c79206f6e652074697020666f7220746865206675747572652c2073756e73637265656e20776f756c642062652069742e',
    );
    const expected = hexToBytes(
      'bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff921f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49',
    );
    const out = encryptXChaCha20Poly1305Raw(key, nonce, plaintext, aad);
    expect(bytesToHex(out)).toBe(bytesToHex(expected));
  });

  it('round-trips and fails when the ciphertext is tampered', () => {
    const key = randomKey32();
    const aad = hexToBytes('0102');
    const sealed = sealXChaCha20Poly1305(key, hexToBytes('aabbcc'), aad);
    expect(bytesToHex(openXChaCha20Poly1305(key, sealed, aad))).toBe('aabbcc');
    const tampered = sealed.slice();
    tampered[tampered.length - 1] ^= 1;
    expect(() => openXChaCha20Poly1305(key, tampered, aad)).toThrow('unwrap failed');
  });
});
