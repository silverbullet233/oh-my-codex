import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { checkIds, runBoundaryProbe, validateProbeResult, withCleanup } from '../../scripts/codex-boundary-probe.mjs';

const paths = { allowed: '/synthetic/allowed', blocked: '/synthetic/blocked', denied: '/synthetic/allowed/private', protectedFile: '/synthetic/allowed/protected' };
const failure = (code = 'EPERM') => Object.assign(new Error(`synthetic ${code}`), { code });
function fixture({ resolvePath, synchronous = false, failAt, disposeError, pluginError } = {}) {
  const records = [], calls = [], content = new Map();
  let disposed = 0;
  const defect = failure('EIO');
  const deny = id => { if (failAt === id) throw defect; throw failure(); };
  const ctx = {
    plugin: async () => { if (pluginError) throw pluginError; },
    fiber: { dispose: async () => { disposed++; if (disposeError) throw disposeError; } },
    fs: {
      resolve(path) {
        calls.push(['resolve', path]);
        if (path === resolvePath) { if (synchronous) throw failure(); return Promise.reject(failure()); }
        return path === 'native-file' ? `${paths.allowed}/native-file` : path;
      },
      async writeText(path, value) {
        calls.push(['writeText', path]);
        if (path.startsWith(paths.blocked)) deny('native-blocked-write');
        if (failAt === 'native-allowed-write') throw defect;
        content.set(path, value);
      },
      async readText(path) { calls.push(['readText', path]); deny('native-restricted-read'); },
    },
  };
  const io = {
    async writeFile() { deny('protected-node-write'); },
    async readFile(path) { return content.get(path); },
  };
  const spawn = (_bin, args) => {
    const path = args.at(-1), background = args[1].includes('& wait');
    const id = path.startsWith(paths.blocked) ? 'denied-shell-write' : background ? 'background-descendant-write' : 'allowed-shell-write';
    calls.push(['shell', id]);
    if (id === 'denied-shell-write') return { status: failAt === id ? 0 : 2, signal: null, stderr: 'synthetic: Permission denied' };
    content.set(path, background ? 'background' : 'shell');
    return { status: failAt === id ? 1 : 0, signal: null, stderr: 'synthetic shell' };
  };
  return { ctx, records, calls, defect, disposed: () => disposed,
    run: () => runBoundaryProbe({ ctx, fileSystem: 'fixture-only', paths, io, spawn, emit: record => records.push(structuredClone(record)) }) };
}
const launcher = report => ({ status: 0, signal: null, stdout: JSON.stringify(report) + '\n' });

test('fixture completes all checks, disposes with the pinned lifecycle API and validates the report', async () => {
  const f = fixture(), report = await f.run();
  assert.equal(f.disposed(), 1);
  assert.deepEqual(report.checks.map(check => check.status), checkIds.map(() => 'passed'));
  assert.deepEqual(validateProbeResult(launcher(report)), report);
  assert.equal(f.records.at(-2).type, 'dsh-boundary-cleanup');
  assert.equal(f.records.at(-1).result, 'probe-passed');
});

for (const method of ['readText', 'writeText']) for (const synchronous of [false, true]) {
  test(`expected ${method} denial includes ${synchronous ? 'synchronous' : 'async'} resolve refusal`, async () => {
    const path = method === 'readText' ? paths.denied : `${paths.blocked}/native-file`;
    const f = fixture({ resolvePath: path, synchronous }), report = await f.run();
    const check = report.checks.find(check => check.id === (method === 'readText' ? 'native-restricted-read' : 'native-blocked-write'));
    assert.equal(check.status, 'passed'); assert.equal(check.phase, 'resolve'); assert.equal(check.layer, 'os');
    assert.ok(!f.calls.some(([name, target]) => name === method && target === path));
    assert.equal(f.disposed(), 1);
  });
}

test('native denial keeps OS cause evidence distinct from an application refusal', async () => {
  for (const withCause of [false, true]) {
    const f = fixture();
    f.ctx.fs.readText = async () => { throw Object.assign(new Error('synthetic native refusal', withCause ? { cause: failure('EACCES') } : {}), { code: 'FS_PERMISSION_DENIED' }); };
    const report = await f.run(), check = report.checks[2];
    assert.equal(check.phase, 'readText');
    assert.equal(check.layer, withCause ? 'os' : 'native-application');
    assert.equal(check.refusal.cause?.code, withCause ? 'EACCES' : undefined);
  }
});

