/** Nonsecret, plugin-owned bootstrap state; no Codex configuration is written. */
import { homedir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { readPrivate } from '../host/files.mjs';
import { ClientError } from '../native/errors.mjs';
export const pins = Object.freeze({ runtime: '0.2.2-alpha.2', teamProfile: '0.2.2-alpha.2', host: '0.5.0', sha256: 'e9f89b9e93e0c236005d3ad60c78ade3a548ba38f4b9b881bb9fb6378b5f5d61' });
export const owner = 'oh-my-codex/dsh-agent-team/bootstrap';
export const defaultRoot = (env = process.env) => resolve(env.CODEX_HOME ?? join(homedir(), '.codex'), 'dsh-agent-team/bootstrap');
export const installedPaths = root => ({ home: join(root, 'installation/home'), runtimeAnchor: join(root, 'installation/runtime/node_modules/@deepseek-ai/dsh'), profile: 'web', startupTimeoutMs: 20000 });
export function verifyRecord(record, workspace) {
  if (record?.owner !== owner || record.version !== 1 || Object.keys(record.pins ?? {}).length !== Object.keys(pins).length || Object.entries(pins).some(([key, value]) => record.pins?.[key] !== value) || typeof record.workspace !== 'string' || !isAbsolute(record.workspace) || (workspace && record.workspace !== workspace)) {
    throw new ClientError('BOOTSTRAP_MISMATCH', 'Bootstrap ownership, pinned versions or launch workspace differ. Use a new empty bootstrap root; existing data was not replaced.');
  }
}
export async function privateExistingDirectory(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new ClientError('UNSAFE_STATE', 'Bootstrap directories must be private, current-UID directories without symlinks.');
}
export async function discoverBootstrap(env = process.env) {
  // Explicit legacy/manual configurations keep their original meaning and precedence.
  if (env.DSH_AGENT_TEAM_HOME || env.DSH_AGENT_TEAM_RUNTIME) return null;
  const root = defaultRoot(env);
  const record = await readPrivate(join(root, 'installation/bootstrap.json'));
  if (!record) return null;
  await privateExistingDirectory(root);
  await privateExistingDirectory(join(root, 'installation'));
  verifyRecord(record);
  verifyRecord(await readPrivate(join(root, 'bootstrap-owner.json')), record.workspace);
  const config = installedPaths(root);
  await privateExistingDirectory(config.home);
  const runtime = await realpath(config.runtimeAnchor);
  if (!runtime.startsWith(`${await realpath(join(root, 'installation'))}/`)) throw new ClientError('UNSAFE_STATE', 'Bootstrap runtime resolves outside its installation.');
  return config;
}
