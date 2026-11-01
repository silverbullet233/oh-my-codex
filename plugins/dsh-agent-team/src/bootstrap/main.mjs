/** A private staged installer around setup.mjs; publication never replaces an existing installation. */
import { mkdir, mkdtemp, lstat, open, readdir, realpath, rename, readFile, writeFile, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, delimiter, join, resolve, isAbsolute } from 'node:path';
import { constants } from 'node:fs';
import { setup } from '../../scripts/setup.mjs';
import { OwnedHost } from '../host/manager.mjs';
import { readPrivate, writePrivate, withLifecycleLock } from '../host/files.mjs';
import { loadRuntime } from '../native/runtime.mjs';
import { ClientError } from '../native/errors.mjs';
import { defaultRoot, installedPaths, owner, pins, privateExistingDirectory, verifyRecord } from './config.mjs';
import { run } from './process.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const asset = `dsh-team-roles-${pins.host}.tgz`;
const release = `https://github.com/silverbullet233/dsh-team-roles/releases/download/v${pins.host}`;
export function requireNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!(major > 24 || (major === 24 && minor >= 9))) throw new ClientError('NODE_REQUIRED', 'Use Node.js >=24.9.0 with npm on PATH, then rerun this entry using that Node executable. Bootstrap does not install or change Node.');
}
export async function download(url, maximum) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: 'follow' });
    if (!response.ok || Number(response.headers.get('content-length')) > maximum) throw new Error();
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maximum) { await response.body.cancel().catch(() => {}); throw new Error(); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch { throw new ClientError('DOWNLOAD_FAILED', `Could not download the bounded pinned release asset ${new URL(url).pathname.split('/').at(-1)}. Check network access and retry; no latest/source fallback is used.`); }
}
async function claim(root, workspace) {
  await mkdir(dirname(root), { recursive: true, mode: 0o700 });
  try { await mkdir(root, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await privateExistingDirectory(root);
  const marker = join(root, 'bootstrap-owner.json');
  let record = await readPrivate(marker);
  if (!record) {
    const entries = await readdir(root);
    if (entries.length) {
      // A concurrent first caller may have published its marker after our read.
      record = await readPrivate(marker);
      if (!record) throw new ClientError('UNOWNED_BOOTSTRAP', 'Use a new empty private bootstrap root; existing directories are never adopted or overwritten.');
    } else {
      const next = { version: 1, owner, pins, workspace };
      try {
        const temporaryMarker = join(dirname(root), `.bootstrap-owner-${randomUUID()}.tmp`);
        try {
          const file = await open(temporaryMarker, 'wx', 0o600);
          try { await file.writeFile(JSON.stringify(next)); await file.sync(); } finally { await file.close(); }
          // Atomic exclusive publication: no reader can observe half a JSON marker.
          await link(temporaryMarker, marker);
          record = next;
        } finally { await unlink(temporaryMarker).catch(() => {}); }
      } catch (error) { if (error.code !== 'EEXIST') throw error; record = await readPrivate(marker); }
    }
  }
  verifyRecord(record, workspace);
}
async function exists(path) { try { return await lstat(path); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; } }
async function packageAt(path, name, version, boundary) {
  const actual = await realpath(path);
  if (!actual.startsWith(`${boundary}/`)) throw new ClientError('UNSAFE_STATE', 'An installed package resolves outside the private installation.');
  const pkg = JSON.parse(await readFile(join(actual, 'package.json'), 'utf8'));
  if (pkg.name !== name || pkg.version !== version) throw new ClientError('BOOTSTRAP_MISMATCH', `Expected exact ${name}@${version}; existing packages were not changed.`);
}
export async function verifyInstallation(directory, workspace) {
  await privateExistingDirectory(directory);
  verifyRecord(await readPrivate(join(directory, 'bootstrap.json')), workspace);
  const home = join(directory, 'home'); await privateExistingDirectory(home);
  const marker = await readPrivate(join(home, '.codex-dsh-owner.json'));
  if (marker?.owner !== 'oh-my-codex/dsh-agent-team' || marker.version !== 1 || marker.cwd !== workspace) throw new ClientError('BOOTSTRAP_MISMATCH', 'The dedicated DSH Home ownership or workspace changed; bootstrap will not overwrite it.');
  const boundary = await realpath(directory);
  await packageAt(join(directory, 'runtime/node_modules/@deepseek-ai/dsh'), '@deepseek-ai/dsh', pins.runtime, boundary);
  await packageAt(join(home, 'profiles/web/node_modules/@deepseek-ai/dsh-experimental-agent-team-profile'), '@deepseek-ai/dsh-experimental-agent-team-profile', pins.teamProfile, boundary);
  await packageAt(join(home, 'profiles/web/node_modules/dsh-team-roles'), 'dsh-team-roles', pins.host, boundary);
}
export async function health(config) {
  const client = new OwnedHost(config);
  try {
    const value = await client.request('health');
    return { ok: value.ok, api: value.api, runtime: value.runtime, owned: value.owned, diagnostics: value.diagnostics };
  } finally { await client.close(); }
}
/** Dependencies are injectable in isolated tests, never controlled through CLI/environment. */
export async function bootstrap({ workspace, root, env = process.env, progress = () => {} }, dependencies = {}) {
  requireNode();
  root ??= defaultRoot(env);
  if (!workspace || !isAbsolute(workspace) || !isAbsolute(root)) throw new ClientError('USAGE', 'Use absolute paths: node scripts/bootstrap.mjs /absolute/authorized/workspace [--root /absolute/new-private-bootstrap-root]');
  if (['DSH_AGENT_TEAM_HOME', 'DSH_AGENT_TEAM_RUNTIME', 'DSH_HOME'].some(key => env[key])) throw new ClientError('ENVIRONMENT_CONFLICT', 'Existing DSH_HOME/DSH_AGENT_TEAM_HOME/DSH_AGENT_TEAM_RUNTIME settings conflict with bootstrap. Keep the manual installation or rerun in a clean process without those variables; no existing home/runtime is adopted.');
  const io = { run, download, digest, loadRuntime, setup, verifyInstallation, health, ...dependencies };
  workspace = await realpath(workspace);
  if (!(await lstat(workspace)).isDirectory()) throw new ClientError('USAGE', 'The authorized workspace must be an existing directory.');
  root = resolve(root);
  if (root === defaultRoot(env) && await exists(resolve(root, '../host'))) throw new ClientError('ENVIRONMENT_CONFLICT', 'An earlier manual default DSH Home exists. Keep that configuration or choose --root with a new private directory and explicit MCP environment; bootstrap will not switch or migrate it.');
  await claim(root, workspace); root = await realpath(root);
  let attempt;
  return withLifecycleLock(root, 1000, async () => {
    // Recheck immutable ownership after waiting for any other installer.
    verifyRecord(await readPrivate(join(root, 'bootstrap-owner.json')), workspace);
    const directory = join(root, 'installation');
    const reused = Boolean(await exists(directory));
    if (!reused) {
      progress('Checking npm and downloading the pinned, checksum-verified host');
      // A fresh attempt after failure avoids writing into an unknown surviving package-manager child.
      const stage = attempt = await mkdtemp(join(root, '.attempt-'));
      const userHome = join(stage, 'user-home'); await mkdir(userHome, { mode: 0o700 });
      const temporary = join(stage, 'tmp'); await mkdir(temporary, { mode: 0o700 });
      const npmrc = join(stage, 'npmrc'), globalrc = join(stage, 'global-npmrc');
      await writeFile(npmrc, '', { mode: 0o600 }); await writeFile(globalrc, '', { mode: 0o600 });
      const installEnv = { PATH: `${dirname(process.execPath)}${delimiter}${env.PATH ?? ''}`, HOME: userHome, TMPDIR: temporary, LANG: 'en_US.UTF-8', npm_config_registry: 'https://registry.npmjs.org', npm_config_userconfig: npmrc, npm_config_globalconfig: globalrc, npm_config_cache: join(stage, 'npm-cache'), npm_config_fetch_retries: '1', npm_config_fetch_timeout: '45000', npm_config_ignore_scripts: 'true' };
      await io.run('npm', ['--version'], { cwd: stage, env: installEnv });
      const sums = (await io.download(`${release}/SHA256SUMS`, 16384)).toString('utf8');
      const lines = sums.trim().split(/\r?\n/).map(line => line.match(/^([a-fA-F0-9]{64}) [ *](.+)$/));
      const selected = lines.filter(line => line?.[2] === asset);
      if (selected.length !== 1 || selected[0][1].toLowerCase() !== pins.sha256) throw new ClientError('INTEGRITY_FAILED', 'Pinned host SHA256SUMS is missing, duplicated or differs from the reviewed digest; installation was not attempted.');
      const bytes = await io.download(`${release}/${asset}`, 16 * 1024 * 1024);
      if (io.digest(bytes) !== pins.sha256) throw new ClientError('INTEGRITY_FAILED', 'Pinned host archive SHA-256 verification failed; installation was not attempted.');
      // Keep the archive at a stable path: the native profile records its local file spec.
      const archive = join(root, asset);
      const prior = await exists(archive);
      if (prior) {
        const file = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          if (!(await file.stat()).isFile() || io.digest(await file.readFile()) !== pins.sha256) throw new ClientError('INTEGRITY_FAILED', 'Existing cached host archive differs; it was not replaced.');
        } finally { await file.close(); }
      } else {
        const temporaryArchive = join(stage, asset);
        const file = await open(temporaryArchive, 'wx', 0o600);
        try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
        await rename(temporaryArchive, archive);
      }
      progress(`Installing private @deepseek-ai/dsh@${pins.runtime}`);
      const runtimeDirectory = join(stage, 'runtime');
      await mkdir(runtimeDirectory, { mode: 0o700 });
      await io.run('npm', ['install', '--prefix', runtimeDirectory, `@deepseek-ai/dsh@${pins.runtime}`, '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], { cwd: stage, env: installEnv });
      const runtimeAnchor = join(runtimeDirectory, 'node_modules/@deepseek-ai/dsh');
      const runtime = await io.loadRuntime(runtimeAnchor);
      progress('Initializing the dedicated Web/Team profile through setup.mjs');
      await io.setup({ tarball: archive, workspace, config: { home: join(stage, 'home'), runtimeAnchor }, runtime, env: installEnv, run: io.run });
      await writePrivate(join(stage, 'bootstrap.json'), { version: 1, owner, pins, workspace });
      await io.verifyInstallation(stage, workspace);
      // Only complete installation trees become visible. Failed stages are never auto-deleted.
      if (await exists(directory)) throw new ClientError('BOOTSTRAP_MISMATCH', 'An installation appeared during preparation; it was not replaced.');
      await rename(stage, directory);
      attempt = undefined;
    }
    await io.verifyInstallation(directory, workspace);
    const config = installedPaths(root);
    await io.loadRuntime(config.runtimeAnchor);
    progress('Checking the owned native host (no Team or inference is created)');
    const checked = await io.health(config);
    return { ok: true, reused, root, workspace, pins, environment: { DSH_AGENT_TEAM_HOME: config.home, DSH_AGENT_TEAM_RUNTIME: config.runtimeAnchor }, health: checked };
  }).catch(error => { error.bootstrapRoot = root; if (attempt) error.attempt = attempt; throw error; });
}
