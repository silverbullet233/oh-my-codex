/** Opt-in real launcher check. Synthetic policy/data, no sockets, provider keys,
 * host startup or process-attribution calls. This is NOT a user-session test.
 * Usage: node scripts/test-codex-boundary.mjs /absolute/codex /absolute/host/repo
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readPermissionContext } from '../src/host/permissions.mjs';
import { hostInvocation } from '../src/host/launch.mjs';
import { pendingChecks, errorRecord, printRecord, withCleanup, validateProbeResult } from './codex-boundary-probe.mjs';

export async function main([executable, hostRepo] = process.argv.slice(2)) {
  assert(isAbsolute(executable ?? '') && isAbsolute(hostRepo ?? ''), 'Supply absolute Codex executable and host repository paths.');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-real-boundary-'));
  let report = { checks: pendingChecks(), cleanup: { status: 'not-run' } }, cleanup = { status: 'not-run' };
  try {
    await withCleanup(async () => {
      const root = await realpath(temporaryRoot);
      for (const name of ['allowed', 'blocked', 'codex-home', 'home', 'temp']) await mkdir(join(root, name));
      const allowed = join(root, 'allowed'), protectedFile = join(allowed, 'protected'), denied = join(allowed, 'private');
      await writeFile(protectedFile, 'synthetic protected'); await writeFile(denied, 'synthetic private');
      const require = createRequire(join(hostRepo, 'package.json'));
      const cli = join(root, 'probe.mjs');
      // Actual pinned DSH FileSystem, inside the exact production launcher/bootstrap.
      await writeFile(cli, `
import { Context } from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)};
import LocalFileSystem from ${JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/dsh-fs-local')).href)};
import { runBoundaryProbe } from ${JSON.stringify(new URL('./codex-boundary-probe.mjs', import.meta.url).href)};
await runBoundaryProbe({ ctx: new Context(), fileSystem: LocalFileSystem, paths: ${JSON.stringify({ allowed, blocked: join(root, 'blocked'), protectedFile, denied })} });
`);
      const pathEntry = (path, access) => ({ path: { type: 'path', path }, access });
      const state = { permissionProfile: { type: 'managed', file_system: { type: 'restricted', entries: [
        { path: { type: 'special', value: { kind: 'root' } }, access: 'read' },
        pathEntry(allowed, 'write'), pathEntry(protectedFile, 'read'), pathEntry(denied, 'deny'),
      ] }, network: 'enabled' }, sandboxCwd: pathToFileURL(root).href, codexLinuxSandboxExe: null, useLegacyLandlock: false, useMxc: false, futureField: { survives: true } };
      const context = await readPermissionContext({}, Date.now(), { 'codex/sandbox-state': state, 'codex/sandbox-launcher': { codexExecutable: executable } });
      const invocation = hostInvocation({ sandbox: context.sandbox, cli, profile: 'web', home: join(root, 'home'), instanceId: 'synthetic-boundary', permissionBinding: context.bindingHash, permissionExecution: context.execution });
      printRecord({ type: 'dsh-boundary-start', root, state, executable, timeout: 20000 });
      const result = spawnSync(invocation.executable, invocation.argv, { cwd: root, env: { PATH: process.env.PATH, HOME: join(root, 'home'), CODEX_HOME: join(root, 'codex-home'), TMPDIR: join(root, 'temp') }, encoding: 'utf8', timeout: 20000, maxBuffer: 65536 });
      printRecord({ type: 'dsh-boundary-launcher', status: result.status, signal: result.signal, error: result.error && errorRecord(result.error), stdout: result.stdout, stderr: result.stderr });
      // Retain partial check results even when validation must reject the launcher.
      for (const line of String(result.stdout).split('\n')) {
        try { const record = JSON.parse(line); if (record.type === 'dsh-boundary-probe') report = record; } catch {}
      }
      report = validateProbeResult(result);
      assert.equal(await readFile(protectedFile, 'utf8'), 'synthetic protected');
      assert.equal(await readFile(denied, 'utf8'), 'synthetic private');
      for (const name of ['native-file', 'shell']) await assert.rejects(lstat(join(root, 'blocked', name)), { code: 'ENOENT' });
      printRecord({ type: 'dsh-boundary-integrity', status: 'passed', layer: 'outer-fixture-verification' });
    }, async () => {
      await rm(temporaryRoot, { recursive: true, force: true });
      await assert.rejects(lstat(temporaryRoot), { code: 'ENOENT' });
    }, result => { cleanup = result; printRecord({ type: 'dsh-boundary-cleanup', scope: 'temporary-root', root: temporaryRoot, ...result }); });
  } catch (error) {
    printRecord({ result: 'boundary-failed', checks: report.checks, contextCleanup: report.cleanup, cleanup, error: errorRecord(error) });
    throw error;
  }
  printRecord({ result: 'boundary-passed', checks: report.checks, contextCleanup: report.cleanup, cleanup, webNetwork: 'not-run', userSession: 'not-run', wholeHost: 'not-run' });
}
if (import.meta.main) await main();
