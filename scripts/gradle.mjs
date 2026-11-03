// Runs the API's Gradle wrapper from the repo root on any OS:
//   node scripts/gradle.mjs bootRun   →  api/gradlew bootRun   (gradlew.bat on Windows)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'api');
const isWindows = process.platform === 'win32';
const wrapper = isWindows ? 'gradlew.bat' : './gradlew';

const child = spawn(wrapper, process.argv.slice(2), { cwd: apiDir, stdio: 'inherit', shell: isWindows });
child.on('exit', (code) => process.exit(code ?? 1));
