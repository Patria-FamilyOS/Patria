// SECURITY REVIEW REQUIRED
import { concatBytes, compareBytes, encodeUtf8Prefixed, requireLength, u32be, utf8ToBytes, wipe } from './bytes';
import { hkdfSha256 } from './hkdf';
import { openXChaCha20Poly1305, sealXChaCha20Poly1305 } from './aead';
import { KEY_BYTES } from './random';

export type RecoveryPairId = 'ab' | 'ap' | 'bp';

export type RecoveryBoxes = {
  boxAb: Uint8Array;
  boxAp: Uint8Array;
  boxBp: Uint8Array;
};

export type RecoveryContext = {
  familySpaceId: string;
  userId: string;
  recoveryKeyEpoch: number;
};

const PAIR_INFO = utf8ToBytes('patria-rk-pair-v1');

function pairAad(ctx: RecoveryContext, pair: RecoveryPairId): Uint8Array {
  return concatBytes(
    encodeUtf8Prefixed(ctx.familySpaceId),
    encodeUtf8Prefixed(ctx.userId),
    u32be(ctx.recoveryKeyEpoch),
    utf8ToBytes(pair),
  );
}

function pairWrapKey(secretX: Uint8Array, secretY: Uint8Array, ctx: RecoveryContext): Uint8Array {
  requireLength(secretX, KEY_BYTES);
  requireLength(secretY, KEY_BYTES);
  const ordered = compareBytes(secretX, secretY) <= 0 ? [secretX, secretY] : [secretY, secretX];
  const info = concatBytes(
    PAIR_INFO,
    encodeUtf8Prefixed(ctx.familySpaceId),
    encodeUtf8Prefixed(ctx.userId),
    u32be(ctx.recoveryKeyEpoch),
  );
  return hkdfSha256(ordered[0], ordered[1], info, KEY_BYTES);
}

function sealPair(
  recoveryKey: Uint8Array,
  secretX: Uint8Array,
  secretY: Uint8Array,
  ctx: RecoveryContext,
  pair: RecoveryPairId,
): Uint8Array {
  const wrapKey = pairWrapKey(secretX, secretY, ctx);
  try {
    return sealXChaCha20Poly1305(wrapKey, recoveryKey, pairAad(ctx, pair));
  } finally {
    wipe(wrapKey);
  }
}

export function createRecoveryBoxes(
  recoveryKey: Uint8Array,
  secretA: Uint8Array,
  secretB: Uint8Array,
  secretP: Uint8Array,
  ctx: RecoveryContext,
): RecoveryBoxes {
  requireLength(recoveryKey, KEY_BYTES);
  return {
    boxAb: sealPair(recoveryKey, secretA, secretB, ctx, 'ab'),
    boxAp: sealPair(recoveryKey, secretA, secretP, ctx, 'ap'),
    boxBp: sealPair(recoveryKey, secretB, secretP, ctx, 'bp'),
  };
}

export function openRecoveryPair(
  box: Uint8Array,
  secretX: Uint8Array,
  secretY: Uint8Array,
  ctx: RecoveryContext,
  pair: RecoveryPairId,
): Uint8Array {
  const wrapKey = pairWrapKey(secretX, secretY, ctx);
  try {
    return openXChaCha20Poly1305(wrapKey, box, pairAad(ctx, pair));
  } finally {
    wipe(wrapKey);
  }
}

export function openWithHolders(
  boxes: RecoveryBoxes,
  holderX: { id: 'a' | 'b' | 'p'; secret: Uint8Array },
  holderY: { id: 'a' | 'b' | 'p'; secret: Uint8Array },
  ctx: RecoveryContext,
): Uint8Array {
  const ids = [holderX.id, holderY.id].sort().join('');
  if (ids === 'ab') {
    return openRecoveryPair(boxes.boxAb, holderX.secret, holderY.secret, ctx, 'ab');
  }
  if (ids === 'ap') {
    return openRecoveryPair(boxes.boxAp, holderX.secret, holderY.secret, ctx, 'ap');
  }
  if (ids === 'bp') {
    return openRecoveryPair(boxes.boxBp, holderX.secret, holderY.secret, ctx, 'bp');
  }
  throw new Error('unwrap failed');
}
