import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = join(APP_ROOT, '..');
export const PHONE_TESTS = join(REPO_ROOT, 'docs', 'testing', 'PHONE_TESTS.md');
export const MAESTRO_DIR = join(APP_ROOT, '.maestro');

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadLocalFiles() {
  const e2eEnv = parseEnvFile(join(APP_ROOT, '.env.e2e.local'));
  const secrets = parseEnvFile(join(APP_ROOT, '.e2e-secrets'));
  return { e2eEnv, secrets };
}

export function supabaseUrlFromEnv(env) {
  return env.EXPO_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? '';
}

export function assertLocalSupabaseUrl(url, scriptName) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(
      `${scriptName} refused to run: missing or invalid Supabase URL. Use local Docker only (http://127.0.0.1:54321).`,
    );
    process.exit(1);
  }
  if (!LOCAL_HOSTS.has(host)) {
    console.error(
      `${scriptName} refused to run: Supabase URL host is "${host}", not 127.0.0.1 or localhost. This script only talks to local Docker.`,
    );
    process.exit(1);
  }
}

export const TEST_EMAILS = {
  1: 'femipaul7535+test1@gmail.com',
  2: 'femipaul7535+test2@gmail.com',
  3: 'femipaul7535+test3@gmail.com',
};

export function passwordFor(secrets, n) {
  return secrets[`E2E_PASSWORD_TEST${n}`] ?? '';
}

export function redact(value) {
  if (!value) {
    return '';
  }
  if (value.length < 8) {
    return '(redacted)';
  }
  return `${value.slice(0, 4)}…`;
}

export function supabaseStatusEnv() {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    cwd: APP_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (raw.startsWith('{')) {
    return JSON.parse(raw);
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }
    env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  return env;
}

export function findSupabaseDbContainer() {
  const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  })
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
  return names.find((name) => /supabase_db/i.test(name)) ?? '';
}

export function runLocalSql(dbUrl, statement, tuplesOnly = false) {
  const psqlArgs = ['-v', 'ON_ERROR_STOP=1'];
  if (tuplesOnly) {
    psqlArgs.push('-At');
  }
  psqlArgs.push('-c', statement);
  try {
    return execFileSync('psql', [dbUrl, ...psqlArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }
  const container = findSupabaseDbContainer();
  if (!container) {
    throw new Error('psql is not on PATH and no supabase_db Docker container is running.');
  }
  return execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', ...psqlArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

export function ensureJavaHome() {
  if (process.env.JAVA_HOME) {
    return;
  }
  try {
    process.env.JAVA_HOME = execFileSync('/usr/libexec/java_home', {
      encoding: 'utf8',
    }).trim();
  } catch {
    // Maestro will fail with a clear Java error if nothing is installed.
  }
}

export function parsePhoneTests(markdown) {
  const tests = [];
  const heading = /^### (\d+)\.\s+(.+)$/gm;
  let match = heading.exec(markdown);
  while (match) {
    const number = Number(match[1]);
    const title = match[2].trim();
    const start = match.index + match[0].length;
    const next = heading.exec(markdown);
    const body = markdown.slice(start, next ? next.index : markdown.length);
    const steps = [];
    const stepRe = /^(\d+)\.\s+(.+)$/gm;
    let stepMatch = stepRe.exec(body);
    while (stepMatch) {
      steps.push({
        number: Number(stepMatch[1]),
        text: stepMatch[2].trim(),
        manual: /\(manual\)/i.test(stepMatch[2]),
      });
      stepMatch = stepRe.exec(body);
    }
    tests.push({
      number,
      title,
      manual: /\(manual\)/i.test(title),
      steps,
    });
    match = next;
  }
  return tests;
}
