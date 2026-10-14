import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MAESTRO_DIR, PHONE_TESTS, parsePhoneTests } from './e2e-lib.mjs';

function flowNumber(filename) {
  const match = filename.match(/^(\d+)_.*\.ya?ml$/);
  return match ? Number(match[1]) : null;
}

function phoneTestsTag(contents) {
  const match = contents.match(/#\s*PHONE_TESTS:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

const markdown = readFileSync(PHONE_TESTS, 'utf8');
const tests = parsePhoneTests(markdown);
if (tests.length === 0) {
  console.error('e2e:check: no numbered tests found in PHONE_TESTS.md');
  process.exit(1);
}

const flowFiles = existsSync(MAESTRO_DIR)
  ? readdirSync(MAESTRO_DIR).filter((name) => /^\d+_.*\.ya?ml$/.test(name))
  : [];

const errors = [];
const testsByNumber = new Map(tests.map((test) => [test.number, test]));

for (const test of tests) {
  if (test.manual) {
    continue;
  }
  const match = flowFiles.find((name) => flowNumber(name) === test.number);
  if (!match) {
    errors.push(
      `PHONE_TESTS.md test ${test.number} ("${test.title}") has no Maestro flow and is not marked (manual).`,
    );
  }
}

for (const filename of flowFiles) {
  const path = join(MAESTRO_DIR, filename);
  const contents = readFileSync(path, 'utf8');
  const tagged = phoneTestsTag(contents);
  const fromName = flowNumber(filename);
  const number = tagged ?? fromName;
  if (tagged != null && tagged !== fromName) {
    errors.push(`${filename} is named for test ${fromName} but tagged PHONE_TESTS: ${tagged}.`);
  }
  if (!testsByNumber.has(number)) {
    errors.push(`${filename} points to test ${number}, which is not in PHONE_TESTS.md.`);
  }
}

if (errors.length > 0) {
  console.error('e2e:check failed:');
  for (const error of errors) {
    console.error(`  ${error}`);
  }
  process.exit(1);
}

console.log(
  `e2e:check passed: ${tests.length} tests in PHONE_TESTS.md, ${flowFiles.length} Maestro flows.`,
);
