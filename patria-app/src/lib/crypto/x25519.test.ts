import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { generateDeviceKeyPair, x25519PublicKey, x25519SharedSecret } from './x25519';

describe('X25519 RFC 7748', () => {
  const alicePrivate = hexToBytes(
    '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
  );
  const alicePublic = hexToBytes(
    '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
  );
  const bobPrivate = hexToBytes(
    '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
  );
  const bobPublic = hexToBytes('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
  const shared = hexToBytes('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');

  it('matches the RFC 7748 Diffie-Hellman test vector', () => {
    expect(bytesToHex(x25519PublicKey(alicePrivate.slice()))).toBe(bytesToHex(alicePublic));
    expect(bytesToHex(x25519PublicKey(bobPrivate.slice()))).toBe(bytesToHex(bobPublic));
    expect(bytesToHex(x25519SharedSecret(alicePrivate.slice(), bobPublic))).toBe(
      bytesToHex(shared),
    );
    expect(bytesToHex(x25519SharedSecret(bobPrivate.slice(), alicePublic))).toBe(
      bytesToHex(shared),
    );
  });

  it('generates a working device pair', () => {
    const a = generateDeviceKeyPair();
    const b = generateDeviceKeyPair();
    const ab = x25519SharedSecret(a.privateKey, b.publicKey);
    const ba = x25519SharedSecret(b.privateKey, a.publicKey);
    expect(bytesToHex(ab)).toBe(bytesToHex(ba));
  });
});
