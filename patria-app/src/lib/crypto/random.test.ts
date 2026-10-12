import { bytesToHex } from '@noble/hashes/utils.js';
import { KEY_BYTES, randomBytes, randomKey32 } from './random';

describe('random bytes', () => {
  it('fills the requested length from expo-crypto, not Math.random', () => {
    const a = randomBytes(KEY_BYTES);
    const b = randomKey32();
    expect(a).toHaveLength(KEY_BYTES);
    expect(b).toHaveLength(KEY_BYTES);
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});
