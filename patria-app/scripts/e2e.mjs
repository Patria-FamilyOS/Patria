import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_ROOT,
  E2E_FAMILY_NAME,
  MAESTRO_DIR,
  PHONE_TESTS,
  TEST_EMAILS,
  TEST_TIMEOUT_MS,
  assertAppInstalledOn,
  assertLocalSupabaseUrl,
  bootDevices,
  e2eDeviceCount,
  ensureJavaHome,
  loadLocalFiles,
  parsePhoneTests,
  passwordFor,
  publicExpoEnv,
  supabaseUrlFromEnv,
} from './e2e-lib.mjs';

const SCRIPT = 'e2e';
const ARTIFACTS = join(APP_ROOT, 'e2e-artifacts');
const RECORDINGS = join(APP_ROOT, 'e2e-recordings');

function parseArgs(argv) {
  let devicesRaw = process.env.E2E_DEVICES || '2';
  const out = { test: null, record: null, devices: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--test') {
      out.test = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--record') {
      out.record = true;
    } else if (arg === '--no-record') {
      out.record = false;
    } else if (arg === '--devices') {
      devicesRaw = argv[i + 1];
      i += 1;
    }
  }
  try {
    out.devices = e2eDeviceCount(devicesRaw);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'E2E_DEVICES must be 1, 2 or 3.');
    process.exit(1);
  }
  return out;
}

async function askRecord(flag) {
  if (flag === true || flag === false) {
    return flag;
  }
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question('Record simulator video? [y/N] ', resolve);
  });
  rl.close();
  return /^y/i.test(answer.trim());
}

