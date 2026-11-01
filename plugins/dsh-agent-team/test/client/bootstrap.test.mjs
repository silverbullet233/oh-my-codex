import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bootstrap, requireNode, verifyInstallation, download } from '../../src/bootstrap/main.mjs';
import { defaultRoot, discoverBootstrap, installedPaths, pins } from '../../src/bootstrap/config.mjs';
import { setup } from '../../scripts/setup.mjs';
import { ownedFixture } from '../fixtures/owned.mjs';
import { loadRuntime } from '../../src/native/runtime.mjs';
import { run } from '../../src/bootstrap/process.mjs';
import { readPrivate, writePrivate } from '../../src/host/files.mjs';
const profile = '@deepseek-ai/dsh-experimental-agent-team-profile';
const fakeArchive = Buffer.from('synthetic tarball; no network or model calls');
async function putPackage(path, name, version) {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'package.json'), JSON.stringify({ name, version }));
}
async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh bootstrap space $-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = join(directory, 'authorized workspace'); await mkdir(workspace);
  const env = { PATH: process.env.PATH, CODEX_HOME: join(directory, 'codex'), SECRET_PROVIDER_KEY: 'synthetic-must-not-propagate', npm_config_registry: 'https://invalid.example', npm_config_userconfig: '/personal/npmrc' };
  const root = defaultRoot(env), calls = [], events = [];
  const options = { workspace, root, env };
  let fail, healthFailure = false;
  const io = {
    digest: bytes => bytes.equals(fakeArchive) ? pins.sha256 : 'corrupt',
    download: async url => { calls.push(['download', url]); return url.endsWith('SHA256SUMS') ? Buffer.from(`${pins.sha256}  dsh-team-roles-${pins.host}.tgz\n`) : fakeArchive; },
    run: async (command, args, opts) => {
      calls.push(['run', command, args, opts]);
      assert(!('SECRET_PROVIDER_KEY' in opts.env));
      assert(!('DSH_AGENT_TEAM_RUNTIME' in opts.env));
      assert.equal(opts.env.npm_config_registry, 'https://registry.npmjs.org');
      assert(!opts.env.npm_config_userconfig.includes('personal'));
      if (args.includes('--version')) return;
      if (args[0] === 'install') {
        if (fail === 'runtime') throw new Error('Synthetic interrupted runtime install');
        assert(args.includes(`@deepseek-ai/dsh@${pins.runtime}`));
        assert(args.includes('--ignore-scripts')); assert(args.includes('--save-exact'));
        await putPackage(join(args[2], 'node_modules/@deepseek-ai/dsh'), '@deepseek-ai/dsh', pins.runtime);
        events.push('runtime');
      } else {
        assert.equal(command, process.execPath);
        const spec = args[5];
        assert(args.includes('--ignore-scripts'));
        const home = opts.env.DSH_HOME;
        if (spec.startsWith(profile)) { await putPackage(join(home, `profiles/web/node_modules/${profile}`), profile, pins.teamProfile); events.push('team-profile'); }
        else {
          if (fail === 'host') throw new Error('Synthetic host install interruption');
          assert.equal(spec, join(root, `dsh-team-roles-${pins.host}.tgz`));
          await putPackage(join(home, 'profiles/web/node_modules/dsh-team-roles'), 'dsh-team-roles', pins.host);
          events.push('host');
        }
      }
    },
    loadRuntime: async anchor => ({ anchor: join(anchor, 'package.json'), cli: join(anchor, 'lib/bin.js') }),
    health: async config => { calls.push(['health', config]); if (healthFailure) throw new Error('Synthetic startup failure'); return { ok: true, owned: true }; },
  };
  return { directory, root, env, workspace, options, io, calls, events, fail: value => { fail = value; }, healthFailure: value => { healthFailure = value; } };
}
test('first install uses exact pins, reuses setup and discovers its default private configuration', async t => {
  const f = await fixture(t);
  const result = await bootstrap({ ...f.options, root: undefined }, f.io);
  assert.equal(result.ok, true); assert.equal(result.reused, false);
  assert.deepEqual(f.events, ['runtime', 'team-profile', 'host']);
  await verifyInstallation(join(f.root, 'installation'), f.workspace);
  const config = await discoverBootstrap(f.env);
  assert.deepEqual(config, installedPaths(f.root));
  const marker = await readPrivate(join(config.home, '.codex-dsh-owner.json'));
  assert.equal(marker.cwd, f.workspace);
  assert.equal((await stat(f.root)).mode & 0o777, 0o700);
  const files = await readdir(f.root); assert(files.includes('installation'));
  assert(!JSON.stringify(result).includes('synthetic-must-not-propagate'));
  assert(f.calls.filter(c => c[0] === 'download').every(c => c[1].includes('/v0.5.0/')));
});
test('repeat runs are offline, skip all installs and preserve personal profile edits', async t => {
  const f = await fixture(t);
  await bootstrap(f.options, f.io);
  const personal = join(f.root, 'installation/home/profiles/web/cordis.patch.yml');
  await writeFile(personal, '# user-owned settings remain intact\n');
  f.calls.length = 0;
  const result = await bootstrap(f.options, f.io);
  assert.equal(result.reused, true);
  assert.deepEqual(f.calls.map(c => c[0]), ['health']);
  assert.equal(await readFile(personal, 'utf8'), '# user-owned settings remain intact\n');
});
for (const step of ['runtime', 'host']) test(`a partial ${step} install recovers using a fresh isolated attempt`, async t => {
  const f = await fixture(t); f.fail(step);
  await assert.rejects(bootstrap(f.options, f.io), /Synthetic/);
  assert.equal(await discoverBootstrap(f.env), null);
  const abandoned = (await readdir(f.root)).filter(name => name.startsWith('.attempt-'));
  assert.equal(abandoned.length, 1);
  f.fail(null);
  assert.equal((await bootstrap(f.options, f.io)).ok, true);
  assert((await readdir(f.root)).includes(abandoned[0]), 'Do not delete files still writable by uncertain children');
});
test('a health failure retains a complete installation and reruns only health', async t => {
  const f = await fixture(t); f.healthFailure(true);
  await assert.rejects(bootstrap(f.options, f.io), /Synthetic startup/);
  f.calls.length = 0; f.healthFailure(false);
  assert.equal((await bootstrap(f.options, f.io)).reused, true);
  assert.deepEqual(f.calls.map(c => c[0]), ['health']);
});
test('corrupt and changed checksum manifests refuse all package installation', async t => {
  for (const fault of ['digest', 'sum', 'duplicate', 'missing']) {
    const f = await fixture(t);
    if (fault === 'digest') delete f.io.digest; // production SHA-256 rejects synthetic bytes
    else f.io.download = async () => Buffer.from(fault === 'sum' ? `${'0'.repeat(64)}  dsh-team-roles-0.5.0.tgz` : fault === 'missing' ? 'not a checksum' : `${pins.sha256}  dsh-team-roles-0.5.0.tgz\n${pins.sha256}  dsh-team-roles-0.5.0.tgz`);
    await assert.rejects(bootstrap(f.options, f.io), { code: 'INTEGRITY_FAILED' });
    assert.equal(f.events.length, 0);
    assert.equal(await discoverBootstrap(f.env), null);
  }
});
test('unowned/nonprivate/symlink roots are never adopted or modified', async t => {
  for (const kind of ['unowned', 'public', 'symlink']) {
    const f = await fixture(t);
    await mkdir(join(f.env.CODEX_HOME, 'dsh-agent-team'), { recursive: true });
    const path = kind === 'symlink' ? join(f.directory, 'foreign') : f.root;
    await mkdir(path, { mode: kind === 'public' ? 0o755 : 0o700 });
    await writeFile(join(path, 'personal.json'), 'untouched');
    if (kind === 'symlink') await symlink(path, f.root);
    await assert.rejects(bootstrap(f.options, f.io), { code: kind === 'unowned' ? 'UNOWNED_BOOTSTRAP' : 'UNSAFE_STATE' });
    assert.deepEqual(await readdir(path), ['personal.json']);
    assert.equal(f.calls.length, 0);
  }
});
test('version, workspace and owned-home mismatches refuse without reinstalling', async t => {
  for (const kind of ['runtime', 'host', 'team', 'workspace', 'owner', 'pins', 'symlink']) {
    const f = await fixture(t); await bootstrap(f.options, f.io); f.calls.length = 0;
    const installation = join(f.root, 'installation');
    if (kind === 'runtime') await putPackage(join(installation, 'runtime/node_modules/@deepseek-ai/dsh'), '@deepseek-ai/dsh', '9.9.9');
    if (kind === 'host') await putPackage(join(installation, 'home/profiles/web/node_modules/dsh-team-roles'), 'dsh-team-roles', '0.4.0');
    if (kind === 'team') await putPackage(join(installation, `home/profiles/web/node_modules/${profile}`), profile, '0.1.0');
    if (kind === 'workspace') { const elsewhere = join(f.directory, 'other'); await mkdir(elsewhere); f.options.workspace = elsewhere; }
    if (kind === 'owner') await writePrivate(join(installation, 'home/.codex-dsh-owner.json'), { version: 1, owner: 'personal', cwd: f.workspace });
    if (kind === 'pins') { const record = await readPrivate(join(installation, 'bootstrap.json')); record.pins.host = '9.9.9'; await writePrivate(join(installation, 'bootstrap.json'), record); }
    if (kind === 'symlink') { await rm(join(installation, 'home'), { recursive: true }); await symlink(f.workspace, join(installation, 'home')); }
    await assert.rejects(bootstrap(f.options, f.io), { code: kind === 'symlink' ? 'UNSAFE_STATE' : 'BOOTSTRAP_MISMATCH' });
    assert.equal(f.calls.length, 0);
  }
});
test('manual environment configuration retains precedence and bootstrap refuses to adopt it', async t => {
  const f = await fixture(t); await bootstrap(f.options, f.io); f.calls.length = 0;
  for (const key of ['DSH_HOME', 'DSH_AGENT_TEAM_HOME', 'DSH_AGENT_TEAM_RUNTIME']) {
    const env = { ...f.env, [key]: '/personal/profile' };
    await assert.rejects(bootstrap({ ...f.options, env }, f.io), { code: 'ENVIRONMENT_CONFLICT' });
    if (key !== 'DSH_HOME') assert.equal(await discoverBootstrap(env), null);
  }
  assert.equal(f.calls.length, 0);
});
test('concurrent callers serialize installation and the second only verifies/health checks', async t => {
  const f = await fixture(t);
  // Establish root ownership first to avoid testing scheduling of the initial marker write.
  f.fail('runtime'); await assert.rejects(bootstrap(f.options, f.io)); f.fail(null); f.events.length = 0;
  const original = f.io.run;
  f.io.run = async (...args) => { if (args[1][0] === 'install') await new Promise(resolve => setTimeout(resolve, 50)); return original(...args); };
  const results = await Promise.all([bootstrap(f.options, f.io), bootstrap(f.options, f.io)]);
  assert.equal(results.filter(r => !r.reused).length, 1);
  assert.equal(results.filter(r => r.reused).length, 1);
  assert.deepEqual(f.events, ['runtime', 'team-profile', 'host']);
});
test('an existing incomplete installation directory is refused and never replaced', async t => {
  const f = await fixture(t); f.fail('runtime'); await assert.rejects(bootstrap(f.options, f.io));
  await mkdir(join(f.root, 'installation'), { mode: 0o700 });
  await writeFile(join(f.root, 'installation/personal.txt'), 'preserved'); f.calls.length = 0;
  await assert.rejects(bootstrap(f.options, f.io), { code: 'BOOTSTRAP_MISMATCH' });
  assert.equal(await readFile(join(f.root, 'installation/personal.txt'), 'utf8'), 'preserved'); assert.equal(f.calls.length, 0);
});
test('Node prerequisite, CLI usage and relative paths fail before initialization', async t => {
  const f = await fixture(t);
  for (const version of ['20.19.0', '22.20.0', '24.8.9']) assert.throws(() => requireNode(version), { code: 'NODE_REQUIRED' });
  for (const version of ['24.9.0', '24.10.0', '26.0.0']) requireNode(version);
  await assert.rejects(bootstrap({ ...f.options, root: 'relative-root' }, f.io), { code: 'USAGE' });
  const entry = resolve(import.meta.dirname, '../../scripts/bootstrap.mjs');
  const help = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert(help.stdout.includes('--root'));
  const invalid = spawnSync(process.execPath, [entry, f.workspace, '--latest'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert(invalid.stderr.includes('USAGE'));
  assert.equal(f.calls.length, 0);
});


test('an earlier manual default home is preserved without silently switching discovery', async t => {
  const f = await fixture(t);
  const prior = resolve(f.root, '../host'); await mkdir(prior, { recursive: true, mode: 0o700 });
  await writeFile(join(prior, 'personal.json'), 'manual-home');
  await assert.rejects(bootstrap(f.options, f.io), { code: 'ENVIRONMENT_CONFLICT' });
  assert.deepEqual(await readdir(prior), ['personal.json']); assert.equal(f.calls.length, 0);
});
test('simultaneous first callers publish one complete root marker and one installation', async t => {
  const f = await fixture(t);
  const results = await Promise.all([bootstrap(f.options, f.io), bootstrap(f.options, f.io)]);
  assert.equal(results.filter(r => !r.reused).length, 1);
  assert.deepEqual(f.events, ['runtime', 'team-profile', 'host']);
});
test('corrupt cached archives and foreign package symlinks are refused without overwrite', async t => {
  const f = await fixture(t); f.fail('runtime'); await assert.rejects(bootstrap(f.options, f.io));
  const archive = join(f.root, 'dsh-team-roles-0.5.0.tgz'); await writeFile(archive, 'corrupt');
  await assert.rejects(bootstrap(f.options, f.io), { code: 'INTEGRITY_FAILED' });
  assert.equal(await readFile(archive, 'utf8'), 'corrupt');
  await writeFile(archive, fakeArchive); f.fail(null); await bootstrap(f.options, f.io);
  const packagePath = join(f.root, 'installation/runtime/node_modules/@deepseek-ai/dsh');
  await rm(packagePath, { recursive: true }); await symlink(f.workspace, packagePath); f.calls.length = 0;
  await assert.rejects(bootstrap(f.options, f.io), { code: 'UNSAFE_STATE' }); assert.equal(f.calls.length, 0);
});


test('an interrupted release download recovers without any partial cached publication', async t => {
  const f = await fixture(t), original = f.io.download;
  f.io.download = async () => { throw Object.assign(new Error('Synthetic network failure'), { code: 'DOWNLOAD_FAILED' }); };
  await assert.rejects(bootstrap(f.options, f.io), error => error.code === 'DOWNLOAD_FAILED' && error.attempt.startsWith(f.root));
  assert(!(await readdir(f.root)).includes('dsh-team-roles-0.5.0.tgz'));
  f.io.download = original;
  assert.equal((await bootstrap(f.options, f.io)).ok, true);
});
test('release fetch rejects HTTP failures, advertised and streamed oversize bodies', async t => {
  for (const response of [new Response('missing', { status: 404 }), new Response('small', { headers: { 'content-length': '999' } }), new Response('x'.repeat(100))]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(download('https://example.invalid/pinned', 50), { code: 'DOWNLOAD_FAILED' });
    mock.mock.restore();
  }
});


test('setup refuses a live owned host before running any package manager', async t => {
  const f = await ownedFixture(t);
  await f.owner.request('health');
  const tarball = join(f.home, 'synthetic.tgz'); await writeFile(tarball, 'not installed');
  let installed = false;
  await assert.rejects(setup({ tarball, workspace: f.home, config: f.config, runtime: await loadRuntime(f.runtime), run: async () => { installed = true; } }), { code: 'SETUP_BUSY' });
  assert.equal(installed, false);
});
test('subprocess failures have bounded errors without forwarding dependency output', async () => {
  await assert.rejects(run('npm', ['--version'], { env: { PATH: '/nonexistent-dsh-bootstrap-test' } }), { code: 'NPM_REQUIRED' });
  await assert.rejects(run(process.execPath, ['-e', "process.stderr.write('synthetic-secret-output');process.exit(7)"], {}), error => error.code === 'INSTALL_FAILED' && error.message.includes('exit 7') && !error.message.includes('synthetic-secret-output'));
});
