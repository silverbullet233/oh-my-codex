/** Initialize only an empty dedicated home; complete matching installs are read-only reuses. */
import { initializeOwnedHome, configuration, OwnedHost } from '../src/host/manager.mjs';
import { loadRuntime, version } from '../src/native/runtime.mjs';
import { readPrivate } from '../src/host/files.mjs';
import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ClientError } from '../src/native/errors.mjs';
const team = '@deepseek-ai/dsh-experimental-agent-team-profile';
export const runSetupCommand = (command, args, options) => new Promise((resolve_, reject) => {
  execFile(command, args, { ...options, encoding: 'utf8', timeout: 180000, maxBuffer: 256 * 1024, windowsHide: true }, error => {
    if (error) reject(new ClientError('INSTALL_FAILED', `Profile installation failed (${error.killed ? 'timeout/output limit' : Number.isInteger(error.code) ? `exit ${error.code}` : 'could not execute'}). Inspect the dedicated Home; do not retry over partial or uncertain state.`));
    else resolve_();
  });
});
async function verifyInstalled(home) {
  try {
    const web = await realpath(join(home, 'profiles/web'));
    if (!web.startsWith(`${home}/`)) throw new Error();
    const manifest = JSON.parse(await readFile(join(web, 'package.json'), 'utf8'));
    for (const [name, expected] of [[team, version], ['dsh-team-roles', '0.5.0']]) {
      const path = await realpath(join(web, 'node_modules', name, 'package.json'));
      if (!path.startsWith(`${home}/`)) throw new Error();
      const pkg = JSON.parse(await readFile(path, 'utf8'));
      if (pkg.name !== name || pkg.version !== expected || !manifest.dsh?.profile?.bundles?.includes(name)) throw new Error();
    }
  } catch { throw new ClientError('SETUP_INCOMPLETE', 'Existing Web/Team installation is partial, incompatible or outside this Home. Nothing was overwritten; inspect it or choose a new empty dedicated Home.'); }
}
export async function setup({ tarball, workspace, config = configuration(), env = process.env, run = runSetupCommand }) {
  const runtime = await loadRuntime(config.runtimeAnchor);
  workspace = await realpath(workspace);
  if (!(await lstat(workspace)).isDirectory()) throw new ClientError('SETUP_MISMATCH', 'The launch workspace must be an existing directory.');
  let file;
  if (!await readPrivate(join(config.home, '.codex-dsh-owner.json'))) file = await realpath(tarball);
  const marker = await initializeOwnedHome(config.home, workspace);
  if (marker.cwd !== workspace) throw new ClientError('SETUP_MISMATCH', 'The owned Home has a different launch workspace; it was not changed.');
  const host = new OwnedHost({ ...config, profile: 'web', startupTimeoutMs: 20000 });
  host.runtime = runtime;
  return host.locked(async () => {
    const home = host.config.home;
    let profiles;
    try { profiles = await lstat(join(home, 'profiles')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (profiles) { await verifyInstalled(home); return { reused: true }; }
    if (await host.current() || await host.pendingStart()) throw new ClientError('SETUP_BUSY', 'The dedicated host is running or uncertain. Refusing profile mutation; inspect its owned lifecycle first.');
    if (!marker.created) throw new ClientError('SETUP_INCOMPLETE', 'This owned Home has no complete installation. Do not reinstall over a failed or interrupted setup; inspect it or use a new empty dedicated Home.');
    file ??= await realpath(tarball);
    for (const spec of [`${team}@${version}`, file]) {
      await run(process.execPath, [runtime.cli, 'plugin', '--profile', 'web', 'add', spec, '--ignore-scripts', '--save-exact', '--registry=https://registry.npmjs.org'], { cwd: workspace, env: { ...env, DSH_HOME: home } });
    }
    await verifyInstalled(home);
    return { reused: false };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [tarball, workspace = process.cwd()] = process.argv.slice(2);
    if (!tarball) throw new ClientError('USAGE', 'Usage: node scripts/setup.mjs /absolute/verified-dsh-team-roles-0.5.0.tgz /absolute/workspace');
    const result = await setup({ tarball, workspace });
    console.log(result.reused ? 'Matching dedicated profile retained; verify connectivity with MCP health.' : 'Dedicated profile installed; verify connectivity with MCP health.');
  } catch (error) {
    console.error(JSON.stringify({ code: error.code ?? 'SETUP_FAILED', message: error instanceof ClientError ? error.message : 'Setup could not complete safely. Inspect the dedicated Home; no automatic recovery or cleanup was performed.' }));
    process.exitCode = 1;
  }
}