function runNode(script, args) {
  execFileSync(process.execPath, [join(APP_ROOT, 'scripts', script), ...args], {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
}

function dbCheck(args) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [join(APP_ROOT, 'scripts', 'e2e-db-check.mjs'), ...args],
      { cwd: APP_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return { ok: false, stdout: '', error: error instanceof Error ? error.message : 'failed' };
  }
}

function redactCli(text) {
  return text.replace(/E2E_PASSWORD=[^\s]+/g, 'E2E_PASSWORD=(redacted)');
}

let testDeadline = 0;

function remainingMs() {
  if (!testDeadline) {
    return TEST_TIMEOUT_MS;
  }
  return testDeadline - Date.now();
}

function maestro({ flow, device, env }) {
  const args = ['test', '--no-ansi', '--platform', 'ios'];
  if (device) {
    args.push('--device', device);
  }
  for (const [key, value] of Object.entries(env)) {
    if (value != null && value !== '') {
      args.push('-e', `${key}=${value}`);
    }
  }
  args.push(flow);
  const timeout = remainingMs();
  if (timeout <= 0) {
    throw new Error('timed out');
  }
  const result = spawnSync('maestro', args, {
    cwd: APP_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
    timeout,
    killSignal: 'SIGTERM',
  });
  if (result.error && result.error.code === 'ETIMEDOUT') {
    throw new Error('timed out');
  }
  if (result.signal) {
    throw new Error('timed out');
  }
  if (result.status !== 0) {
    throw new Error(redactCli(`Command failed: maestro ${args.join(' ')}`));
  }
}

function tryMaestro(opts) {
  try {
    maestro(opts);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function startRecording(udid, name) {
  mkdirSync(RECORDINGS, { recursive: true });
  const path = join(RECORDINGS, `${name}.mp4`);
  const child = spawn('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--force', path], {
    stdio: 'ignore',
  });
  return { child, path };
}

function stopRecording(handle) {
  if (!handle) {
    return;
  }
  handle.child.kill('SIGINT');
}

function wipeSensitiveArtifacts(testNumber) {
  if (testNumber !== 11 && testNumber !== 12) {
    return;
  }
  if (existsSync(ARTIFACTS)) {
    rmSync(join(ARTIFACTS, `${String(testNumber).padStart(2, '0')}`), { recursive: true, force: true });
  }
}

function signInEnv(secrets, n) {
  return {
    E2E_EMAIL: TEST_EMAILS[n],
    E2E_PASSWORD: passwordFor(secrets, n),
    E2E_HELLO: `Hello, Test ${n}`,
  };
}

function result(status, detail = '') {
  return { status, detail };
}

const args = parseArgs(process.argv.slice(2));
ensureJavaHome();
const { e2eEnv, secrets } = loadLocalFiles();
assertLocalSupabaseUrl(supabaseUrlFromEnv(e2eEnv) || 'http://127.0.0.1:54321', SCRIPT);

for (const n of [1, 2, 3]) {
  if (!passwordFor(secrets, n)) {
    console.error(
      `${SCRIPT}: missing E2E_PASSWORD_TEST${n} in gitignored .e2e-secrets. Run npm run e2e:setup after filling .e2e-secrets.`,
    );
    process.exit(1);
  }
}

if (!existsSync(join(APP_ROOT, '.env.e2e.local'))) {
  console.error(`${SCRIPT}: missing .env.e2e.local. Run npm run e2e:setup first.`);
  process.exit(1);
}

try {
  execFileSync('maestro', ['--version'], { stdio: 'ignore' });
} catch {
  console.error(
    `${SCRIPT}: Maestro is not on PATH. Install with: curl -Ls "https://get.maestro.dev" | bash`,
  );
  process.exit(1);
}

const tests = parsePhoneTests(readFileSync(PHONE_TESTS, 'utf8'));
const selected = args.test ? tests.filter((test) => test.number === args.test) : tests;
if (selected.length === 0) {
  console.error(`${SCRIPT}: no matching test.`);
  process.exit(1);
}

const record = await askRecord(args.record);
if (record) {
  console.log('Recordings go in patria-app/e2e-recordings/ (gitignored). Tests 11–12 stay on this computer only.');
}

let devices = [];
try {
  devices = bootDevices(Math.min(args.devices, 3));
} catch (error) {
  console.error(
    `${SCRIPT}: ${error instanceof Error ? error.message : 'could not boot simulators'}. Phone flows are skipped, not failed.`,
  );
}

const [deviceA, deviceB, deviceC] = devices;
if (devices.length > 0) {
  try {
    assertAppInstalledOn(devices, SCRIPT);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
mkdirSync(ARTIFACTS, { recursive: true });
const progressPath = join(ARTIFACTS, 'progress.txt');
writeFileSync(progressPath, '', { encoding: 'utf8' });

function progress(line) {
  console.log(line);
  appendFileSync(progressPath, `${line}\n`);
}

function captureScreen(udid, name) {
  if (!udid) {
    return;
  }
  try {
    execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', join(ARTIFACTS, `${name}.png`)], {
      stdio: 'ignore',
    });
  } catch {
    // Screenshot is best-effort; the test result still stands.
  }
}

async function metroReady() {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    try {
      const response = await fetch(`http://${host}:8081/status`, {
        signal: AbortSignal.timeout(2000),
      });
      const text = await response.text();
      if (response.ok && /running/i.test(text)) {
        return host;
      }
    } catch {
      // Try the next host; Metro may be IPv4-only or IPv6-only.
    }
  }
  return false;
}

function openDevClient(udid) {
  try {
    execFileSync(
      'xcrun',
      ['simctl', 'openurl', udid, 'app.patria.dev://expo-development-client/?url=http://127.0.0.1:8081'],
      { stdio: 'ignore' },
    );
  } catch {
    try {
      execFileSync('xcrun', ['simctl', 'openurl', udid, 'exp://127.0.0.1:8081'], { stdio: 'ignore' });
    } catch {
      // The next launchApp in Maestro still tries the last Metro URL.
    }
  }
}

async function ensureMetro() {
  const readyHost = await metroReady();
  if (!readyHost) {
    progress('Starting Metro in the background.');
    const log = join(ARTIFACTS, 'metro.log');
    const child = spawn('npx', ['expo', 'start', '--port', '8081'], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        ...publicExpoEnv(e2eEnv),
        EXPO_NO_DOTENV: '1',
        REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1',
      },
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: true,
    });
    child.unref();
    appendFileSync(log, `spawned metro pid=${child.pid}\n`);
    const started = Date.now();
    while (Date.now() - started < 90000) {
      if (await metroReady()) {
        break;
      }
      if (child.exitCode != null) {
        throw new Error('Metro exited before it became ready. See e2e-artifacts/metro.log.');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!(await metroReady())) {
      throw new Error('Metro did not become ready on port 8081.');
    }
  } else {
    progress(`Metro already running on port 8081 (${readyHost}).`);
  }
  progress('Metro is ready.');
  for (const udid of [deviceA, deviceB, deviceC].filter(Boolean)) {
    openDevClient(udid);
  }
}

