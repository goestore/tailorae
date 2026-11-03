/**
 * Regenerates `src/lib/api/schema.d.ts` from the running API's OpenAPI document.
 *
 *   npm run api:types                       # http://localhost:8081/v3/api-docs
 *   API_DOCS_URL=https://…/v3/api-docs npm run api:types
 *
 * A node script rather than `${API_DOCS_URL:-…}` in package.json, so the
 * default works in cmd.exe and PowerShell as well as a POSIX shell.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.API_DOCS_URL || 'http://localhost:8081/v3/api-docs';
const output = path.join('src', 'lib', 'api', 'schema.d.ts');

const cli = path.join(root, 'node_modules', 'openapi-typescript', 'bin', 'cli.js');

const result = spawnSync(process.execPath, [cli, source, '-o', output], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
