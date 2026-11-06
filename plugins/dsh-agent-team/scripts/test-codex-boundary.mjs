/** Opt-in real launcher check. Synthetic policy/data, no sockets, provider keys,
 * host startup or process-attribution calls. This is NOT a user-session test.
 * Usage: node scripts/test-codex-boundary.mjs /absolute/codex /absolute/host/repo
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readPermissionContext } from '../src/host/permissions.mjs';
import { hostInvocation } from '../src/host/launch.mjs';

const [executable, hostRepo] = process.argv.slice(2);
assert(isAbsolute(executable ?? '') && isAbsolute(hostRepo ?? ''), 'Supply absolute Codex executable and host repository paths.');
const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-real-boundary-')));
try {
  for (const name of ['allowed', 'blocked', 'codex-home', 'home', 'temp']) await mkdir(join(root, name));
  const allowed = join(root, 'allowed'), protectedFile = join(allowed, 'protected'), denied = join(allowed, 'private');
  await writeFile(protectedFile, 'synthetic protected'); await writeFile(denied, 'synthetic private');
  const require = createRequire(join(hostRepo, 'package.json'));
  const cli = join(root, 'probe.mjs');
  // This probe runs as the bootstrap's host, inside the exact launcher boundary.
  // Native FileSystem operations use the actual pinned DSH implementation.
  await writeFile(cli, `
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Context } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)};
import LocalFileSystem from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/dsh-fs-local')).href)};
const ctx = new Context();
await ctx.plugin(LocalFileSystem, { cwd: ${JSON.stringify(allowed)} });
try {
  await ctx.fs.writeText(await ctx.fs.resolve('native-file'), 'native allowed');
  await assert.rejects(ctx.fs.writeText(await ctx.fs.resolve(${JSON.stringify(join(root, 'blocked', 'native-file'))}), 'must fail'));
  await assert.rejects(ctx.fs.readText(await ctx.fs.resolve(${JSON.stringify(denied)})));
  await assert.rejects(writeFile(${JSON.stringify(protectedFile)}, 'must fail'));
  const shell = spawnSync('/bin/sh', ['-c', 'printf shell > "$1"', 'probe', ${JSON.stringify(join(allowed, 'shell'))}], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr);
  const background = spawnSync('/bin/sh', ['-c', 'printf background > "$1" & wait', 'probe', ${JSON.stringify(join(allowed, 'background'))}], { encoding: 'utf8' });
  assert.equal(background.status, 0, background.stderr);
  assert.equal(await readFile(${JSON.stringify(join(allowed, 'background'))}, 'utf8'), 'background');
  const deniedChild = spawnSync('/bin/sh', ['-c', 'printf denied > "$1"', 'probe', ${JSON.stringify(join(root, 'blocked', 'shell'))}], { encoding: 'utf8' });
  assert.notEqual(deniedChild.status, 0);
  console.log(JSON.stringify({ result: 'boundary-passed', nativeFile: true, denyRead: true, protectedWrite: true, shell: true, backgroundDescendant: true, webNetwork: 'not-exercised', userSession: false }));
} finally { await ctx.dispose(); }
`);
  const pathEntry = (path, access) => ({ path: { type: 'path', path }, access });
  const state = { permissionProfile: { type: 'managed', file_system: { type: 'restricted', entries: [
    { path: { type: 'special', value: { kind: 'root' } }, access: 'read' },
    pathEntry(allowed, 'write'), pathEntry(protectedFile, 'read'), pathEntry(denied, 'deny'),
  ] }, network: 'restricted' }, sandboxCwd: pathToFileURL(root).href, codexLinuxSandboxExe: null, useLegacyLandlock: false, useMxc: false, futureField: { survives: true } };
  const context = await readPermissionContext({}, Date.now(), { 'codex/sandbox-state': state, 'codex/sandbox-launcher': { codexExecutable: executable } });
  const invocation = hostInvocation({ sandbox: context.sandbox, cli, profile: 'web', home: join(root, 'home'), instanceId: 'synthetic-boundary', permissionBinding: context.bindingHash, permissionExecution: context.execution });
  const result = spawnSync(invocation.executable, invocation.argv, { cwd: root, env: { PATH: process.env.PATH, HOME: join(root, 'home'), CODEX_HOME: join(root, 'codex-home'), TMPDIR: join(root, 'temp') }, encoding: 'utf8', timeout: 20000, maxBuffer: 65536 });
  process.stdout.write(JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.code, stdout: result.stdout, stderr: result.stderr }) + '\n');
  assert.equal(result.status, 0, 'Official launcher execution did not pass. Do not retry with wider permissions.');
  assert.match(result.stdout, /"result":"boundary-passed"/);
  assert.equal(await readFile(protectedFile, 'utf8'), 'synthetic protected');
} finally { await rm(root, { recursive: true, force: true }); }