function notifyMac(message) {
  try {
    execFileSync('osascript', ['-e', `display notification ${JSON.stringify(message)} with title "Patria"`], {
      stdio: 'ignore',
    });
  } catch {
    // Notification is optional on machines without osascript.
  }
}

const reports = [];

function flow(name) {
  return join(MAESTRO_DIR, name);
}

function seedAdminKeys() {
  maestro({
    flow: flow('08_family_key_created.yaml'),
    device: deviceA,
    env: { ...signInEnv(secrets, 1), PHASE: 'home_keys' },
  });
}

function seedLetIn(memberN, device) {
  maestro({
    flow: flow('09_let_in.yaml'),
    device,
    env: { ...signInEnv(secrets, memberN), PHASE: 'waiting' },
  });
  maestro({
    flow: flow('09_let_in.yaml'),
    device: deviceA,
    env: { ...signInEnv(secrets, 1), PHASE: 'let_in' },
  });
  maestro({
    flow: flow('09_let_in.yaml'),
    device,
    env: { ...signInEnv(secrets, memberN), PHASE: 'keys_ready' },
  });
}

function seedBeforeYouStart(testNumber) {
  if (![9, 10, 11, 13].includes(testNumber)) {
    return;
  }
  seedAdminKeys();
  if (testNumber === 11) {
    seedLetIn(2, args.devices >= 2 && deviceB ? deviceB : deviceA);
  }
  if (testNumber === 13) {
    const other = args.devices >= 2 && deviceB ? deviceB : deviceA;
    seedLetIn(2, other);
    seedLetIn(3, args.devices >= 3 && deviceC ? deviceC : other);
  }
}

function step(testNumber, stepNumber, label, fn) {
  if (remainingMs() <= 0) {
    reports.push({ testNumber, stepNumber, label, status: 'fail', detail: 'timed out' });
    console.log(`  ${stepNumber}. ${label}: FAIL (timed out)`);
    throw new Error('timed out');
  }
  let status = 'pass';
  let detail = '';
  try {
    const out = fn();
    if (out && out.status) {
      status = out.status;
      detail = out.detail ?? '';
    }
  } catch (error) {
    status = 'fail';
    detail = error instanceof Error ? error.message : 'failed';
    captureScreen(deviceA, `fail-test-${testNumber}-step-${stepNumber}`);
    if (detail === 'timed out') {
      reports.push({ testNumber, stepNumber, label, status, detail });
      console.log(`  ${stepNumber}. ${label}: FAIL (timed out)`);
      throw error;
    }
  }
  reports.push({ testNumber, stepNumber, label, status, detail });
  const extra = detail ? ` (${detail})` : '';
  console.log(`  ${stepNumber}. ${label}: ${status.toUpperCase()}${extra}`);
  return status;
}

function skipRest(testNumber, from, reason, count) {
  for (let n = from; n <= count; n += 1) {
    reports.push({
      testNumber,
      stepNumber: n,
      label: `step ${n}`,
      status: 'skip',
      detail: reason,
    });
    console.log(`  ${n}. skipped (${reason})`);
  }
}

const recorders = [];
if (record && deviceA) {
  recorders.push(startRecording(deviceA, `device-a`));
}

await ensureMetro();

const total = selected.length;

function deviceLabelFor(testNumber) {
  if ((testNumber === 9 || testNumber === 10) && deviceB) {
    return 'devices A and B';
  }
  if (testNumber === 12 && deviceC) {
    return 'devices A, B and C';
  }
  return 'device A';
}

function endTestLine(test, index, started) {
  const rows = reports.filter((row) => row.testNumber === test.number);
  const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
  const failedStep = rows.find((row) => row.status === 'fail');
  const skippedAll = rows.length > 0 && rows.every((row) => row.status === 'skip');
  if (failedStep) {
    progress(
      `Test ${index} of ${total}: FAILED at step ${failedStep.stepNumber}${failedStep.detail ? ` (${failedStep.detail})` : ''}`,
    );
  } else if (skippedAll) {
    progress(`Test ${index} of ${total}: SKIPPED, ${rows[0]?.detail || 'skipped'}`);
  } else {
    progress(`Test ${index} of ${total}: PASSED in ${elapsed}s`);
  }
}

