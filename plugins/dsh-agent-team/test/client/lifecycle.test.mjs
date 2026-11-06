import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, chmod, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { authorizeSyntheticMcp, signedFixture } from '../fixtures/permission-context.mjs';
import { ownedFixture } from '../fixtures/owned.mjs';
import { OwnedHost, initializeOwnedHome } from '../../src/host/manager.mjs';
import { readPrivate, writePrivate, birth, delay } from '../../src/host/files.mjs';

test('synthetic protocol launcher starts the entire host, attributes the actual host PID and retains guarded shutdown', { timeout: 15000 }, async t => {
  // This launcher deliberately does NOT enforce a sandbox. It checks protocol,
  // argv, bootstrap, native transport, ownership and lifetime mechanics only.
  const fixture = await ownedFixture(t);
  delete fixture.owner.config.permissionAuthority;
  delete fixture.owner.config.permissionContext;
  const launcher = join(fixture.home, 'synthetic-launcher');
  await writeFile(launcher, `#!${process.execPath}\nimport { spawnSync } from 'node:child_process';\nimport assert from 'node:assert/strict';\nconst args = process.argv.slice(2); assert.equal(args[0], 'sandbox'); assert.equal(args[1], '--sandbox-state-json'); assert.equal(args[3], '--'); assert.equal(JSON.parse(args[2]).futureField, 'must-survive'); const r = spawnSync(args[4], args.slice(5), { stdio: 'inherit', env: process.env }); process.exit(r.status ?? 1);\n`, { mode: 0o700 });
  const state = { permissionProfile: { type: 'managed', file_system: { type: 'unrestricted' }, network: 'enabled' }, sandboxCwd: new URL(`file://${fixture.home}`).href, codexLinuxSandboxExe: null, useLegacyLandlock: false, useMxc: false, futureField: 'must-survive' };
  const options = { protocolMeta: { 'codex/sandbox-state': state, 'codex/sandbox-launcher': { codexExecutable: launcher } } };
  const health = await fixture.owner.request('health', {}, options);
  assert.equal(health.permissionSource.source, 'codex-request-metadata');
  assert.equal(health.permissionSource.codexApproval, 'unknown');
  assert.equal(health.execution.scope, 'entire-native-host');
  assert.equal(health.host.pid, fixture.owner.entry.pid);
  assert.equal(birth(health.host.pid), fixture.owner.entry.birth);
  const created = await fixture.owner.request('create', { key: 'sandbox-protocol', cwd: fixture.home, text: 'synthetic launcher work' }, options);
  assert.equal(created.permissionProfile.sandboxMode, 'danger-full-access');
  assert.equal(created.permissions.approvalPolicy, 'ask');
  await assert.rejects(fixture.owner.request('send', { teamId: created.teamId, inputId: 'metadata-lost', text: 'must not run' }), { code: 'HOST_PERMISSION_MISMATCH' });
  await fixture.owner.request('send', { teamId: created.teamId, inputId: 'same-state', text: 'synthetic follow-up' }, options);
  assert.equal(await fixture.starts(), 1);
  await fixture.owner.request('stop', { teamId: created.teamId });
  assert.equal((await fixture.owner.shutdown()).stopped, true);
});

test('sandbox launcher exit without a bootstrap identity keeps uncertain startup and refuses a replacement writer', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  delete fixture.owner.config.permissionAuthority;
  delete fixture.owner.config.permissionContext;
  const launcher = join(fixture.home, 'synthetic-failed-launcher');
  await writeFile(launcher, `#!${process.execPath}\nprocess.exit(71);\n`, { mode: 0o700 });
  const state = { permissionProfile: { type: 'managed', file_system: { type: 'unrestricted' }, network: 'enabled' }, sandboxCwd: new URL(`file://${fixture.home}`).href };
  const options = { protocolMeta: { 'codex/sandbox-state': state, 'codex/sandbox-launcher': { codexExecutable: launcher } } };
  await assert.rejects(fixture.owner.request('health', {}, options), { code: 'STARTUP_FAILED' });
  const provisional = await readPrivate(join(fixture.home, '.codex-owned/starting.json'));
  assert.equal(provisional.awaitingSandboxHostIdentity, true);
  await assert.rejects(fixture.owner.request('health', {}, options), { code: 'STARTUP_UNCERTAIN' });
  assert.equal(await readPrivate(join(fixture.home, '.codex-owned/instance.json')), null);
});

