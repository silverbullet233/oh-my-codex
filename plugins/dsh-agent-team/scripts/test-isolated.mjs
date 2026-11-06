/** Explicit no-socket/no-process-identity gate. The normal test command still contains live fixtures. */
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
function run(args) { const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status ?? 1); }
const selected = ['links', 'orchestration', 'output', 'permissions', 'permission-admission', 'sandbox-handoff', 'codex-boundary-probe', 'web-url-memory'].map(name => `test/client/${name}.test.mjs`);
for (const directory of ['test/mcp', 'test/package']) selected.push(...(await readdir(resolve(root, directory))).filter(name => name.endsWith('.test.mjs') && name !== 'stdio.test.mjs').map(name => `${directory}/${name}`));
console.log('Isolated client gate uses signed synthetic contexts and in-memory Web queries. Socket, lifecycle, process-identity and browser fixtures are excluded.');
run(['--test', '--test-skip-pattern=^summary works through pinned native transport', ...selected]);
run(['--test', '--test-name-pattern=authenticated entry validation|managed root validation', 'test/client/web-url.test.mjs']);
run(['--test', '--test-name-pattern=^cancelled lifecycle requests', 'test/client/lifecycle.test.mjs']);
