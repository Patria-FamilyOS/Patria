// SECURITY REVIEW REQUIRED
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { requireLength } from './bytes';
import { KEY_BYTES, randomKey32 } from './random';

export const PRINTED_CODE_ENTROPY_BITS = 256;
export const PRINTED_CODE_WORD_COUNT = 24;

export type PrintedCode = {
  words: string;
  secret: Uint8Array;
};

export function generatePrintedCode(): PrintedCode {
  const secret = randomKey32();
  const words = entropyToMnemonic(secret, wordlist);
  if (words.split(/\s+/).length !== PRINTED_CODE_WORD_COUNT) {
    throw new Error('printed code failed');
  }
  return { words, secret };
}

export function encodePrintedCode(secret: Uint8Array): string {
  requireLength(secret, KEY_BYTES);
  return entropyToMnemonic(secret, wordlist);
}

export function decodePrintedCode(words: string): Uint8Array {
  const normalized = words.trim().toLowerCase().split(/\s+/).join(' ');
  try {
    const secret = mnemonicToEntropy(normalized, wordlist);
    requireLength(secret, KEY_BYTES);
    return secret;
  } catch {
    throw new Error('printed code failed');
  }
}
