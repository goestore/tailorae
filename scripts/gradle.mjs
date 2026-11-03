// Runs the API's Gradle wrapper from the repo root on any OS:
//   node scripts/gradle.mjs bootRun   →  api/gradlew bootRun   (gradlew.bat on Windows)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'api');
const args = process.argv.slice(2);

// A .bat file needs cmd.exe; it is named by its full path because some Windows
// setups do not look in the current folder for commands.
const child =
  process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/c', join(apiDir, 'gradlew.bat'), ...args], { cwd: apiDir, stdio: 'inherit' })
    : spawn(join(apiDir, 'gradlew'), args, { cwd: apiDir, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
