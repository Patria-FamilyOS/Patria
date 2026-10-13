import { secretsEqual } from './bytes';
import { generateDeviceKeyPair } from './x25519';
import { randomKey32 } from './random';
import {
  unwrapFamilyKeyFromRecoveryPrivate,
  unwrapKeyFromDevice,
  wrapFamilyKeyToRecoveryPublic,
  wrapKeyToDevice,
  type MemberWrapAad,
} from './wrap';

const baseAad: MemberWrapAad = {
  familySpaceId: '11111111-1111-1111-1111-111111111111',
  keyEpoch: 1,
  userId: '22222222-2222-2222-2222-222222222222',
  deviceId: '33333333-3333-3333-3333-333333333333',
};

describe('device wrap', () => {
  it('wraps then unwraps a 32-byte key', () => {
    const device = generateDeviceKeyPair();
    const secret = randomKey32();
    const wrapped = wrapKeyToDevice(secret, device.publicKey, baseAad);
    const opened = unwrapKeyFromDevice(wrapped, device.privateKey, baseAad);
    expect(secretsEqual(opened, secret)).toBe(true);
  });

  it('fails with the wrong private key', () => {
    const device = generateDeviceKeyPair();
    const other = generateDeviceKeyPair();
    const secret = randomKey32();
    const wrapped = wrapKeyToDevice(secret, device.publicKey, baseAad);
    expect(() => unwrapKeyFromDevice(wrapped, other.privateKey, baseAad)).toThrow('unwrap failed');
  });

  it('fails when any associated data field changes', () => {
    const device = generateDeviceKeyPair();
    const secret = randomKey32();
    const wrapped = wrapKeyToDevice(secret, device.publicKey, baseAad);
    const variants: MemberWrapAad[] = [
      { ...baseAad, familySpaceId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      { ...baseAad, keyEpoch: 2 },
      { ...baseAad, userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
      { ...baseAad, deviceId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
    ];
    for (const aad of variants) {
      expect(() => unwrapKeyFromDevice(wrapped, device.privateKey, aad)).toThrow('unwrap failed');
    }
  });

  it('fails when the ciphertext is tampered', () => {
    const device = generateDeviceKeyPair();
    const secret = randomKey32();
    const wrapped = wrapKeyToDevice(secret, device.publicKey, baseAad);
    const tampered = wrapped.slice();
    tampered[tampered.length - 1] ^= 1;
    expect(() => unwrapKeyFromDevice(tampered, device.privateKey, baseAad)).toThrow(
      'unwrap failed',
    );
  });

  it('seals a family key to a recovery public key with space, epoch and user AAD', () => {
    const pair = generateDeviceKeyPair();
    const familyKey = randomKey32();
    const aad = {
      familySpaceId: baseAad.familySpaceId,
      keyEpoch: 1,
      userId: baseAad.userId,
    };
    const wrapped = wrapFamilyKeyToRecoveryPublic(familyKey, pair.publicKey, aad);
    const opened = unwrapFamilyKeyFromRecoveryPrivate(wrapped, pair.privateKey, aad);
    expect(secretsEqual(opened, familyKey)).toBe(true);
    expect(() =>
      unwrapFamilyKeyFromRecoveryPrivate(wrapped, pair.privateKey, { ...aad, keyEpoch: 2 }),
    ).toThrow('unwrap failed');
  });
});
