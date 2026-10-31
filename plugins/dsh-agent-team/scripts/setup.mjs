/** Initialize a new dedicated home; use the exact supported CLI and a real host tarball. */
import { initializeOwnedHome, configuration } from '../src/host/manager.mjs';
import { loadRuntime } from '../src/native/runtime.mjs';
import { spawnSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
const [tarball, workspace = process.cwd()] = process.argv.slice(2);
if (!tarball) throw new Error('Usage: node scripts/setup.mjs /absolute/dsh-team-roles-0.5.0.tgz /absolute/workspace');
const config = configuration(); const runtime = await loadRuntime(config.runtimeAnchor);
const file = await realpath(tarball);
await initializeOwnedHome(config.home, workspace);
for (const spec of ['@deepseek-ai/dsh-experimental-agent-team-profile@0.2.2-alpha.2', file]) {
  const result = spawnSync(process.execPath, [runtime.cli, 'plugin', '--profile', 'web', 'add', spec, '--ignore-scripts'], { cwd: workspace, env: { ...process.env, DSH_HOME: config.home }, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Dedicated native Web profile installed. Health starts it lazily; configure roles and provider authentication in native Web.');
