/** Shared by the opt-in OS probe and no-process fixture regressions. */
import assert from 'node:assert/strict';
import * as files from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const checkIds = Object.freeze([
  'native-allowed-write', 'native-blocked-write', 'native-restricted-read',
  'protected-node-write', 'allowed-shell-write', 'background-descendant-write', 'denied-shell-write',
]);
export const pendingChecks = () => checkIds.map(id => ({ id, status: 'not-run', layer: 'not-observed' }));
export function errorRecord(error, depth = 0) {
  return { ...(error?.name ? { name: error.name } : {}), message: error?.message ?? String(error),
    ...(error?.code ? { code: error.code } : {}), ...(error?.syscall ? { syscall: error.syscall } : {}),
    ...(error?.cause && depth < 4 ? { cause: errorRecord(error.cause, depth + 1) } : {}) };
}
export const printRecord = record => process.stdout.write(JSON.stringify(record) + '\n');

/** Cleanup always runs; neither cleanup nor its reporter replaces the primary failure. */
export async function withCleanup(operation, cleanup, report = () => {}) {
  const capture = async fn => { try { return { status: 'passed', value: await fn() }; } catch (error) { return { status: 'failed', error }; } };
  const primary = await capture(operation), disposal = await capture(cleanup);
  const reporting = await capture(() => report({ status: disposal.status, ...(disposal.error ? { error: errorRecord(disposal.error) } : {}) }));
  if (primary.status === 'failed') throw primary.error;
  if (disposal.status === 'failed') throw disposal.error;
  if (reporting.status === 'failed') throw reporting.error;
  return primary.value;
}

function denialLayer(error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
    if (['EACCES', 'EPERM'].includes(current.code)) return 'os';
  }
  return error?.code === 'FS_PERMISSION_DENIED' ? 'native-application' : null;
}
async function expectDenial(operation) {
  let evidence;
  await assert.rejects(async () => operation(), error => {
    const layer = denialLayer(error);
    assert.ok(layer, `Expected a permission refusal, received ${error?.code ?? error?.name}.`);
    evidence = { layer, refusal: errorRecord(error) };
    return true;
  });
  return evidence;
}

export async function runBoundaryProbe({ ctx, fileSystem, paths, io = files, spawn = spawnSync, emit = printRecord }) {
  const checks = pendingChecks();
  let cleanup = { status: 'not-run' };
  const shell = (script, path) => spawn('/bin/sh', ['-c', script, 'probe', path], { encoding: 'utf8', timeout: 3000, maxBuffer: 8192 });
  const shellSucceeded = result => {
    assert.ifError(result.error); assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
  };
  const nativeDenied = async (method, path, ...args) => {
    let phase = 'resolve';
    const evidence = await expectDenial(async () => {
      const target = await ctx.fs.resolve(path);
      phase = method;
      return ctx.fs[method](target, ...args);
    });
    return { ...evidence, phase };
  };
  const operations = [
    async () => {
      await ctx.fs.writeText(await ctx.fs.resolve('native-file'), 'native allowed');
      assert.equal(await io.readFile(join(paths.allowed, 'native-file'), 'utf8'), 'native allowed');
      return { layer: 'native-filesystem+os' };
    },
    () => nativeDenied('writeText', join(paths.blocked, 'native-file'), 'must fail'),
    () => nativeDenied('readText', paths.denied),
    () => expectDenial(() => io.writeFile(paths.protectedFile, 'must fail')),
    async () => {
      shellSucceeded(shell('printf shell > "$1"', join(paths.allowed, 'shell')));
      assert.equal(await io.readFile(join(paths.allowed, 'shell'), 'utf8'), 'shell');
      return { layer: 'os' };
    },
    async () => {
      shellSucceeded(shell('printf background > "$1" & wait', join(paths.allowed, 'background')));
      assert.equal(await io.readFile(join(paths.allowed, 'background'), 'utf8'), 'background');
      return { layer: 'os' };
    },
    async () => {
      const result = shell('printf denied > "$1"', join(paths.blocked, 'shell'));
      assert.ifError(result.error); assert.equal(result.signal, null);
      assert.ok(Number.isInteger(result.status) && result.status > 0, 'Denied shell must exit with a failure status.');
      assert.match(result.stderr, /permission denied|operation not permitted/i);
      return { layer: 'os', statusCode: result.status, stderr: result.stderr };
    },
  ];
  try {
    await withCleanup(async () => {
      await ctx.plugin(fileSystem, { cwd: paths.allowed });
      for (let index = 0; index < checks.length; index++) {
        const check = checks[index];
        try { Object.assign(check, await operations[index](), { status: 'passed' }); }
        catch (error) { Object.assign(check, { status: 'failed', layer: 'unclassified', error: errorRecord(error) }); throw error; }
        finally { emit({ type: 'dsh-boundary-check', ...check }); }
      }
    }, () => ctx.fiber.dispose(), result => {
      cleanup = result;
      emit({ type: 'dsh-boundary-cleanup', scope: 'context', ...result });
    });
    assert.ok(checks.every(check => check.status === 'passed'));
  } catch (error) {
    emit({ type: 'dsh-boundary-probe', result: 'probe-failed', checks, cleanup, error: errorRecord(error) });
    throw error;
  }
  const report = { type: 'dsh-boundary-probe', result: 'probe-passed', checks, cleanup, webNetwork: 'not-run', userSession: 'not-run' };
  emit(report);
  return report;
}

/** A zero exit or a pass string alone never counts as a complete probe. */
export function validateProbeResult(result) {
  assert.ifError(result.error); assert.equal(result.signal, null);
  assert.equal(result.status, 0, 'Official launcher execution did not pass. Do not retry with wider permissions.');
  const reports = String(result.stdout).split('\n').flatMap(line => {
    try { const record = JSON.parse(line); return record.type === 'dsh-boundary-probe' ? [record] : []; } catch { return []; }
  });
  assert.equal(reports.length, 1, 'Expected exactly one complete probe report.');
  const [report] = reports;
  assert.equal(report.result, 'probe-passed');
  assert.deepEqual(report.checks.map(check => check.id), checkIds);
  assert.ok(report.checks.every(check => check.status === 'passed'), 'Every boundary check must actually pass.');
  assert.equal(report.cleanup.status, 'passed');
  return report;
}
