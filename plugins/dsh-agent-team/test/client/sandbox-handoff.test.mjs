import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readPermissionContext, requireExecutableContext, sandboxInvocation, verifyHostBinding, fingerprint } from '../../src/host/permissions.mjs';
import { OwnedHost, configuration } from '../../src/host/manager.mjs';
import { writePrivate } from '../../src/host/files.mjs';
import { hostInvocation, startupIdentity } from '../../src/host/launch.mjs';
import { ClientError } from '../../src/native/errors.mjs';
import { createDispatcher } from '../../src/mcp/server.mjs';
import { captureNativeOutput } from '../../src/host/output.mjs';

const state = { permissionProfile: { type: 'managed', file_system: { type: 'restricted', entries: [
  { path: { type: 'path', path: '/work' }, access: 'write' },
  { path: { type: 'path', path: '/work/.git' }, access: 'read' },
  { path: { type: 'path', path: '/work/private' }, access: 'deny' },
] }, network: 'enabled' }, sandboxCwd: 'file:///work', codexLinuxSandboxExe: null, useLegacyLandlock: false, useMxc: false, future: { preserve: true } };
const metadata = { 'codex/sandbox-state': state, 'codex/sandbox-launcher': { codexExecutable: '/opt/codex' } };
const context = meta => readPermissionContext({}, Date.now(), meta);

test('open network is product intent while filesystem state and native approval provenance remain distinct', async () => {
  const inherited = await context(metadata), fallback = await context(undefined);
  for (const c of [inherited, fallback]) {
    assert.equal(c.permissions.networkAccess, 'enabled');
    assert.equal(c.execution.network, 'product-default-open');
    assert.equal(c.provenance.networkSource, 'product-default');
    assert.equal(c.provenance.effectiveNetworkVerified, false);
    assert.equal(c.provenance.osLimitsVerified, false);
    assert.equal(c.provenance.codexApproval, 'unknown');
  }
  assert.equal(inherited.provenance.filesystemSource, 'codex-request-metadata');
  assert.equal(inherited.provenance.approvalSource, 'native-default');
  assert.equal(inherited.provenance.codexNetwork, 'not-inherited');
  assert.equal(inherited.permissions.approvalPolicy, 'ask');
  assert.equal(fallback.permissions.approvalPolicy, 'never');
  assert.equal(inherited.sandbox.stateJson, JSON.stringify(state));
  // Pre-change same-state hosts requested unknown network, so the new policy
  // must not adopt them merely because their filesystem state matches.
  const oldBinding = { ...inherited.binding, permissions: { ...inherited.permissions, networkAccess: 'unknown' } };
  delete oldBinding.networkPolicy;
  assert.throws(() => verifyHostBinding({ permissionBinding: fingerprint(oldBinding), permissionExecution: inherited.execution }, inherited), { code: 'HOST_PERMISSION_MISMATCH' });
});

test('restricted or unknown opaque network cannot be stripped, guessed or retried as full access', async t => {
  for (const network of ['restricted', undefined, 'future-policy']) await t.test(String(network), async () => {
    const offeredState = { ...state, permissionProfile: { ...state.permissionProfile, network } };
    const offered = { ...metadata, 'codex/sandbox-state': offeredState };
    const before = JSON.stringify(offered), c = await context(offered);
    assert.equal(c.sandbox.stateJson, JSON.stringify(offeredState));
    assert.equal(c.execution.networkOpenSupported, false);
    assert.throws(() => sandboxInvocation(c, ['node', 'must-not-run']), { code: 'NETWORK_POLICY_SPLIT_UNAVAILABLE' });
    const owner = new OwnedHost({});
    owner.ensure = async () => assert.fail('unsupported separation must not connect, start or reuse a host');
    const health = await owner.request('health', {}, { protocolMeta: offered });
    assert.equal(health.ok, false);
    assert.equal(health.owned, false);
    assert.equal(health.limitation.code, 'NETWORK_POLICY_SPLIT_UNAVAILABLE');
    for (const method of ['web', 'create', 'send', 'answer', 'approval']) {
      await assert.rejects(owner.request(method, {}, { protocolMeta: offered }), { code: 'NETWORK_POLICY_SPLIT_UNAVAILABLE' });
    }
    assert.equal(JSON.stringify(offered), before);
  });
});