test('cancelled lifecycle requests cannot enter shutdown, startup or browser handoff', async t => {
  const owner = new OwnedHost({});
  owner.ensure = owner.shutdown = async () => assert.fail('Cancelled lifecycle action must not start');
  const reason = Object.assign(new Error('MCP cancelled'), { code: 'CANCELLED' });
  for (const method of ['shutdown', 'web']) await assert.rejects(owner.request(method, {}, { signal: AbortSignal.abort(reason) }), { code: 'CANCELLED' });
  await signedFixture(t, owner);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), controller = new AbortController();
  owner.ensure = async () => { entered.resolve(); await release.promise; };
  const web = owner.request('web', {}, { signal: controller.signal });
  await entered.promise; controller.abort(reason); release.resolve();
  await assert.rejects(web, { code: 'CANCELLED' });
});

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
  const failedPid = join(fixture.home, 'failed-child-pid');
  await writeFile(cli, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(failedPid)}, String(process.pid)); process.exit(2);`);
  await assert.rejects(fixture.owner.request('health'), { code: 'STARTUP_FAILED' });
  assert.equal(await readPrivate(join(fixture.home, '.codex-owned/starting.json')), null);
  assert.equal(await fixture.owner.current(), null);
  assert.equal(birth(Number(await readFile(failedPid, 'utf8'))), null);
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

test('MCP death during startup releases coordination but preserves the same provisional native child', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  const cli = join(fixture.runtime, 'lib/bin.js');
  const source = await readFile(cli, 'utf8');
  await writeFile(cli, `await new Promise(resolve=>setTimeout(resolve,500)); await import(${JSON.stringify(new URL('../fixtures/owned-cli.mjs', import.meta.url).href)});`);
  const { spawn } = await import('node:child_process');
  const contextPath = join(fixture.home, 'killed-mcp-context.json');
  const client = spawn(process.execPath, [new URL('../../src/mcp/main.mjs', import.meta.url).pathname, '--permission-authority', fixture.config.permissionAuthority], { env: { ...fixture.env, DSH_AGENT_TEAM_PERMISSION_CONTEXT: contextPath }, stdio: ['pipe', 'pipe', 'pipe'] });
  client.stdout.resume(); client.stderr.resume(); const exited = once(client, 'exit');
  t.after(() => { if (client.exitCode === null && client.signalCode === null) client.kill('SIGKILL'); });
  await authorizeSyntheticMcp(client, contextPath, fixture.issue);
  client.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {} } }) + '\n');
  let provisional;
  for (let i = 0; i < 200; i++) { provisional = await readPrivate(join(fixture.home, '.codex-owned/starting.json')); if (provisional?.pid) break; await delay(10); }
  assert(provisional?.pid);
  client.kill('SIGKILL'); await exited;
  const health = await fixture.owner.request('health');
  assert.equal(health.host.pid, provisional.pid);
  assert.equal(await fixture.starts(), 1);
});

test('supervisor death without published child identity is uncertain and cannot create a second writer', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  await writeFile(join(fixture.runtime, 'lib/bin.js'), `process.env.DSH_FIXTURE_DIAGNOSTIC_TRIGGER='file'; await import(${JSON.stringify(new URL('../fixtures/owned-cli.mjs', import.meta.url).href)});`);
  await fixture.owner.request('health');
  const path = join(fixture.home, '.codex-owned/instance.json');
  const actual = await readPrivate(path), supervisorBirth = birth(actual.supervisorPid);
  const { unlink } = await import('node:fs/promises');
  // Reproduce the durable crash cut after spawn authorization but before PID publication.
  await writePrivate(join(fixture.home, '.codex-owned/starting.json'), { version: 1, birthFormat: 'utc-c-v1', phase: 'spawn-authorized', instanceId: actual.instanceId, supervisorPid: actual.supervisorPid, supervisorBirth });
  await unlink(path);
  const readyPath = join(fixture.home, '.codex-owned', `ready-${actual.instanceId}.json`);
  await unlink(readyPath);
  process.kill(actual.supervisorPid, 'SIGKILL');
  for (let i = 0; i < 100 && birth(actual.supervisorPid); i++) await delay(10);
  // Force a normal diagnostic after the carrier has died; logging must not kill the fixture.
  await writeFile(join(fixture.home, 'emit-post-ready'), 'go');
  let emitted = false;
  for (let i = 0; i < 200 && birth(actual.pid); i++) {
    try { await access(join(fixture.home, 'post-ready-emitted')); emitted = true; break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(10);
  }
  assert.equal(birth(actual.pid), actual.birth);
  assert.equal(emitted, true);
  await assert.rejects(fixture.owner.request('health'), { code: 'STARTUP_UNCERTAIN' });
  assert.equal(await fixture.starts(), 1);
  // Restore this test's known child identity solely for guarded cleanup.
  await writePrivate(readyPath, actual); await writePrivate(path, actual); await unlink(join(fixture.home, '.codex-owned/starting.json'));
  assert.equal((await fixture.owner.shutdown()).stopped, true);
});

test('successor shutdown adopts ready startup metadata before guarding and stopping the actual host', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t); const health = await fixture.owner.request('health');
  const { unlink } = await import('node:fs/promises'); await unlink(join(fixture.home, '.codex-owned/instance.json'));
  const successor = new OwnedHost(fixture.config); t.after(() => successor.close());
  const stopped = await successor.shutdown();
  assert.equal(stopped.stopped, true); assert.notEqual(stopped.alreadyStopped, true);
  assert.equal(birth(health.host.pid), null);
});

test('process attribution remains stable across caller timezone and locale changes', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t); const first = await fixture.owner.request('health');
  const saved = { TZ: process.env.TZ, LC_ALL: process.env.LC_ALL, LANG: process.env.LANG };
  const second = new OwnedHost(fixture.config); t.after(() => second.close());
  try {
    process.env.TZ = 'America/Los_Angeles'; process.env.LC_ALL = 'C'; process.env.LANG = 'C';
    assert.equal((await second.request('health')).host.pid, first.host.pid);
    process.env.TZ = 'Asia/Shanghai'; process.env.LC_ALL = 'zh_CN.UTF-8';
    assert.equal((await fixture.owner.request('health')).host.pid, first.host.pid);
    assert.equal(await fixture.starts(), 1);
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test('unversioned historical process timestamps cannot make a live host look stopped', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t); const health = await fixture.owner.request('health');
  const path = join(fixture.home, '.codex-owned/instance.json'); const actual = await readPrivate(path);
  await writePrivate(path, { ...actual, birthFormat: undefined, birth: 'ambiguous local date' });
  await assert.rejects(fixture.owner.request('health'), { code: 'OWNERSHIP_MISMATCH' });
  assert.equal(await fixture.starts(), 1); assert.equal(birth(health.host.pid), actual.birth);
  await writePrivate(path, actual);
});

test('interleaved startup authenticates and private diagnostics continue after readiness', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  let health;
  try { health = await fixture.owner.request('health'); }
  catch (error) {
    // A deliberately broken parser must not strand this idle, test-owned process during regression reproduction.
    const entry = await fixture.owner.current();
    if (entry && birth(entry.pid) === entry.birth) {
      process.kill(entry.pid, 'SIGTERM');
      for (let i = 0; i < 200 && birth(entry.pid); i++) await delay(10);
    }
    throw error;
  }
  assert(health.diagnostics.path.includes(fixture.owner.entry.instanceId));
  let diagnostics;
  for (let i = 0; i < 200; i++) {
    diagnostics = await readPrivate(health.diagnostics.path);
    if (diagnostics?.text.includes('Synthetic post-ready diagnostic')) break;
    await delay(10);
  }
  assert(diagnostics.text.includes('Synthetic activation diagnostic'));
  assert(diagnostics.text.includes('Synthetic post-ready diagnostic'));
  const token = new URL(fixture.owner.entry.url).searchParams.get('token');
  assert(!diagnostics.text.includes(token), 'The launch capability must never appear in diagnostics');
  const { lstat } = await import('node:fs/promises');
  assert.equal((await lstat(health.diagnostics.path)).mode & 0o077, 0);
});
