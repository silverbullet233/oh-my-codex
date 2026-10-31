import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, chmod, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { ownedFixture } from '../fixtures/owned.mjs';
import { OwnedHost, initializeOwnedHome } from '../../src/host/manager.mjs';
import { readPrivate, writePrivate, birth, delay } from '../../src/host/files.mjs';

test('concurrent independent callers start once on a free port and reuse across API disconnect', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  const second = new OwnedHost(fixture.config);
  t.after(() => second.close());
  const results = await Promise.all([fixture.owner.request('health'), second.request('health'), fixture.owner.request('health')]);
  assert.equal(new Set(results.map(result => result.host.pid)).size, 1);
  assert.equal(await fixture.starts(), 1);
  assert.match(results[0].web.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.doesNotMatch(JSON.stringify(results), /token=|Cookie/);
  await fixture.owner.close();
  assert.equal((await fixture.owner.request('health')).host.pid, results[0].host.pid);
  assert.equal(await fixture.starts(), 1);
});

test('active work survives disconnect; shutdown refuses it and restart preserves durable task identity', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  const created = await fixture.owner.request('create', { key: 'durable-team', cwd: fixture.home, text: 'hang' });
  assert.equal((await fixture.owner.shutdown()).stopped, false);
  const before = (await fixture.owner.request('health')).host.pid;
  await fixture.owner.close();
  const another = new OwnedHost(fixture.config); t.after(() => another.close());
  assert.equal((await another.request('status', { teamId: created.teamId })).runtimeState, 'running');
  assert.equal((await another.request('health')).host.pid, before);
  // Intentional crash belongs only to this test's attributed child process.
  process.kill(before, 'SIGKILL');
  for (let i = 0; i < 100 && birth(before); i++) await delay(10);
  const restored = await another.request('create', { key: 'durable-team', cwd: fixture.home, text: 'hang' });
  assert.equal(restored.teamId, created.teamId);
  assert.notEqual((await another.request('health')).host.pid, before);
  assert.equal(await fixture.starts(), 2);
  await another.request('stop', { teamId: created.teamId });
  assert.equal((await another.shutdown()).stopped, true);
  assert((await readFile(join(fixture.home, 'fixture.json'), 'utf8')).includes('durable-team'));
});

test('mux closure invalidates authentication and obtains a fresh API Peer before the next call', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  await fixture.owner.request('health');
  const gateway = fixture.owner.gateway;
  const old = gateway.socket;
  old.close(); await once(old, 'close');
  assert.equal(gateway.invalid, true);
  assert.equal((await fixture.owner.request('health')).ok, true);
  assert.notEqual(gateway.socket, old);
  assert.equal(await fixture.starts(), 1);
});

test('failed startup removes its lock and leaves no live attributed host; a later clean start succeeds', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  const cli = join(fixture.runtime, 'lib/bin.js');
  const source = await readFile(cli, 'utf8');
  await writeFile(cli, 'process.exit(2);');
  await assert.rejects(fixture.owner.request('health'), { code: 'STARTUP_FAILED' });
  assert.equal(await readPrivate(join(fixture.home, '.codex-owned/starting.json')), null);
  assert.equal(await fixture.owner.current(), null);
  await writeFile(cli, source);
  assert.equal((await fixture.owner.request('health')).ok, true);
});

test('an exact foreign instance record with the same runtime cannot stop a different owned home', { timeout: 15000 }, async t => {
  const first = await ownedFixture(t), second = await ownedFixture(t);
  const health = await first.owner.request('health');
  const foreign = new OwnedHost({ ...second.config, runtimeAnchor: first.runtime }); t.after(() => foreign.close());
  await foreign.prepare();
  const actual = await readPrivate(join(first.home, '.codex-owned/instance.json'));
  await writePrivate(join(second.home, '.codex-owned/instance.json'), actual);
  await assert.rejects(foreign.shutdown(), { code: 'OWNERSHIP_MISMATCH' });
  assert.equal((await first.owner.request('health')).host.pid, health.host.pid);
  // Even editing the copied path cannot forge the native home attestation.
  await writePrivate(join(second.home, '.codex-owned/instance.json'), { ...actual, home: foreign.config.home });
  await assert.rejects(foreign.shutdown(), { code: 'OWNERSHIP_MISMATCH' });
  assert.equal((await first.owner.request('health')).host.pid, health.host.pid);
  const { unlink } = await import('node:fs/promises'); await unlink(join(second.home, '.codex-owned/instance.json'));
});

test('existing unrelated homes and permissive ownership metadata are refused', async t => {
  const home = await mkdtemp(join(tmpdir(), 'unowned-native-home-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await writeFile(join(home, 'existing-user-data'), 'retained');
  await assert.rejects(initializeOwnedHome(home, home), { code: 'UNOWNED_HOME' });
  const fixture = await ownedFixture(t);
  await chmod(join(fixture.home, '.codex-dsh-owner.json'), 0o644);
  await assert.rejects(fixture.owner.request('health'), { code: 'UNSAFE_STATE' });
  await chmod(join(fixture.home, '.codex-dsh-owner.json'), 0o600);
});

test('an atomic system lock serializes gated callers without partially published owner files', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  const second = new OwnedHost(fixture.config); t.after(() => second.close());
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => release.resolve());
  const holding = fixture.owner.locked(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  let crossed = false;
  const waiting = second.locked(async () => { crossed = true; });
  await delay(75); assert.equal(crossed, false);
  release.resolve(); await Promise.all([holding, waiting]);
  assert.equal(crossed, true);
});

test('a delayed non-ready child retains startup attribution until graceful exit', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  const cli = join(fixture.runtime, 'lib/bin.js'); const source = await readFile(cli, 'utf8');
  await writeFile(cli, `import {writeFileSync} from 'node:fs'; writeFileSync(process.env.DSH_HOME+'/slow-pid',String(process.pid)); process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),2500)); setInterval(()=>{},1000);`);
  fixture.owner.config.startupTimeoutMs = 100;
  await assert.rejects(fixture.owner.request('health'), { code: 'STARTUP_TIMEOUT' });
  const provisional = await readPrivate(join(fixture.home, '.codex-owned/starting.json'));
  assert(provisional.pid && birth(provisional.pid));
  await writeFile(cli, source);
  const second = new OwnedHost({ ...fixture.config, startupTimeoutMs: 5000 }); t.after(() => second.close());
  const restarting = second.request('health');
  await delay(100);
  assert.equal(await readPrivate(join(fixture.home, '.codex-owned/instance.json')), null);
  assert.equal((await readPrivate(join(fixture.home, '.codex-owned/starting.json'))).pid, provisional.pid);
  const healthy = await restarting;
  assert.notEqual(healthy.host.pid, provisional.pid);
  assert.equal(birth(provisional.pid), null);
});
