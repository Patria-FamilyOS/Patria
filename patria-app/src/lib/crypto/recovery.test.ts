import { secretsEqual, wipe } from './bytes';
import {
  decodePrintedCode,
  encodePrintedCode,
  generatePrintedCode,
  PRINTED_CODE_ENTROPY_BITS,
  PRINTED_CODE_WORD_COUNT,
} from './printedCode';
import { randomKey32 } from './random';
import { createRecoveryBoxes, openWithHolders } from './recovery';

const ctx = { familySpaceId: '11111111-1111-1111-1111-111111111111', recoveryKeyEpoch: 0 };

describe('printed recovery code', () => {
  it('round-trips 24 words with at least 128 bits of entropy', () => {
    const printed = generatePrintedCode();
    expect(printed.words.split(' ')).toHaveLength(PRINTED_CODE_WORD_COUNT);
    expect(printed.secret.length * 8).toBeGreaterThanOrEqual(128);
    expect(printed.secret.length * 8).toBe(PRINTED_CODE_ENTROPY_BITS);
    const decoded = decodePrintedCode(printed.words);
    expect(secretsEqual(decoded, printed.secret)).toBe(true);
    expect(decodePrintedCode(encodePrintedCode(printed.secret))).toEqual(printed.secret);
  });

  it('rejects a wrong printed code', () => {
    const printed = generatePrintedCode();
    const other = generatePrintedCode();
    expect(() => decodePrintedCode('not a mnemonic at all')).toThrow('printed code failed');
    expect(secretsEqual(decodePrintedCode(other.words), printed.secret)).toBe(false);
  });
});

describe('pairwise 2-of-3 recovery boxes', () => {
  it('opens with each of the three pairs and not with one holder', () => {
    const recoveryKey = randomKey32();
    const secretA = randomKey32();
    const secretB = randomKey32();
    const printed = generatePrintedCode();
    const boxes = createRecoveryBoxes(recoveryKey, secretA, secretB, printed.secret, ctx);

    const fromAb = openWithHolders(
      boxes,
      { id: 'a', secret: secretA },
      { id: 'b', secret: secretB },
      ctx,
    );
    const fromAp = openWithHolders(
      boxes,
      { id: 'a', secret: secretA },
      { id: 'p', secret: decodePrintedCode(printed.words) },
      ctx,
    );
    const fromBp = openWithHolders(
      boxes,
      { id: 'b', secret: secretB },
      { id: 'p', secret: printed.secret },
      ctx,
    );

    expect(secretsEqual(fromAb, recoveryKey)).toBe(true);
    expect(secretsEqual(fromAp, recoveryKey)).toBe(true);
    expect(secretsEqual(fromBp, recoveryKey)).toBe(true);

    expect(() =>
      openWithHolders(boxes, { id: 'a', secret: secretA }, { id: 'a', secret: secretA }, ctx),
    ).toThrow('unwrap failed');
    expect(() =>
      openWithHolders(
        boxes,
        { id: 'a', secret: secretA },
        { id: 'b', secret: randomKey32() },
        ctx,
      ),
    ).toThrow('unwrap failed');

    const wrongPaper = generatePrintedCode();
    expect(() =>
      openWithHolders(
        boxes,
        { id: 'a', secret: secretA },
        { id: 'p', secret: wrongPaper.secret },
        ctx,
      ),
    ).toThrow('unwrap failed');

    wipe(recoveryKey);
  });
});
