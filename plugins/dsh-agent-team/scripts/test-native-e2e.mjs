/** Bounded cross-repository gate using the real official CLI and ordinary Web profile. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, realpath, access, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { OwnedHost, initializeOwnedHome } from '../src/host/manager.mjs';
import { loadRuntime } from '../src/native/runtime.mjs';
import { delay, readPrivate, birth } from '../src/host/files.mjs';
const [runtimePath, hostTarball, ...flags] = process.argv.slice(2);
if (!runtimePath || !hostTarball) throw new Error('Usage: node scripts/test-native-e2e.mjs <official-runtime-directory> <actual-host-tarball> [--open] [--keep]');
const root = await realpath(await mkdtemp('/tmp/dsh-owned-native-e2e-'));
const home = join(root, 'home'), workspace = join(home, 'fixture');
await mkdir(home, { mode: 0o700 });
await initializeOwnedHome(home, root); await mkdir(workspace);
// Launch directory is the synthetic workspace, and becomes the native default allowlist.
await writeFile(join(home, '.codex-dsh-owner.json'), JSON.stringify({ version: 1, owner: 'oh-my-codex/dsh-agent-team', cwd: workspace }), { mode: 0o600 });
const runtime = await loadRuntime(runtimePath);
const env = { PATH: process.env.PATH, LANG: 'en_US.UTF-8', DSH_HOME: home };
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(`Isolated setup failed (${result.status}): ${result.stderr.slice(-3000)}`);
  return result.stdout;
};
const pkg = join(root, 'fixture-package'); await mkdir(pkg);
await copyFile(new URL('../test/fixtures/real-profile.mjs', import.meta.url), join(pkg, 'index.mjs'));
await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'dsh-owned-test-fixture', version: '0.0.0', private: true, type: 'module', main: 'index.mjs', engines: { dsh: '0.2.2-alpha.2' }, dsh: { bundle: { patch: 'cordis.patch.yml' } } }));
await writeFile(join(pkg, 'cordis.patch.yml'), JSON.stringify([{ id: 'credentials', disabled: true }, { insert: [{ id: 'keyless-credentials', name: 'dsh-owned-test-fixture' }] }]));
const packed = JSON.parse(run('npm', ['pack', '--offline', '--ignore-scripts', '--cache', join(root, 'cache'), '--json', '--pack-destination', root], pkg))[0];
for (const spec of ['@deepseek-ai/dsh-experimental-agent-team-profile@0.2.2-alpha.2', await realpath(hostTarball), join(root, packed.filename)]) run(process.execPath, [runtime.cli, 'plugin', '--profile', 'web', 'add', spec, '--ignore-scripts']);
const roles = ['lead', 'left', 'right'].map(name => ({ name, description: `Synthetic ${name} role`, instructions: `Use only synthetic ${name} task content and native Team coordination.`, provider: 'fixture-native', model: 'fixture-model' }));
await writeFile(join(home, 'profiles/web/cordis.patch.yml'), JSON.stringify([{ id: 'session-title-llm', disabled: true }, { id: 'dsh-agent-team', config: { stateDirectory: join(home, 'role-state'), allowedRoots: [workspace], catalog: { leadRole: 'lead', roles } } }]));
// Fail before any process starts if the test memory provider is not the effective composition.
const nativeRequire = createRequire(runtime.anchor);
const { loadProfileDirectory, composeEntries } = await import(nativeRequire.resolve('@deepseek-ai/dsh-app-boot'));
const profile = loadProfileDirectory('dsh', join(home, 'profiles/web'), runtime.anchor);
const warnings = [];
const entries = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], message => warnings.push(message));
assert.equal(warnings.length, 0, 'Test profile must compose without skipped patches');
assert.equal(entries.find(entry => entry.id === 'credentials').disabled, true);
assert.equal(entries.find(entry => entry.id === 'keyless-credentials').name, 'dsh-owned-test-fixture');
await assert.rejects(access(join(home, '.credentials.yaml')), { code: 'ENOENT' });
const owner = new OwnedHost({ home, runtimeAnchor: runtime.anchor, profile: 'web', startupTimeoutMs: 20000 });
let firstId, childIds, pid;
const until = async check => { const deadline = Date.now() + 15000; while (Date.now() < deadline) { const value = await check(); if (value) return value; await delay(25); } throw new Error('Native e2e observation timed out'); };
try {
  const health = await owner.request('health'); pid = health.host.pid;
  assert.equal(health.host.home, home); assert.equal(health.owned, true);
  const input = { key: 'native-e2e', cwd: workspace, text: 'CREATE_SYNTHETIC_TEAM: process only synthetic fixtures.' };
  const created = await owner.request('create', input); firstId = created.teamId;
  assert.equal((await owner.request('create', input)).teamId, firstId);
  await until(async () => (await owner.request('result', { teamId: firstId })).completed === true);
  const before = await owner.request('status', { teamId: firstId });
  assert.equal(before.members.length, 3); childIds = before.members.filter(member => member.name !== 'lead').map(member => member.memberId).sort();
  await owner.close();
  await owner.request('send', { teamId: firstId, inputId: 'same-member-followup', text: 'FOLLOW_SAME: send only the synthetic follow-up.' });
  await until(async () => (await owner.request('result', { teamId: firstId })).completed === true);
  const after = await owner.request('status', { teamId: firstId });
  assert.deepEqual(after.members.filter(member => member.name !== 'lead').map(member => member.memberId).sort(), childIds);
  assert.equal((await owner.request('health')).host.pid, pid);
  if (flags.includes('--open')) await owner.request('web');
  assert.equal((await owner.shutdown()).stopped, true);
  assert.equal(birth(pid), null);
  const restored = await owner.request('status', { teamId: firstId });
  assert.equal(restored.runtimeState, 'unloaded');
  assert.deepEqual(restored.members.filter(member => member.name !== 'lead').map(member => member.memberId).sort(), childIds);
  assert.notEqual((await owner.request('health')).host.pid, pid);
  await assert.rejects(access(join(home, '.credentials.yaml')), { code: 'ENOENT' });
  const rows = (await readFile(join(home, 'synthetic-requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert(rows.length <= 24);
  console.log(JSON.stringify({ passed: true, gate: 'real-official-cli-ordinary-web-managed-teams', requests: rows.length, sameMember: true, disconnectIndependent: true, restartPersistent: true, persistentCredentialsCreated: false, home }, null, 2));
} finally {
  await owner.close();
  if (!flags.includes('--keep')) {
    const outcome = await owner.shutdown();
    if (outcome.stopped) await rm(root, { recursive: true, force: true });
    else console.error(JSON.stringify({ retainedTestHome: home, reason: outcome.reason }));
  }
}