test('restricted or unknown network is never discarded for a missing launcher or unsupported state', async () => {
  for (const [type, network, launcher, code] of [
    ['managed', 'restricted', undefined, 'SANDBOX_LAUNCHER_UNAVAILABLE'],
    ['managed', undefined, undefined, 'SANDBOX_LAUNCHER_UNAVAILABLE'],
    ['managed', 'future-policy', undefined, 'SANDBOX_LAUNCHER_UNAVAILABLE'],
    ['external', 'restricted', '/opt/codex', 'SANDBOX_STATE_UNSUPPORTED'],
    ['external', 'future-policy', '/opt/codex', 'SANDBOX_STATE_UNSUPPORTED'],
    ['future', 'restricted', '/opt/codex', 'SANDBOX_STATE_UNSUPPORTED'],
  ]) {
    const restricted = { ...state, permissionProfile: { ...state.permissionProfile, type, network } };
    const offered = { 'codex/sandbox-state': restricted, ...(launcher ? { 'codex/sandbox-launcher': { codexExecutable: launcher } } : {}) };
    const c = await context(offered);
    assert.equal(c.provenance.source, 'codex-request-metadata');
    assert.equal(c.sandbox.stateJson, JSON.stringify(restricted));
    const owner = new OwnedHost({});
    owner.ensure = async () => assert.fail('capability absence cannot erase a known restriction');
    assert.equal((await owner.request('health', {}, { protocolMeta: offered })).limitation.code, code);
    await assert.rejects(owner.request('create', {}, { protocolMeta: offered }), { code });
  }
});

test('protocol capability and full metadata reach client options, detached from model arguments', async () => {
  let captured;
  const dispatch = createDispatcher({ request: async (...args) => { captured = args; return { ok: true }; } });
  const initialized = await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.deepEqual(initialized.result.capabilities.experimental, { 'codex/sandbox-state': {} });
  const request = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {}, _meta: structuredClone(metadata) } };
  await dispatch(request);
  assert.deepEqual(captured, ['health', {}, { protocolMeta: metadata }]);
  request.params._meta['codex/sandbox-state'].future.preserve = false;
  assert.equal(captured[2].protocolMeta['codex/sandbox-state'].future.preserve, true);
  const forged = await dispatch({ ...request, id: 3, params: { ...request.params, _meta: undefined, arguments: { _meta: metadata } } });
  assert.equal(forged.error.code, -32602);
});

