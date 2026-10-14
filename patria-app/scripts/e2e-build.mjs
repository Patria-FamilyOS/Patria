import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_ROOT,
  assertLocalSupabaseUrl,
  loadLocalFiles,
  supabaseUrlFromEnv,
} from './e2e-lib.mjs';

const SCRIPT = 'e2e:build';
const envPath = join(APP_ROOT, '.env.e2e.local');

if (!existsSync(envPath)) {
  console.error(`${SCRIPT}: missing .env.e2e.local. Run npm run e2e:setup first.`);
  process.exit(1);
}

const { e2eEnv } = loadLocalFiles();
assertLocalSupabaseUrl(supabaseUrlFromEnv(e2eEnv), SCRIPT);

if (e2eEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY && /service_role/i.test(e2eEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY)) {
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
      ...e2eEnv,
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
