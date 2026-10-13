// @ts-nocheck
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { generateDeviceKeyPair } from './x25519';
import { randomKey32 } from './random';
import { wrapKeyToDevice } from './wrap';
import { generatePrintedCode } from './printedCode';
import { createRecoveryBoxes } from './recovery';

function cryptoSourceFiles(): string[] {
  return readdirSync(__dirname)
    .filter((name: string) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name: string) => join(__dirname, name));
}

const CONSOLE_CALL = /\bconsole\.(log|warn|info|debug|error)\b/;

describe('crypto hygiene', () => {
  it('does not use Math.random or log from crypto files', () => {
    for (const file of cryptoSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      expect(source.startsWith('// SECURITY REVIEW REQUIRED')).toBe(true);
      expect(source).not.toMatch(/\bMath\.random\b/);
      expect(source).not.toMatch(CONSOLE_CALL);
    }
  });

  it('fails if console is called while using crypto', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const device = generateDeviceKeyPair();
      const secret = randomKey32();
      wrapKeyToDevice(secret, device.publicKey, {
        familySpaceId: '11111111-1111-1111-1111-111111111111',
        keyEpoch: 1,
        userId: '22222222-2222-2222-2222-222222222222',
        deviceId: '33333333-3333-3333-3333-333333333333',
      });
      const printed = generatePrintedCode();
      createRecoveryBoxes(secret, randomKey32(), randomKey32(), printed.secret, {
        familySpaceId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        recoveryKeyEpoch: 0,
      });
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
      expect(debug).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
      info.mockRestore();
      debug.mockRestore();
      error.mockRestore();
    }
  });
});
