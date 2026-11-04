// Runs the API and the website in production mode on this machine — the fast way
// to use the site locally. Build first: `npm run build`.
//
//   API  → java -jar apps/api/build/libs/tailorae-api.jar   (full JIT, http://localhost:8081)
//   Web  → next start in apps/web                          (http://localhost:3000)
//
// Development mode (`npm run dev`) compiles each page on first visit and ships
// unminified JavaScript; this does neither. Code changes need a rebuild.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps', 'api');
const webDir = join(root, 'apps', 'web');
const jar = join(apiDir, 'build', 'libs', 'tailorae-api.jar');
const exe = process.platform === 'win32' ? 'java.exe' : 'java';

if (!existsSync(jar) || !existsSync(join(webDir, '.next', 'BUILD_ID'))) {
  console.error('Build first: npm run build');
  process.exit(1);
}

/** The API needs Java 21: JAVA_HOME or PATH if that is 21+, else the JDK Gradle downloaded. */
function java21() {
  const candidates = [process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin', exe), 'java'];
  const gradleJdks = join(homedir(), '.gradle', 'jdks');
  if (existsSync(gradleJdks)) {
    for (const dir of readdirSync(gradleJdks)) {
      if (/21/.test(dir) && !dir.endsWith('.lock') && !dir.endsWith('.zip')) candidates.push(join(gradleJdks, dir, 'bin', exe));
    }
  }
  for (const candidate of candidates.filter(Boolean)) {
    const out = spawnSync(candidate, ['-version'], { encoding: 'utf8' });
    const version = Number((out.stderr || '').match(/version "(\d+)/)?.[1] ?? 0);
    if (version >= 21) return candidate;
  }
  console.error('Java 21 not found. Install it (https://adoptium.net) or run `npm run dev:api` once so Gradle downloads it.');
  process.exit(1);
}

const children = [];
function run(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' && command === 'npx' });
  const tag = (line) => line && console.log(`[${name}] ${line}`);
  child.stdout.on('data', (d) => d.toString().split(/\r?\n/).forEach(tag));
  child.stderr.on('data', (d) => d.toString().split(/\r?\n/).forEach(tag));
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    children.forEach((c) => c !== child && c.kill());
    process.exit(code ?? 1);
  });
  children.push(child);
}

// The API reads apps/api/.env from its working directory.
run('api', java21(), ['-XX:+UseG1GC', '-jar', jar], apiDir);
run('web', 'npx', ['next', 'start', '-p', process.env.WEB_PORT ?? '3000'], webDir);

process.on('SIGINT', () => children.forEach((c) => c.kill()));
