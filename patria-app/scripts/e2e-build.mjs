import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_BUNDLE_ID,
  APP_ROOT,
  appContainerPath,
  appInstalled,
  assertEnvFilesNotInAppImportGraph,
  assertLocalSupabaseUrl,
  bootDevices,
  e2eDeviceCount,
  installApp,
  loadLocalFiles,
  publicExpoEnv,
  sleepMs,
  supabaseUrlFromEnv,
} from './e2e-lib.mjs';

const SCRIPT = 'e2e:build';
const envPath = join(APP_ROOT, '.env.e2e.local');

if (!existsSync(envPath)) {
  console.error(`${SCRIPT}: missing .env.e2e.local. Run npm run e2e:setup first.`);
  process.exit(1);
}

assertEnvFilesNotInAppImportGraph(SCRIPT);

const { e2eEnv } = loadLocalFiles();
const publicEnv = publicExpoEnv(e2eEnv);
assertLocalSupabaseUrl(supabaseUrlFromEnv(publicEnv), SCRIPT);

if (publicEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY && /service_role/i.test(publicEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY)) {
  console.error(`${SCRIPT}: refused to build. The app env must not contain a service role key.`);
  process.exit(1);
}

let deviceCount;
try {
  deviceCount = e2eDeviceCount();
} catch (error) {
  console.error(`${SCRIPT}: ${error instanceof Error ? error.message : 'invalid E2E_DEVICES'}`);
  process.exit(1);
}

let devices;
try {
  devices = bootDevices(deviceCount);
} catch (error) {
  console.error(`${SCRIPT}: ${error instanceof Error ? error.message : 'could not boot simulators'}`);
  process.exit(1);
}

for (const udid of devices) {
  try {
    execFileSync('xcrun', ['simctl', 'uninstall', udid, APP_BUNDLE_ID], { stdio: 'ignore' });
  } catch {
    // Not installed yet.
  }
}

const extra = process.argv.slice(2);
const alreadyHasDevice = extra.some((arg, index) => arg === '--device' || extra[index - 1] === '--device');
const expoArgs = alreadyHasDevice ? extra : ['--device', devices[0], ...extra];

const child = spawn('npx', ['expo', 'run:ios', ...expoArgs], {
  cwd: APP_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...publicEnv,
    EXPO_PUBLIC_E2E: '1',
    EXPO_NO_DOTENV: '1',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});

const first = devices[0];
const started = Date.now();
const timeoutMs = 20 * 60 * 1000;
while (!appInstalled(first)) {
  if (Date.now() - started > timeoutMs) {
    console.error(
      `${SCRIPT}: timed out waiting for ${APP_BUNDLE_ID} on the first simulator after expo run:ios.`,
    );
    child.kill('SIGTERM');
    process.exit(1);
  }
  if (child.exitCode != null) {
    process.exit(child.exitCode || 1);
  }
  sleepMs(2000);
}

const appPath = appContainerPath(first);
for (const udid of devices.slice(1)) {
  console.log(`${SCRIPT}: installing ${APP_BUNDLE_ID} on ${udid}`);
  installApp(udid, appPath);
  if (!appInstalled(udid)) {
    console.error(`${SCRIPT}: install reported success but ${APP_BUNDLE_ID} is missing on ${udid}.`);
    child.kill('SIGTERM');
    process.exit(1);
  }
}

console.log(
  `${SCRIPT}: ${APP_BUNDLE_ID} is installed on ${devices.length} simulator(s). Leave Metro running in this terminal.`,
);