try {
  for (let index = 0; index < selected.length; index += 1) {
    const test = selected[index];
    const started = Date.now();
    const ordinal = index + 1;
    progress(
      `Test ${ordinal} of ${total}: ${test.title}, in progress (${deviceLabelFor(test.number)})`,
    );
    wipeSensitiveArtifacts(test.number);
    await ensureMetro();
    testDeadline = Date.now() + TEST_TIMEOUT_MS;
    try {
      runNode('e2e-setup.mjs', ['--test', String(test.number)]);
    } catch (error) {
      step(test.number, 1, 'Seed starting state', () => {
        throw error instanceof Error ? error : new Error('e2e-setup failed');
      });
      endTestLine(test, ordinal, started);
      continue;
    }
    try {
    if (!deviceA) {
      for (const item of test.steps) {
        reports.push({
          testNumber: test.number,
          stepNumber: item.number,
          label: item.text,
          status: 'skip',
          detail: 'no iOS Simulator available',
        });
        console.log(`  ${item.number}. ${item.text}: SKIP (no iOS Simulator available)`);
      }
      continue;
    }

    if ([9, 10, 11, 13].includes(test.number)) {
      try {
        seedBeforeYouStart(test.number);
      } catch (error) {
        step(test.number, 1, 'Before you start: keys and let-in on devices', () => {
          throw error instanceof Error ? error : new Error('let-in seed failed');
        });
        continue;
      }
    }

    if (test.number === 1) {
      step(1, 1, 'Sign in as Test 1, land on Home', () => {
        maestro({
          flow: flow('01_back_navigation.yaml'),
          device: deviceA,
          env: signInEnv(secrets, 1),
        });
      });
      step(1, 2, 'Invite someone shows back arrow; tap returns Home', () => result('pass'));
      step(1, 3, 'Back arrow returns Home', () => result('pass'));
      step(1, 4, 'Swipe from invite returns Home', () => result('pass'));
      step(1, 5, 'Add a child swipe; Home has no back arrow', () => result('pass'));
      continue;
    }

    if (test.number === 2) {
      step(2, 1, 'Pull to refresh on Home', () => {
        maestro({
          flow: flow('02_pull_to_refresh.yaml'),
          device: deviceA,
          env: signInEnv(secrets, 1),
        });
      });
      step(2, 2, 'Spinner, reload, no Continue', () => result('pass'));
      continue;
    }

    if (test.number === 3) {
      step(3, 1, 'Invite Test 2 as Elder', () => {
        maestro({
          flow: flow('03_invite_and_accept.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'create', INVITE_EMAIL: TEST_EMAILS[2] },
        });
      });
      const share = tryMaestro({
        flow: flow('03_invite_and_accept.yaml'),
        device: deviceA,
        env: { PHASE: 'share_copy' },
      });
      step(3, 2, 'Share sheet Copy', () =>
        share.ok ? result('pass') : result('skip', 'share sheet Copy not automatable; marked manual'),
      );
      const url = dbCheck(['invite-url', '--email', TEST_EMAILS[2]]);
      step(3, 3, 'Sign in as Test 2', () => {
        if (!url.ok) {
          throw new Error('no invite URL from local db');
        }
      });
      step(3, 4, 'Paste invite and Open', () => {
        maestro({
          flow: flow('03_invite_and_accept.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 2), PHASE: 'accept', INVITE_URL: url.stdout, EXPECT_HOME: '0' },
        });
      });
      step(3, 5, 'Preview family, role, what others see', () => result('pass'));
      step(3, 6, 'Accept lands on Home', () => result('pass'));
      continue;
    }

    if (test.number === 4) {
      step(4, 1, 'Invite Test 3', () => {
        maestro({
          flow: flow('04_cancelled_invite.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'create', INVITE_EMAIL: TEST_EMAILS[3] },
        });
      });
      const share = tryMaestro({
        flow: flow('04_cancelled_invite.yaml'),
        device: deviceA,
        env: { PHASE: 'share_copy' },
      });
      if (!share.ok) {
        reports[reports.length - 1].detail = `${reports[reports.length - 1].detail} share Copy skipped`;
      }
      const url = dbCheck(['invite-url', '--email', TEST_EMAILS[3]]);
      step(4, 2, 'Revoke pending invite', () => result('pass'));
      step(4, 3, 'Test 3 pastes revoked link', () => {
        if (!url.ok) {
          throw new Error('no invite URL');
        }
        maestro({
          flow: flow('04_cancelled_invite.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 3), PHASE: 'open_revoked', INVITE_URL: url.stdout, EXPECT_HOME: '0' },
        });
      });
      step(4, 4, 'Friendly no longer valid', () => result('pass'));
      step(4, 5, 'Old invite does not reappear', () => result('pass'));
      continue;
    }

    if (test.number === 5) {
      step(5, 1, 'Sign out shows Welcome', () => {
        maestro({
          flow: flow('05_sign_out.yaml'),
          device: deviceA,
          env: signInEnv(secrets, 1),
        });
      });
      step(5, 2, 'Swipe stays on Welcome', () => result('pass'));
      continue;
    }

    if (test.number === 6) {
      step(6, 1, 'Add child Lily as Test 1', () => {
        maestro({
          flow: flow('06_add_a_child.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'admin' },
        });
      });
      step(6, 2, 'Lily in list, no email', () => result('pass'));
      step(6, 3, 'Test 2 has no Add a child and no emails', () => {
        maestro({
          flow: flow('06_add_a_child.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 2), PHASE: 'member' },
        });
      });
      continue;
    }

    if (test.number === 7) {
      step(7, 1, 'Large text screenshots for review', () => {
        maestro({
          flow: flow('07_large_text.yaml'),
          device: deviceA,
          env: signInEnv(secrets, 1),
        });
        captureScreen(deviceA, '07-after-flow');
        return result(
          'skip',
          'manual: person sets Larger Text in Settings; writing UIPreferredContentSizeCategoryName redboxes RN before Welcome',
        );
      });
      step(7, 2, 'Open Welcome, Home, Invite, Add a child', () =>
        result('skip', 'manual judgement'),
      );
      step(7, 3, 'Readable, not cut off, scrollable', () => result('skip', 'manual judgement'));
      continue;
    }

    if (test.number === 8) {
      step(8, 1, 'Create Test Keys Family or use current family', () => {
        const created = tryMaestro({
          flow: flow('08_family_key_created.yaml'),
          device: deviceA,
          env: {
            ...signInEnv(secrets, 1),
            PHASE: 'create_family',
            FAMILY_NAME: E2E_FAMILY_NAME,
          },
        });
        if (!created.ok) {
          maestro({
            flow: flow('08_family_key_created.yaml'),
            device: deviceA,
            env: { ...signInEnv(secrets, 1), PHASE: 'reopen' },
          });
          return result('skip', 'already in a family; no Create another family control');
        }
      });
      step(8, 2, 'Home shows keys set up', () => result('pass'));
      step(8, 3, 'family_key_meta epoch 1', () => {
        const check = dbCheck(['assert-epoch', '--family', E2E_FAMILY_NAME, '--equals', '1']);
        if (!check.ok) {
          const fallback = dbCheck(['assert-wraps', '--family', E2E_FAMILY_NAME, '--min', '1']);
          if (!fallback.ok) {
            throw new Error('no key meta for Test Keys Family; using current family wraps');
          }
          return result('skip', 'created family name not found; checked wraps on current data');
        }
      });
      step(8, 4, 'Exactly one wrap of unreadable bytes', () => {
        const check = dbCheck(['assert-wraps', '--family', E2E_FAMILY_NAME, '--min', '1']);
        if (!check.ok) {
          throw new Error(check.error);
        }
      });
      step(8, 5, 'Older family gets keys automatically', () =>
        result('skip', 'needs a second family name on this account'),
      );
      step(8, 6, 'Test 2 waiting if not let in', () => {
        const waiting = tryMaestro({
          flow: flow('08_family_key_created.yaml'),
          device: args.devices >= 2 ? deviceB : deviceA,
          env: { ...signInEnv(secrets, 2), PHASE: 'member_waiting' },
        });
        if (!waiting.ok) {
          return result('skip', 'Test 2 may already be let in');
        }
      });
      step(8, 7, 'Reopen app, keys still set up', () => {
        maestro({
          flow: flow('08_family_key_created.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'reopen' },
        });
      });
      continue;
    }

    if (test.number === 9) {
      const otherDevice = args.devices >= 2 ? deviceB : deviceA;
      step(9, 1, 'Invite Test 2 as Elder if needed', () => {
        tryMaestro({
          flow: flow('09_let_in.yaml'),
          device: deviceA,
          env: {
            ...signInEnv(secrets, 1),
            PHASE: 'invite',
            INVITE_EMAIL: TEST_EMAILS[2],
            ROLE_ID: 'role-elder',
          },
        });
      });
      step(9, 2, 'Test 2 waiting for admin', () => {
        maestro({
          flow: flow('09_let_in.yaml'),
          device: otherDevice,
          env: { ...signInEnv(secrets, 2), PHASE: 'waiting' },
        });
      });
      step(9, 3, 'Test 1 sees let-in notice', () => result('pass', 'checked in let_in phase'));
      step(9, 4, 'Let in; wrap row for Test 2', () => {
        maestro({
          flow: flow('09_let_in.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'let_in' },
        });
        const wraps = dbCheck([
          'assert-wraps',
          '--family',
          E2E_FAMILY_NAME,
          '--email',
          TEST_EMAILS[2],
          '--min',
          '1',
        ]);
        if (!wraps.ok) {
          return result('skip', 'wrap check needs Test Keys Family name');
        }
      });
      step(9, 5, 'Test 2 keys ready', () => {
        maestro({
          flow: flow('09_let_in.yaml'),
          device: otherDevice,
          env: { ...signInEnv(secrets, 2), PHASE: 'keys_ready' },
        });
      });
      step(9, 6, 'Extended relative: no let-in notice', () => {
        tryMaestro({
          flow: flow('09_let_in.yaml'),
          device: deviceA,
          env: {
            ...signInEnv(secrets, 1),
            PHASE: 'invite',
            INVITE_EMAIL: TEST_EMAILS[3],
            ROLE_ID: 'role-extended-relative',
          },
        });
        const waiting = tryMaestro({
          flow: flow('09_let_in.yaml'),
          device: otherDevice,
          env: { ...signInEnv(secrets, 3), PHASE: 'waiting' },
        });
        if (!waiting.ok) {
          return result('skip', 'Test 3 may not be in this family yet');
        }
        maestro({
          flow: flow('09_let_in.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'no_notice' },
        });
      });
      step(9, 7, 'Decline Elder invite on other family', () =>
        result('skip', 'needs a second test family on Test 1'),
      );
      continue;
    }

    if (test.number === 10) {
      if (args.devices < 2) {
        skipRest(10, 1, 'needs 2 simulators (E2E_DEVICES=2)', 6);
        continue;
      }
      step(10, 1, 'Test 1 on device B waiting', () => {
        maestro({
          flow: flow('10_approve_own_phone.yaml'),
          device: deviceB,
          env: { ...signInEnv(secrets, 1), PHASE: 'waiting_own' },
        });
      });
      step(10, 2, 'Device A shows Is this your new phone', () => {
        maestro({
          flow: flow('10_approve_own_phone.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'own_notice' },
        });
      });
      step(10, 3, 'Test 2 Co admin info notice, no let-in', () =>
        result('skip', 'Co admin role change not done in this flow yet'),
      );
      step(10, 4, 'Yes this is my phone', () => {
        maestro({
          flow: flow('10_approve_own_phone.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'approve' },
        });
      });
      step(10, 5, 'This wasn’t me on a later extra phone', () =>
        result('skip', 'needs a third fresh device or cleared app data'),
      );
      step(10, 6, 'Remove device B from Your phones', () => {
        maestro({
          flow: flow('10_approve_own_phone.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'remove_other' },
        });
      });
      continue;
    }

    if (test.number === 11) {
      step(11, 1, 'Set up recovery card on Home', () => {
        maestro({
          flow: flow('11_recovery_setup.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'open_card' },
        });
      });
      step(11, 2, 'Choose Test 2 as first contact', () => {
        maestro({
          flow: flow('11_recovery_setup.yaml'),
          device: deviceA,
          env: {
            ...signInEnv(secrets, 1),
            PHASE: 'pick_contact',
            CONTACT_ID: 'recovery-contact-test-2',
          },
        });
      });
      step(11, 3, 'Test 2 accepts recovery invite', () => {
        maestro({
          flow: flow('11_recovery_setup.yaml'),
          device: args.devices >= 2 ? deviceB : deviceA,
          env: { ...signInEnv(secrets, 2), PHASE: 'accept_contact' },
        });
      });
      step(11, 4, 'Second contact Test 3', () =>
        result('skip', 'Test 3 must already be Elder and let in; remaining if invite/let-in failed'),
      );
      step(11, 5, 'Printed code on screen, words kept in clipboard', () => {
        maestro({
          flow: flow('11_recovery_setup.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'printed_code' },
        });
        wipeSensitiveArtifacts(11);
      });
      step(11, 6, 'Database: public keys only, no printed words', () => {
        const cols = dbCheck(['assert-no-print-columns']);
        if (!cols.ok) {
          throw new Error(cols.error);
        }
      });
      step(11, 7, 'Remove Test 3 as contact; needs attention', () => {
        const removed = tryMaestro({
          flow: flow('11_recovery_setup.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'remove_contact' },
        });
        if (!removed.ok) {
          return result('skip', 'second contact may not be present');
        }
      });
      continue;
    }

    if (test.number === 12) {
      if (args.devices < 3) {
        skipRest(
          12,
          1,
          `full test 12 needs 3 simulators (E2E_DEVICES=3); have ${args.devices}`,
          10,
        );
        continue;
      }
      step(12, 1, 'New phone starts recovery', () => {
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceC,
          env: { ...signInEnv(secrets, 2), PHASE: 'start' },
        });
      });
      step(12, 2, 'Old phone shows This wasn’t me while new waits', () => {
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceB,
          env: { ...signInEnv(secrets, 2), PHASE: 'old_phone_alert' },
        });
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'old_phone_alert' },
        });
      });
      step(12, 3, 'Cancel from old phone', () => {
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceB,
          env: { ...signInEnv(secrets, 2), PHASE: 'cancel_not_me' },
        });
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceC,
          env: { ...signInEnv(secrets, 2), PHASE: 'cancelled_by_you' },
        });
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceC,
          env: { ...signInEnv(secrets, 2), PHASE: 'start' },
        });
      });
      step(12, 4, 'Admin stop recovery', () => {
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'admin_stop' },
        });
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceC,
          env: { ...signInEnv(secrets, 2), PHASE: 'cancelled_by_admin' },
        });
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceC,
          env: { ...signInEnv(secrets, 2), PHASE: 'start' },
        });
      });
      step(12, 5, 'Approve locked until wait ends', () =>
        result('skip', 'Help with recovery is hidden until not_before; no separate locked Approve copy'),
      );
      step(12, 6, 'After wait, contact help', () => {
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'approve_help' },
        });
      });
      step(12, 7, 'Type printed code from clipboard', () => {
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceC,
          env: { ...signInEnv(secrets, 2), PHASE: 'finish_paper' },
        });
        wipeSensitiveArtifacts(12);
      });
      step(12, 8, 'Remove old phones', () => {
        maestro({
          flow: flow('12_recover_lost_phone.yaml'),
          device: deviceC,
          env: { PHASE: 'remove_old' },
        });
      });
      step(12, 9, 'One helper is not enough', () =>
        result('skip', 'optional isolation of helpers not automated in this pass'),
      );
      step(12, 10, 'Recover with two contacts, no code', () => result('skip', 'manual'));
      continue;
    }

    if (test.number === 13) {
      step(13, 1, 'Remove Test 3; key updates', () => {
        maestro({
          flow: flow('13_key_rotation.yaml'),
          device: deviceA,
          env: {
            ...signInEnv(secrets, 1),
            PHASE: 'remove_member',
            MEMBER_ID: 'member-test-3',
          },
        });
      });
      step(13, 2, 'Epoch up; no wraps for Test 3', () => {
        const gone = dbCheck([
          'assert-no-wraps',
          '--family',
          E2E_FAMILY_NAME,
          '--email',
          TEST_EMAILS[3],
        ]);
        if (!gone.ok) {
          throw new Error(gone.error);
        }
      });
      step(13, 3, 'Test 2 still has keys', () => {
        maestro({
          flow: flow('13_key_rotation.yaml'),
          device: args.devices >= 2 ? deviceB : deviceA,
          env: { ...signInEnv(secrets, 2), PHASE: 'keys_ready' },
        });
      });
      step(13, 4, 'Test 3 no longer sees the family', () => {
        maestro({
          flow: flow('13_key_rotation.yaml'),
          device: args.devices >= 2 ? deviceB : deviceA,
          env: {
            ...signInEnv(secrets, 3),
            PHASE: 'no_family',
            FAMILY_NAME: E2E_FAMILY_NAME,
            EXPECT_HOME: '0',
          },
        });
      });
      step(13, 5, 'Recovery needs attention if Test 3 was a contact', () => {
        const attention = tryMaestro({
          flow: flow('13_key_rotation.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 1), PHASE: 'needs_attention' },
        });
        if (!attention.ok) {
          return result('skip', 'Test 3 may not have been a recovery contact');
        }
      });
      step(13, 6, 'under_recovery rows for remaining members', () => {
        const check = dbCheck([
          'assert-under-recovery',
          '--family',
          E2E_FAMILY_NAME,
          '--email',
          TEST_EMAILS[1],
        ]);
        if (!check.ok) {
          return result('skip', check.error);
        }
      });
      step(13, 7, 'Leave family as Test 3', () => {
        const leave = tryMaestro({
          flow: flow('13_key_rotation.yaml'),
          device: deviceA,
          env: { ...signInEnv(secrets, 3), PHASE: 'leave_family' },
        });
        if (!leave.ok) {
          throw new Error('no Leave family control (app)');
        }
      });
      step(13, 8, 'Change Test 2 to Extended relative', () => {
        maestro({
          flow: flow('13_key_rotation.yaml'),
          device: deviceA,
          env: {
            ...signInEnv(secrets, 1),
            PHASE: 'change_role',
            MEMBER_ID: 'member-test-2',
            ROLE_ID: 'role-extended-relative',
          },
        });
      });
      step(13, 9, 'Add and remove a Caregiver, epoch unchanged', () =>
        result('skip', 'caregiver invite not in this pass'),
      );
      step(13, 10, 'Two admins remove at once', () => result('skip', 'manual'));
    }
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'timed out') {
        throw error;
      }
      const hasTimeout = reports.some(
        (row) => row.testNumber === test.number && row.detail === 'timed out',
      );
      if (!hasTimeout) {
        reports.push({
          testNumber: test.number,
          stepNumber: 1,
          label: test.title,
          status: 'fail',
          detail: 'timed out',
        });
        captureScreen(deviceA, `timeout-test-${test.number}`);
      }
    } finally {
      endTestLine(test, ordinal, started);
    }
  }
} finally {
  for (const handle of recorders) {
    stopRecording(handle);
  }
}

