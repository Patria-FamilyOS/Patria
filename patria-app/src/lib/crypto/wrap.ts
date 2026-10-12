// SECURITY REVIEW REQUIRED
import { concatBytes, encodeUtf8Prefixed, requireLength, u32be, utf8ToBytes, wipe } from './bytes';
import { hkdfSha256 } from './hkdf';
import { openXChaCha20Poly1305, sealXChaCha20Poly1305 } from './aead';
import { KEY_BYTES, randomKey32 } from './random';
import { x25519PublicKey, x25519SharedSecret } from './x25519';

export type MemberWrapAad = {
  familySpaceId: string;
  keyEpoch: number;
  userId: string;
  deviceId: string;
};

const WRAP_INFO = utf8ToBytes('patria-device-wrap-v1');
const EPHEMERAL_LEN = 32;

export function encodeMemberWrapAad(aad: MemberWrapAad): Uint8Array {
  return concatBytes(
    encodeUtf8Prefixed(aad.familySpaceId),
    u32be(aad.keyEpoch),
    encodeUtf8Prefixed(aad.userId),
    encodeUtf8Prefixed(aad.deviceId),
  );
}

export function encodeEpochAad(familySpaceId: string, keyEpoch: number): Uint8Array {
  return concatBytes(encodeUtf8Prefixed(familySpaceId), u32be(keyEpoch));
}

function wrapKeyFromShared(shared: Uint8Array, aadBytes: Uint8Array): Uint8Array {
  return hkdfSha256(shared, aadBytes, WRAP_INFO, KEY_BYTES);
}

export function wrapKeyToDevice(
  secret32: Uint8Array,
  recipientPublicKey: Uint8Array,
  aad: MemberWrapAad,
): Uint8Array {
  requireLength(secret32, KEY_BYTES);
  requireLength(recipientPublicKey, KEY_BYTES);
  const aadBytes = encodeMemberWrapAad(aad);
  const ephemeralPrivate = randomKey32();
  try {
    const ephemeralPublic = x25519PublicKey(ephemeralPrivate);
    const shared = x25519SharedSecret(ephemeralPrivate, recipientPublicKey);
    let wrapKey: Uint8Array | undefined;
    try {
      wrapKey = wrapKeyFromShared(shared, aadBytes);
      const sealed = sealXChaCha20Poly1305(wrapKey, secret32, aadBytes);
      return concatBytes(ephemeralPublic, sealed);
    } finally {
      wipe(shared);
      if (wrapKey) {
        wipe(wrapKey);
      }
    }
  } finally {
    wipe(ephemeralPrivate);
  }
}

export function unwrapKeyFromDevice(
  wrapped: Uint8Array,
  recipientPrivateKey: Uint8Array,
  aad: MemberWrapAad,
): Uint8Array {
  requireLength(recipientPrivateKey, KEY_BYTES);
  if (wrapped.length <= EPHEMERAL_LEN) {
    throw new Error('unwrap failed');
  }
  const aadBytes = encodeMemberWrapAad(aad);
  const ephemeralPublic = wrapped.subarray(0, EPHEMERAL_LEN);
  const sealed = wrapped.subarray(EPHEMERAL_LEN);
  const shared = x25519SharedSecret(recipientPrivateKey, ephemeralPublic);
  let wrapKey: Uint8Array | undefined;
  try {
    wrapKey = wrapKeyFromShared(shared, aadBytes);
    return openXChaCha20Poly1305(wrapKey, sealed, aadBytes);
  } finally {
    wipe(shared);
    if (wrapKey) {
      wipe(wrapKey);
    }
  }
}
