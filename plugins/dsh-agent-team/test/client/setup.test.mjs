import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm, symlink, realpath, access } from 'node:fs/promises';
import { join } from 'node:path';
import { setup, runSetupCommand, hostVersion } from '../../scripts/setup.mjs';
import { initializeOwnedHome } from '../../src/host/manager.mjs';
import { ownedFixture } from '../fixtures/owned.mjs';
import { writePrivate } from '../../src/host/files.mjs';
const team = '@deepseek-ai/dsh-experimental-agent-team-profile';
async function put(path, value) { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value)); }
async function installed(home, name, version) { await put(join(home, 'profiles/web/node_modules', name, 'package.json'), { name, version }); }
async function fixture(t) {
  const f = await ownedFixture(t), calls = [];
  const home = join(f.home, 'new-home'), workspace = await realpath(f.home), tarball = join(f.home, 'verified.tgz');
  await writeFile(tarball, 'synthetic archive');
  const options = { tarball, workspace, config: { ...f.config, home }, env: { PATH: process.env.PATH }, run: async (command, args, opts) => {
    calls.push({ command, args }); assert.equal(opts.env.DSH_HOME, await realpath(home));
    assert(args.includes('--ignore-scripts')); assert(args.includes('--save-exact')); assert(args.includes('--registry=https://registry.npmjs.org'));
    const name = args[5].startsWith(team) ? team : 'dsh-team-roles';
    assert.equal(args[5], name === team ? `${team}@0.2.2-alpha.3` : await realpath(tarball));
    await put(join(home, 'profiles/web/package.json'), { dsh: { profile: { bundles: [team, 'dsh-team-roles'] } } });
    await installed(home, name, name === team ? '0.2.2-alpha.3' : hostVersion);
  } };
  return { ...f, home, workspace, options, calls };
}
test('setup installs only a new owned Home and skips reinstall for a matching complete profile', async t => {
  const f = await fixture(t);
  assert.deepEqual(await setup(f.options), { reused: false }); assert.equal(f.calls.length, 2);
  const patch = join(f.home, 'profiles/web/cordis.patch.yml'); await writeFile(patch, '# personal settings');
  const marker = JSON.parse(await readFile(join(f.home, '.codex-dsh-owner.json'), 'utf8'));
  assert.equal(marker.cwd, f.workspace); assert(!('created' in marker));
  await rm(f.options.tarball);
  assert.deepEqual(await setup(f.options), { reused: true }); assert.equal(f.calls.length, 2);
  assert.equal(await readFile(patch, 'utf8'), '# personal settings');
});
test('an interrupted or failed setup is refused on repeat rather than repaired or overwritten', async t => {
  const f = await fixture(t), run = f.options.run;
  f.options.run = async (...args) => { await run(...args); throw new Error('Synthetic interrupted installation'); };
  await assert.rejects(setup(f.options), /Synthetic/);
  f.options.run = run;
  await assert.rejects(setup(f.options), { code: 'SETUP_INCOMPLETE' }); assert.equal(f.calls.length, 1);
  const fresh = await fixture(t);
  await initializeOwnedHome(fresh.home, fresh.workspace);
  await assert.rejects(setup(fresh.options), { code: 'SETUP_INCOMPLETE' }); assert.equal(fresh.calls.length, 0);
});
test('version, bundle and foreign-profile mismatches are refused without reinstall', async t => {
  for (const kind of ['team', 'host', 'stale-host', 'bundle', 'symlink']) {
    const f = await fixture(t); await setup(f.options); f.calls.length = 0;
    if (kind === 'team') await installed(f.home, team, '0.1.0');
    if (kind === 'host') await installed(f.home, 'dsh-team-roles', '0.4.0');
    if (kind === 'stale-host') await installed(f.home, 'dsh-team-roles', '0.6.0');
    if (kind === 'bundle') await put(join(f.home, 'profiles/web/package.json'), { dsh: { profile: { bundles: [team] } } });
    if (kind === 'symlink') { await rm(join(f.home, 'profiles/web'), { recursive: true }); await symlink(f.workspace, join(f.home, 'profiles/web')); }
    await assert.rejects(setup(f.options), { code: 'SETUP_INCOMPLETE' }); assert.equal(f.calls.length, 0);
  }
});
test('profile manifest symlinks stay inside the dedicated Home without changing foreign files', async t => {
  const f = await fixture(t); await setup(f.options); f.calls.length = 0;
  const manifest = join(f.home, 'profiles/web/package.json'), contents = await readFile(manifest, 'utf8');
  const foreign = `${f.home}-foreign`; await mkdir(foreign, { mode: 0o700 });
  const outside = join(foreign, 'package.json'); await writeFile(outside, contents);
  await rm(manifest); await symlink(outside, manifest);
  await assert.rejects(setup(f.options), { code: 'SETUP_INCOMPLETE' });
  assert.equal(f.calls.length, 0); assert.equal(await readFile(outside, 'utf8'), contents);
  const inside = join(f.home, 'profile-manifest.json'); await writeFile(inside, contents);
  await rm(manifest); await symlink(inside, manifest);
  assert.deepEqual(await setup(f.options), { reused: true });
  assert.equal(f.calls.length, 0); assert.equal(await readFile(inside, 'utf8'), contents);
});
test('canonical workspaces match, but a changed workspace or a file cannot become the launch directory', async t => {
  const f = await fixture(t), alias = join(f.workspace, 'alias'); await symlink(f.workspace, alias);
  await setup({ ...f.options, workspace: alias });
  assert.deepEqual(await setup(f.options), { reused: true });
  const other = join(f.workspace, 'other'); await mkdir(other);
  await assert.rejects(setup({ ...f.options, workspace: other }), { code: 'SETUP_MISMATCH' });
  const fresh = await fixture(t);
  await assert.rejects(setup({ ...fresh.options, workspace: fresh.options.tarball }), { code: 'SETUP_MISMATCH' });
  await assert.rejects(access(fresh.home), { code: 'ENOENT' });
  await assert.rejects(setup({ ...fresh.options, tarball: join(fresh.workspace, 'missing.tgz') }), { code: 'ENOENT' });
  await assert.rejects(access(fresh.home), { code: 'ENOENT' });
});
test('unowned and symlink Homes, and an incompatible runtime, are protected before installation', async t => {
  const f = await fixture(t); await mkdir(f.home, { mode: 0o700 }); await writeFile(join(f.home, 'personal'), 'untouched');
  await assert.rejects(setup(f.options), { code: 'UNOWNED_HOME' });
  assert.deepEqual(await readFile(join(f.home, 'personal'), 'utf8'), 'untouched');
  const link = join(f.workspace, 'linked-home'); await symlink(f.home, link);
  await assert.rejects(setup({ ...f.options, config: { ...f.options.config, home: link } }), { code: 'UNSAFE_STATE' });
  const invalid = join(f.workspace, 'wrong-runtime'); await put(join(invalid, 'package.json'), { name: '@deepseek-ai/dsh', version: '9.9.9' });
  await assert.rejects(setup({ ...f.options, config: { ...f.options.config, runtimeAnchor: invalid } }), { code: 'RUNTIME_MISMATCH' });
  assert.equal(f.calls.length, 0);
});
test('live or uncertain owned hosts cannot have an incomplete profile mutated', async t => {
  const f = await ownedFixture(t), tarball = join(f.home, 'verified.tgz'); await writeFile(tarball, 'synthetic');
  let ran = false;
  const options = { tarball, workspace: f.home, config: f.config, run: async () => { ran = true; } };
  await f.owner.request('health'); await assert.rejects(setup(options), { code: 'SETUP_BUSY' });
  await f.owner.shutdown();
  await writePrivate(join(f.home, '.codex-owned/starting.json'), { birthFormat: 'old' });
  await assert.rejects(setup(options), { code: 'STARTUP_UNCERTAIN' });
  await rm(join(f.home, '.codex-owned/starting.json')); assert.equal(ran, false);
});
test('concurrent Home claims cannot overwrite the winning canonical workspace', async t => {
  const f = await fixture(t), other = join(f.workspace, 'other'); await mkdir(other);
  const results = await Promise.allSettled([initializeOwnedHome(f.home, f.workspace), initializeOwnedHome(f.home, other)]);
  const claims = results.filter(r => r.status === 'fulfilled' && r.value.created);
  assert.equal(claims.length, 1);
  const marker = JSON.parse(await readFile(join(f.home, '.codex-dsh-owner.json'), 'utf8'));
  assert.equal(marker.cwd, claims[0].value.cwd);
  for (const result of results.filter(r => r.status === 'fulfilled')) assert.equal(result.value.cwd, marker.cwd);
});
test('setup subprocess errors are bounded and do not forward dependency output', async () => {
  await assert.rejects(runSetupCommand(process.execPath, ['-e', "process.stderr.write('synthetic-secret');process.exit(7)"], {}), error => error.code === 'INSTALL_FAILED' && error.message.includes('exit 7') && !error.message.includes('synthetic-secret'));
});