test('ordinary unsigned default and explicit configuration are usable native intentions with honest unknowns', async t => {
  const value = await readPermissionContext(configuration({ CODEX_YOLO: 'true', DSH_AGENT_TEAM_PERMISSION_PROFILE: '/ignored' }));
  requireExecutableContext(value);
  assert.equal(value.provenance.source, 'full-access-fallback');
  assert.equal(value.permissions.networkAccess, 'enabled');
  assert.equal(value.provenance.codexApproval, 'unknown');
  assert.equal(value.permissions.approvalPolicy, 'never');
  const root = await mkdtemp(join(tmpdir(), 'dsh-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'profile.json');
  const profile = { sandboxMode: 'workspace-write', approvalPolicy: 'never', writableRoots: ['/work'], networkAccess: 'unknown' };
  await writePrivate(path, profile);
  const configured = await readPermissionContext({ permissionProfile: path });
  requireExecutableContext(configured);
  assert.equal(configured.provenance.source, 'explicit-configuration');
  assert.equal(configured.permissions.sandboxMode, 'workspace-write');
  assert.equal(configured.provenance.codexSandbox, 'unknown');
  assert.notEqual(configured.permissions.sandboxMode, 'danger-full-access', 'never does not mean YOLO');
  await writePrivate(path, { ...profile, networkAccess: 'restricted' });
  const restricted = await readPermissionContext({ permissionProfile: path });
  assert.throws(() => requireExecutableContext(restricted), { code: 'NETWORK_ENFORCEMENT_UNAVAILABLE' });
  const owner = new OwnedHost({ permissionProfile: path });
  owner.ensure = async () => assert.fail('native restricted network cannot reach work');
  assert.equal((await owner.request('health')).limitation.code, 'NETWORK_ENFORCEMENT_UNAVAILABLE');
  await assert.rejects(owner.request('create', {}), { code: 'NETWORK_ENFORCEMENT_UNAVAILABLE' });
  for (const roots of [[], ['relative']]) {
    await writePrivate(path, { ...profile, writableRoots: roots });
    await assert.rejects(readPermissionContext({ permissionProfile: path }), { code: 'PERMISSION_CONFIGURATION_INVALID' });
  }
});

test('default admission applies full access never before first work and verifies current native policy on subsequent input', async () => {
  const owner = new OwnedHost({ cwd: '/work' }), c = await readPermissionContext(owner.config), calls = [];
  await assert.rejects(owner.request('create', { permissionPreset: 'danger-full-access', permissionAuthorization: 'I approve' }), { code: 'PERMISSION_AUTHORIZATION_REQUIRED' });
  const profile = { ...c.permissions, binding: c.bindingHash }, permissions = { sandbox: { mode: 'danger-full-access', workspaceRoot: '/work' }, approvalPolicy: 'never' };
  owner.entry = { permissionBinding: c.bindingHash, permissionExecution: c.execution, url: 'http://127.0.0.1:12345/' };
  owner.ensure = async () => {};
  owner.gateway = { lastHealth: { host: structuredClone(owner.entry) }, request: async (method, params, options) => {
    await options?.beforeSubmit?.();
    calls.push({ method, params });
    return { teamId: 'root', permissionProfile: profile, permissions };
  } };
  const created = await owner.request('create', { cwd: '/work', key: 'unsigned', text: 'Synthetic no-signature work' });
  assert.deepEqual(calls[0].params.permissionProfile, profile);
  assert.equal(created.permissionSource.source, 'full-access-fallback');
  await owner.request('send', { teamId: 'root', inputId: 'next', text: 'Synthetic follow-up' });
  permissions.approvalPolicy = 'ask';
  await assert.rejects(owner.request('send', { teamId: 'root', inputId: 'changed', text: 'Must not run' }), { code: 'PERMISSION_MISMATCH' });
  assert.equal(calls.filter(call => call.method === 'send').length, 1);
});

test('strict configuration errors and invalid explicit profiles never downgrade', async () => {
  for (const config of [{ permissionAuthority: '/missing' }, { permissionContext: '/missing' }]) {
    await assert.rejects(readPermissionContext(config, Date.now(), metadata), { code: 'PERMISSION_CONTEXT_REQUIRED' });
  }
  await assert.rejects(readPermissionContext({ permissionAuthority: '/missing', permissionContext: '/missing' }), { code: 'PERMISSION_CONTEXT_INVALID' });
  await assert.rejects(readPermissionContext({ permissionProfile: 'relative' }), { code: 'PERMISSION_CONFIGURATION_INVALID' });
});

test('opaque state including deny/read/unknown fields reaches exact official argv without widening flags', async () => {
  const c = await context(metadata), invocation = sandboxInvocation(c, ['/usr/bin/node', 'worker.mjs', 'x; never']);
  assert.deepEqual(invocation, { executable: '/opt/codex', argv: ['sandbox', '--sandbox-state-json', JSON.stringify(state), '--', '/usr/bin/node', 'worker.mjs', 'x; never'] });
  assert.equal(c.provenance.codexApproval, 'unknown');
  assert.equal(c.permissions.approvalPolicy, 'ask');
  assert.equal(c.provenance.osLimitsVerified, false);
  const config = { sandbox: c.sandbox, cli: '/runtime/bin.js', profile: 'web', home: '/host', instanceId: 'synthetic', permissionBinding: c.bindingHash, permissionExecution: c.execution };
  const host = hostInvocation(config);
  assert.equal(host.executable, '/opt/codex');
  assert.deepEqual(JSON.parse(host.argv[2]), state);
  assert.match(host.argv[5], /bootstrap\.mjs$/);
  assert.equal(host.argv.includes('--allow-unix-socket'), false);
  assert.equal(host.argv.includes('--sandbox-state-readable-root'), false);
  const disabled = await context({ ...metadata, 'codex/sandbox-state': { ...state, permissionProfile: { type: 'disabled' } } });
  assert.equal(JSON.parse(sandboxInvocation(disabled, ['node']).argv[2]).permissionProfile.type, 'disabled');
  assert.equal(disabled.permissions.approvalPolicy, 'ask');
});

test('unavailable inheritance uses a native full-access fallback with reason and exact startup binding', async () => {
  for (const [meta, reason] of [
    [undefined, 'sandbox-metadata-unavailable'],
    [{ unrelated: true }, 'sandbox-metadata-unavailable'],
    [{ 'codex/sandbox-state': state }, 'sandbox-launcher-unavailable'],
    ...['external', 'future'].map(type => [{ ...metadata, 'codex/sandbox-state': { ...state, permissionProfile: { type } } }, 'sandbox-state-unsupported']),
  ]) {
    const c = await context(meta);
    requireExecutableContext(c);
    assert.equal(c.provenance.source, 'full-access-fallback');
    assert.equal(c.provenance.fallbackReason, reason);
    assert.equal(c.provenance.inheritance, 'unavailable');
    assert.equal(c.provenance.osLimitsVerified, false);
    assert.deepEqual(c.permissions, { sandboxMode: 'danger-full-access', approvalPolicy: 'never', writableRoots: [], networkAccess: 'enabled' });
    assert.equal(c.sandbox, undefined);
    assert.equal(c.execution.fallbackReason, reason);
    const invocation = hostInvocation({ ...c, cli: '/runtime/bin.js', profile: 'web' });
    assert.equal(invocation.executable, process.execPath);
    assert.equal(invocation.argv.includes('sandbox'), false);
    const entry = { permissionBinding: c.bindingHash, permissionExecution: c.execution };
    verifyHostBinding(entry, c, { host: structuredClone(entry) });
    assert.throws(() => verifyHostBinding(entry, { ...c, bindingHash: fingerprint({ ...c.binding, source: 'native-default' }) }), { code: 'HOST_PERMISSION_MISMATCH' });
    assert.throws(() => verifyHostBinding(entry, c, { host: { ...entry, permissionExecution: { backend: 'native' } } }), { code: 'HOST_PERMISSION_MISMATCH' });
    if (meta?.['codex/sandbox-state']) {
      assert.equal(c.binding.unavailableSandbox.stateJson, JSON.stringify(meta['codex/sandbox-state']));
      const changed = await context({ ...meta, 'codex/sandbox-state': { ...meta['codex/sandbox-state'], future: { preserve: false } } });
      assert.notEqual(changed.bindingHash, c.bindingHash);
    }
  }
});

test('available read-only state and OS startup refusal never retry full access or change the supplied state', async () => {
  const readonlyState = structuredClone(state);
  readonlyState.permissionProfile.file_system.entries = [{ path: { type: 'path', path: '/work' }, access: 'read' }];
  const owner = new OwnedHost({}), c = await context({ ...metadata, 'codex/sandbox-state': readonlyState }), failure = new ClientError('STARTUP_FAILED', 'Synthetic EPERM on runtime configuration write.');
  assert.equal(c.provenance.source, 'codex-request-metadata');
  assert.equal(c.sandbox.stateJson, JSON.stringify(readonlyState));
  let starts = 0;
  owner.locked = async () => { starts++; throw failure; };
  await assert.rejects(owner.ensure(c), error => error === failure && /runtime-state writes/.test(error.message) && /No writable roots were added/.test(error.message));
  assert.equal(starts, 1);
  assert.equal(c.sandbox.stateJson, JSON.stringify(readonlyState));
  assert.equal(c.permissions.approvalPolicy, 'ask');
});

test('conflicting aliases and invalid launchers cannot fall back; aliases preserve binding identity', async () => {
  const c = await context(metadata);
  assert.equal((await context({ 'codex/sandbox-state-meta': state, 'codex/sandbox-launcher': metadata['codex/sandbox-launcher'] })).bindingHash, c.bindingHash);
  await assert.rejects(context({ ...metadata, 'codex/sandbox-state-meta': { different: true } }), { code: 'SANDBOX_METADATA_CONFLICT' });
  for (const broken of [null, [], {}, { ...state, permissionProfile: {} }, { ...state, permissionProfile: null }]) await assert.rejects(context({ ...metadata, 'codex/sandbox-state': broken }), { code: 'SANDBOX_METADATA_INVALID' });
  for (const broken of [null, [], {}]) {
    await assert.rejects(context({ ...metadata, 'codex/sandbox-launcher': broken }), { code: 'SANDBOX_LAUNCHER_INVALID' });
    await assert.rejects(context({ 'codex/sandbox-launcher': broken }), { code: 'SANDBOX_LAUNCHER_INVALID' });
  }
  for (const codexExecutable of ['codex', '/bad\0path']) await assert.rejects(context({ ...metadata, 'codex/sandbox-launcher': { codexExecutable } }), { code: 'SANDBOX_LAUNCHER_INVALID' });
});

test('source/cwd/backend/native policy and every opaque field fence retained and responding hosts', async () => {
  const original = await context(metadata), entry = { permissionBinding: original.bindingHash, permissionExecution: original.execution };
  const health = { host: structuredClone(entry) }; verifyHostBinding(entry, original, health);
  for (const replacement of [
    await context({ ...metadata, 'codex/sandbox-state': { ...state, future: { preserve: false } } }),
    await context({ ...metadata, 'codex/sandbox-state': { ...state, sandboxCwd: 'file:///other' } }),
    await readPermissionContext({ cwd: '/work' }),
  ]) assert.throws(() => verifyHostBinding(entry, replacement, health), { code: 'HOST_PERMISSION_MISMATCH' });
  for (const change of [{ cwd: '/other' }, { backend: 'other' }, { source: 'explicit-configuration' }, { permissions: { ...original.permissions, approvalPolicy: 'never' } }]) {
    const changed = { ...original, bindingHash: fingerprint({ ...original.binding, ...change }) };
    assert.throws(() => verifyHostBinding(entry, changed, health), { code: 'HOST_PERMISSION_MISMATCH' });
  }
  assert.throws(() => verifyHostBinding(entry, original, { host: { ...entry, permissionExecution: { backend: 'native' } } }), { code: 'HOST_PERMISSION_MISMATCH' });
});

test('manager refuses retained hosts across fallback capability transitions before connecting or admitting work', async t => {
  // Keep the real ensure/request path. Only lifecycle I/O is supplied in memory;
  // this is not process attribution, a listening host or an OS sandbox test.
  const missing = undefined;
  const noLauncher = { 'codex/sandbox-state': state };
  const external = { ...metadata, 'codex/sandbox-state': { ...state, permissionProfile: { type: 'external' } } };
  const cases = [
    ['metadata lost', metadata, missing],
    ['metadata becomes available', missing, metadata],
    ['fallback reason changes', missing, noLauncher],
    ['unavailable state changes', noLauncher, { 'codex/sandbox-state': { ...state, future: { preserve: false } } }],
    ['unsupported state changes', external, { ...external, 'codex/sandbox-state': { ...external['codex/sandbox-state'], future: { preserve: false } } }],
    ['unsupported launcher changes', external, { ...external, 'codex/sandbox-launcher': { codexExecutable: '/other/codex' } }],
    ['supported launcher changes', metadata, { ...metadata, 'codex/sandbox-launcher': { codexExecutable: '/other/codex' } }],
    ['fallback cwd changes', missing, missing, '/other'],
  ];
  for (const [name, retainedMeta, offeredMeta, cwd = '/work'] of cases) await t.test(name, async () => {
    const retained = await readPermissionContext({ cwd: '/work' }, Date.now(), retainedMeta);
    const entry = { instanceId: 'retained', permissionBinding: retained.bindingHash, permissionExecution: retained.execution };
    const before = structuredClone(entry);
    const owner = new OwnedHost({ cwd });
    owner.locked = action => action();
    owner.current = async () => entry;
    owner.pendingStart = async () => assert.fail('a retained host must not trigger startup');
    owner.createGateway = () => assert.fail('mismatched retained host must not be connected');
    for (const method of ['health', 'create', 'send']) {
      await assert.rejects(owner.request(method, {}, { protocolMeta: offeredMeta }), { code: 'HOST_PERMISSION_MISMATCH' });
      assert.equal(owner.entry, undefined);
      assert.equal(owner.starting, undefined);
      assert.deepEqual(entry, before, 'refusal leaves the retained record unchanged');
    }
  });
});

test('manager verifies responding fallback execution before create even with a matching retained binding', async t => {
  const c = await readPermissionContext({ cwd: '/work' });
  const entry = { instanceId: 'retained', permissionBinding: c.bindingHash, permissionExecution: c.execution };
  for (const [name, host] of [
    ['missing binding', { permissionExecution: c.execution }],
    ['missing execution', { permissionBinding: c.bindingHash }],
    ['changed reason', { ...entry, permissionExecution: { ...c.execution, fallbackReason: 'sandbox-launcher-unavailable' } }],
  ]) await t.test(name, async () => {
    const owner = new OwnedHost({ cwd: '/work' });
    owner.locked = action => action();
    owner.current = async () => entry;
    const calls = [];
    owner.createGateway = () => ({ request: async method => {
      calls.push(method);
      assert.equal(method, 'health', 'create must not reach native admission');
      return { host };
    } });
    await assert.rejects(owner.request('create', { key: 'blocked', text: 'Synthetic non-admitted work' }), { code: 'HOST_PERMISSION_MISMATCH' });
    assert.deepEqual(calls, ['health']);
    assert.equal(entry.permissionBinding, c.bindingHash);
    assert.deepEqual(entry.permissionExecution, c.execution);
  });
});

test('bootstrap attribution accepts one exact stdout identity before readiness, preserves PID guards and omits identity diagnostics', () => {
  const line = JSON.stringify({ type: 'dsh-sandbox-host', instanceId: 'owned', pid: 123 });
  assert.equal(startupIdentity('stdout', line, 'owned'), 123);
  assert.equal(startupIdentity('stderr', line, 'owned'), null);
  assert.equal(startupIdentity('stdout', line, 'foreign'), null);
  const events = [];
  const output = captureNativeOutput(() => { events.push('ready'); return true; }, line => events.push(line), (name, line) => {
    if (!startupIdentity(name, line, 'owned')) return false;
    events.push('identity'); return true;
  });
  output.push('stdout', Buffer.from(line.slice(0, 17)));
  output.push('stdout', Buffer.from(line.slice(17) + '\nhttp://127.0.0.1:12345/?token=synthetic-only\n'));
  assert.deepEqual(events.slice(0, 2), ['identity', 'ready']);
  assert.doesNotMatch(events.join(''), /synthetic-only|dsh-sandbox-host/);
});

test('synthetic launcher actually runs production bootstrap and descendants without sockets or attribution probes', async t => {
  // This verifies the complete launch/child path, not OS enforcement.
  const root = await mkdtemp(join(tmpdir(), 'dsh-bootstrap-')); t.after(() => rm(root, { recursive: true, force: true }));
  const launcher = join(root, 'launcher'), cli = join(root, 'host.mjs');
  await writeFile(launcher, `#!${process.execPath}\nimport { spawnSync } from 'node:child_process';\nimport assert from 'node:assert/strict';\nconst a=process.argv.slice(2); assert.deepEqual(a.slice(0,2),['sandbox','--sandbox-state-json']); assert.equal(a[3],'--'); assert.equal(JSON.parse(a[2]).future.preserve,true); const r=spawnSync(a[4],a.slice(5),{stdio:'inherit',env:process.env}); process.exit(r.status ?? 1);`, { mode: 0o700 });
  await writeFile(cli, `import { writeFileSync } from 'node:fs'; import { spawnSync } from 'node:child_process'; export function runCli() { const r=spawnSync(process.execPath,['-e','process.stdout.write(process.env.DSH_OWNED_INSTANCE_ID)'],{encoding:'utf8'}); writeFileSync(${JSON.stringify(join(root, 'receipt'))},JSON.stringify({pid:process.pid,argv:process.argv.slice(2),home:process.env.DSH_HOME,execution:JSON.parse(process.env.DSH_AGENT_TEAM_LAUNCH_EXECUTION),descendant:r.stdout})); } if(import.meta.main) runCli();`);
  const c = await context({ ...metadata, 'codex/sandbox-launcher': { codexExecutable: launcher } });
  const config = { sandbox: c.sandbox, cli, profile: 'web', home: root, instanceId: 'synthetic-only', permissionBinding: c.bindingHash, permissionExecution: c.execution };
  const invocation = hostInvocation(config), result = spawnSync(invocation.executable, invocation.argv, { encoding: 'utf8', cwd: root, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(await readFile(join(root, 'receipt'), 'utf8'));
  assert.equal(startupIdentity('stdout', result.stdout.trim(), config.instanceId), receipt.pid);
  assert.deepEqual(receipt.argv, ['--profile', 'web', '--no-open', '--host', '127.0.0.1', '--port', '0']);
  assert.equal(receipt.home, root); assert.equal(receipt.descendant, config.instanceId);
  assert.deepEqual(receipt.execution, c.execution);
});