for (const id of checkIds) test(`failure of ${id} leaves subsequent checks not-run and emits no pass`, async () => {
  const f = fixture({ failAt: id });
  await assert.rejects(f.run());
  const report = f.records.at(-1), index = checkIds.indexOf(id);
  assert.equal(report.result, 'probe-failed'); assert.equal(report.checks[index].status, 'failed');
  assert.ok(report.checks.slice(0, index).every(check => check.status === 'passed'));
  assert.ok(report.checks.slice(index + 1).every(check => check.status === 'not-run'));
  assert.equal(f.disposed(), 1);
  assert.ok(!f.records.some(record => record.result === 'probe-passed'));
});

test('cleanup failure preserves the primary error and remains visible in the final failure report', async () => {
  const cleanupError = new Error('synthetic cleanup defect');
  const f = fixture({ failAt: 'native-allowed-write', disposeError: cleanupError });
  await assert.rejects(f.run(), error => error === f.defect);
  assert.equal(f.records.at(-1).cleanup.status, 'failed');
  assert.equal(f.records.at(-1).cleanup.error.message, cleanupError.message);
  const cleanFailure = fixture({ disposeError: cleanupError });
  await assert.rejects(cleanFailure.run(), error => error === cleanupError);
  assert.equal(cleanFailure.records.at(-1).result, 'probe-failed');
});

test('plugin initialization failure still disposes and leaves every boundary check not-run', async () => {
  const primary = new Error('synthetic plugin defect'), f = fixture({ pluginError: primary });
  await assert.rejects(f.run(), error => error === primary);
  assert.equal(f.disposed(), 1);
  assert.ok(f.records.at(-1).checks.every(check => check.status === 'not-run'));
});

test('fulfillment and unrelated I/O errors cannot satisfy an expected read refusal', async () => {
  for (const readText of [async () => 'unexpected read', async () => { throw failure('ENOENT'); }]) {
    const f = fixture(); f.ctx.fs.readText = readText;
    await assert.rejects(f.run());
    assert.equal(f.records.at(-1).checks[2].status, 'failed');
  }
});

test('missing, failed, unexecuted, duplicate or incomplete reports and launcher failures cannot pass', async () => {
  const valid = await fixture().run();
  const variants = [report => { report.checks.pop(); }, report => { report.checks[1].status = 'not-run'; },
    report => { report.checks[1].status = 'failed'; }, report => { report.checks[1].id = report.checks[0].id; },
    report => { report.cleanup.status = 'failed'; }, report => { report.result = 'probe-failed'; }];
  for (const alter of variants) { const report = structuredClone(valid); alter(report); assert.throws(() => validateProbeResult(launcher(report))); }
  for (const result of [ { ...launcher(valid), status: 1 }, { ...launcher(valid), signal: 'SIGTERM' },
    { ...launcher(valid), error: failure('ETIMEDOUT') }, { ...launcher(valid), stdout: '' },
    { ...launcher(valid), stdout: 'boundary-passed' }, { ...launcher(valid), stdout: JSON.stringify(valid) + '\n' + JSON.stringify(valid) } ]) {
    assert.throws(() => validateProbeResult(result));
  }
});

test('the pinned Cordis context really releases effects on the failure path', async () => {
  const ctx = new Context(); let released = false;
  ctx.effect(() => () => { released = true; });
  const primary = new Error('synthetic primary');
  await assert.rejects(withCleanup(() => { throw primary; }, () => ctx.fiber.dispose()), error => error === primary);
  assert.equal(released, true);
});

test('outer cleanup and reporting errors do not mask the primary or produce success', async () => {
  const primary = new Error('primary'), cleanup = new Error('cleanup'), reporting = new Error('report');
  let removed = false, cleanupResult;
  await assert.rejects(withCleanup(() => { throw primary; }, () => { removed = true; throw cleanup; }, result => { cleanupResult = result; throw reporting; }), error => error === primary);
  assert.equal(removed, true); assert.equal(cleanupResult.error.message, 'cleanup');
  await assert.rejects(withCleanup(() => 'checks passed', () => { throw cleanup; }), error => error === cleanup);
});
