import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_ROOT,
  assertEnvFilesNotInAppImportGraph,
  assertLocalSupabaseUrl,
  loadLocalFiles,
  publicExpoEnv,
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

const extra = process.argv.slice(2);
const child = spawn(
  'npx',
  ['expo', 'run:ios', ...extra],
  {
    cwd: APP_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...publicEnv,
      EXPO_NO_DOTENV: '1',
    },
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