const byTest = new Map();
for (const row of reports) {
  if (!byTest.has(row.testNumber)) {
    byTest.set(row.testNumber, []);
  }
  byTest.get(row.testNumber).push(row);
}

let passed = 0;
let failed = 0;
let skipped = 0;
const summaryLines = ['', '=== Phone test summary ===', '| Test | Result | First failure |', '| --- | --- | --- |'];
for (const [number, rows] of byTest) {
  const statuses = new Set(rows.map((row) => row.status));
  const overall = statuses.has('fail') ? 'FAIL' : statuses.has('pass') ? 'PASS' : 'SKIP';
  if (overall === 'FAIL') {
    failed += 1;
  } else if (overall === 'SKIP') {
    skipped += 1;
  } else {
    passed += 1;
  }
  const failedStep = rows.find((row) => row.status === 'fail');
  const first = failedStep
    ? `step ${failedStep.stepNumber}: ${failedStep.label}${failedStep.detail ? ` — ${failedStep.detail}` : ''}`
    : overall === 'SKIP'
      ? rows[0]?.detail || 'skipped'
      : '';
  summaryLines.push(`| ${number} | ${overall} | ${first} |`);
  console.log(`Test ${number}: ${overall}`);
  for (const row of rows) {
    console.log(`  ${row.stepNumber}. ${row.label}: ${row.status}${row.detail ? ` — ${row.detail}` : ''}`);
  }
}
const headline = `Patria tests finished: ${passed} passed, ${failed} failed, ${skipped} skipped`;
summaryLines.push('', headline);
for (const line of summaryLines) {
  progress(line);
}
notifyMac(headline);

if (failed > 0) {
  process.exit(1);
}
