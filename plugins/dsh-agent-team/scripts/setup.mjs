/** Initialize a new dedicated home using the exact supported CLI and a verified host tarball. */
import { initializeOwnedHome, configuration, OwnedHost } from '../src/host/manager.mjs';
import { loadRuntime } from '../src/native/runtime.mjs';
import { run as runCommand } from '../src/bootstrap/process.mjs';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ClientError } from '../src/native/errors.mjs';
export async function setup({ tarball, workspace, config = configuration(), env = process.env, runtime, run = runCommand }) {
  runtime ??= await loadRuntime(config.runtimeAnchor);
  const file = await realpath(tarball);
  workspace = await realpath(workspace);
  const marker = await initializeOwnedHome(config.home, workspace);
  if (marker.cwd !== workspace) throw new ClientError('BOOTSTRAP_MISMATCH', 'The owned home has a different launch workspace; it was not changed.');
  const host = new OwnedHost({ ...config, profile: 'web', startupTimeoutMs: 20000 });
  host.runtime = runtime;
  await host.locked(async () => {
    if (await host.current() || await host.pendingStart()) throw new ClientError('SETUP_BUSY', 'The dedicated host is running or uncertain. Stop it through the owned lifecycle before changing its profile.');
    for (const spec of ['@deepseek-ai/dsh-experimental-agent-team-profile@0.2.2-alpha.2', file]) {
      await run(process.execPath, [runtime.cli, 'plugin', '--profile', 'web', 'add', spec, '--ignore-scripts', '--save-exact', '--registry=https://registry.npmjs.org'], { cwd: workspace, env: { ...env, DSH_HOME: config.home } });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [tarball, workspace = process.cwd()] = process.argv.slice(2);
  if (!tarball) throw new Error('Usage: node scripts/setup.mjs /absolute/dsh-team-roles-0.5.0.tgz /absolute/workspace');
  await setup({ tarball, workspace });
  console.log('Dedicated native Web profile installed. Health starts it lazily; configure roles and provider authentication in native Web.');
}
