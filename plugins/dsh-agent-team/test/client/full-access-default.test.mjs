/** Synthetic admission and direct-child checks; no provider or OS-policy claims. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readPermissionContext, requireExecutableContext, verifyHostBinding, fingerprint } from '../../src/host/permissions.mjs';
import { OwnedHost } from '../../src/host/manager.mjs';
import { writePrivate } from '../../src/host/files.mjs';
import { hostInvocation } from '../../src/host/launch.mjs';
import { createDispatcher } from '../../src/mcp/server.mjs';
import { signedFixture } from '../fixtures/permission-context.mjs';

const metadata = { 'codex/sandbox-state': { permissionProfile: { type: 'managed', network: 'restricted', file_system: { type: 'restricted' } }, sandboxCwd: 'file:///other' }, 'codex/sandbox-launcher': { codexExecutable: '/must-not-run' } };
const full = { sandboxMode: 'danger-full-access', approvalPolicy: 'never', writableRoots: [], networkAccess: 'enabled' };

test('ordinary full access is stable regardless of offered Codex metadata, aliases or launcher', async () => {
  const expected = await readPermissionContext({ cwd: '/work' });
  for (const offered of [metadata, undefined, null, [], { 'codex/sandbox-state': null }, { 'codex/sandbox-state': {}, 'codex/sandbox-state-meta': { conflict: true } }, { 'codex/sandbox-launcher': { codexExecutable: 'relative' } }]) {
    const before = structuredClone(offered), context = await readPermissionContext({ cwd: '/work' }, Date.now(), offered);
    assert.deepEqual(context, expected); assert.deepEqual(offered, before); assert.deepEqual(context.permissions, full);
    assert.equal(context.provenance.source, 'full-access-default'); assert.equal(context.provenance.inheritance, 'not-requested');
    assert.equal(context.provenance.codexApproval, 'not-inherited'); assert.equal(context.provenance.osLimitsVerified, false);
    assert.equal(context.provenance.effectiveNetworkVerified, false); assert.equal(context.sandbox, undefined);
    assert.equal(context.binding.cwd, '/work'); requireExecutableContext(context);
  }
});

test('MCP does not advertise or forward the old sandbox-state channel', async () => {
  let captured;
  const dispatch = createDispatcher({ request: async (...args) => { captured = args; return { ok: true }; } });
  assert.equal((await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' })).result.capabilities.experimental, undefined);
  const options = { signal: new AbortController().signal };
  const request = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {}, _meta: metadata } };
  await dispatch(request, options); assert.deepEqual(captured, ['health', {}, options]);
  assert.equal((await dispatch({ ...request, id: 3, params: { ...request.params, arguments: { _meta: metadata } } })).error.code, -32602);
});

test('explicit restricted profiles survive offered metadata; invalid or unsupported selection never defaults', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-explicit-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'profile.json');
  for (const sandboxMode of ['workspace-write', 'read-only']) {
    const profile = { sandboxMode, approvalPolicy: 'ask', writableRoots: sandboxMode === 'workspace-write' ? ['/work'] : [], networkAccess: 'unknown' };
    await writePrivate(path, profile);
    const context = await readPermissionContext({ permissionProfile: path }, Date.now(), metadata);
    requireExecutableContext(context); assert.equal(context.provenance.source, 'explicit-configuration'); assert.deepEqual(context.permissions, profile);
    await writePrivate(path, { ...profile, networkAccess: 'restricted' });
    const owner = new OwnedHost({ permissionProfile: path }); owner.ensure = async () => assert.fail('unsupported explicit network must stop before startup');
    assert.equal((await owner.request('health', {}, { protocolMeta: metadata })).limitation.code, 'NETWORK_ENFORCEMENT_UNAVAILABLE');
    for (const method of ['create', 'send', 'answer', 'approval']) await assert.rejects(owner.request(method, {}, { protocolMeta: metadata }), { code: 'NETWORK_ENFORCEMENT_UNAVAILABLE' });
  }
  for (const value of [{ ...full, writableRoots: ['relative'] }, { ...full, networkAccess: 'future' }, { ...full, approvalPolicy: 'approve-all' }, {}]) {
    await writePrivate(path, value); await assert.rejects(readPermissionContext({ permissionProfile: path }), { code: 'PERMISSION_CONFIGURATION_INVALID' });
  }
  for (const permissionProfile of ['relative', join(root, 'absent.json')]) await assert.rejects(readPermissionContext({ permissionProfile }), { code: 'PERMISSION_CONFIGURATION_INVALID' });
});

test('explicit strict configuration is honored with metadata and cannot be silently combined', async t => {
  const signed = await signedFixture(t), context = await readPermissionContext(signed.config, Date.now(), metadata);
  assert.equal(context.provenance.source, 'launcher-attested'); assert.equal(context.permissions.sandboxMode, 'workspace-write');
  await assert.rejects(readPermissionContext({ ...signed.config, permissionProfile: '/profile' }), { code: 'PERMISSION_CONTEXT_CONFLICT' });
  for (const config of [{ permissionAuthority: '/missing' }, { permissionContext: '/missing' }]) await assert.rejects(readPermissionContext(config, Date.now(), metadata), { code: 'PERMISSION_CONTEXT_REQUIRED' });
  await assert.rejects(readPermissionContext({ permissionAuthority: '/missing', permissionContext: '/missing' }), { code: 'PERMISSION_CONTEXT_INVALID' });
});

test('default create and continuation apply and check full access before native work', async () => {
  const owner = new OwnedHost({ cwd: '/work' }), context = await readPermissionContext(owner.config), calls = [];
  await assert.rejects(owner.request('create', { permissionPreset: 'danger-full-access', permissionAuthorization: 'I approve' }), { code: 'PERMISSION_AUTHORIZATION_REQUIRED' });
  const profile = { ...full, binding: context.bindingHash }, permissions = { sandbox: { mode: 'danger-full-access', workspaceRoot: '/work' }, approvalPolicy: 'never' };
  owner.entry = { permissionBinding: context.bindingHash, permissionExecution: context.execution, url: 'http://127.0.0.1:12345/' }; owner.ensure = async () => {};
  owner.gateway = { lastHealth: { host: structuredClone(owner.entry) }, request: async (method, params, options) => {
    await options?.beforeSubmit?.(); calls.push({ method, params }); return { teamId: 'root', permissionProfile: profile, permissions };
  } };
  const created = await owner.request('create', { cwd: '/work', key: 'default', text: 'Synthetic work' }, { protocolMeta: metadata });
  assert.deepEqual(calls[0].params.permissionProfile, profile); assert.equal(created.permissionSource.source, 'full-access-default');
  await owner.request('send', { teamId: 'root', inputId: 'next', text: 'Synthetic follow-up' }); permissions.approvalPolicy = 'ask';
  await assert.rejects(owner.request('send', { teamId: 'root', inputId: 'changed', text: 'Must not run' }), { code: 'PERMISSION_MISMATCH' });
  assert.equal(calls.filter(call => call.method === 'send').length, 1);
});

test('old inherited, fallback, restricted and unknown host bindings cannot be reused or upgraded', async t => {
  const context = await readPermissionContext({ cwd: '/work' });
  for (const change of [{ source: 'codex-request-metadata', backend: 'codex-sandbox-host-v1', stateJson: '{}' }, { source: 'full-access-fallback', fallbackReason: 'sandbox-metadata-unavailable' }, { source: 'explicit-configuration', permissions: { ...full, sandboxMode: 'read-only', approvalPolicy: 'ask' } }, { cwd: '/other' }, { backend: 'other' }]) await t.test(JSON.stringify(change), async () => {
    const entry = { instanceId: 'retained', permissionBinding: fingerprint({ ...context.binding, ...change }), permissionExecution: context.execution }, before = structuredClone(entry);
    const owner = new OwnedHost({ cwd: '/work' }); owner.locked = action => action(); owner.current = async () => entry;
    owner.pendingStart = () => assert.fail('no replacement startup'); owner.createGateway = () => assert.fail('no connection to mismatched host');
    for (const method of ['health', 'create', 'send']) await assert.rejects(owner.request(method, {}, { protocolMeta: metadata }), { code: 'HOST_PERMISSION_MISMATCH' });
    assert.deepEqual(entry, before); assert.equal(owner.entry, undefined);
  });
  assert.throws(() => verifyHostBinding({}, context), { code: 'HOST_PERMISSION_MISMATCH' });
});

test('responding host must match captured default execution and binding before create', async t => {
  const context = await readPermissionContext({ cwd: '/work' }), entry = { instanceId: 'retained', permissionBinding: context.bindingHash, permissionExecution: context.execution };
  for (const host of [{ permissionExecution: context.execution }, { permissionBinding: context.bindingHash }, { ...entry, permissionExecution: { ...context.execution, source: 'full-access-fallback' } }]) await t.test(JSON.stringify(host), async () => {
    const owner = new OwnedHost({ cwd: '/work' }), calls = []; owner.locked = action => action(); owner.current = async () => entry;
    owner.createGateway = () => ({ request: async method => { calls.push(method); return { host }; } });
    await assert.rejects(owner.request('create', { key: 'blocked', text: 'Must not run' }), { code: 'HOST_PERMISSION_MISMATCH' }); assert.deepEqual(calls, ['health']);
  });
});

test('actual native or OS errors propagate once without changing policy or retrying startup', async () => {
  for (const code of ['EPERM', 'EACCES', 'STARTUP_FAILED', 'STARTUP_TIMEOUT']) {
    const owner = new OwnedHost({}), error = Object.assign(new Error('Synthetic refusal'), { code }); let starts = 0;
    owner.locked = async () => { starts++; throw error; };
    await assert.rejects(owner.request('health', {}, { protocolMeta: metadata }), value => value === error); assert.equal(starts, 1); assert.equal(owner.starting, undefined);
  }
});

test('direct CLI invocation runs a native child with the existing outer process environment', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-direct-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cli = join(root, 'cli.mjs'), receipt = join(root, 'receipt');
  await writeFile(cli, `import { writeFileSync } from 'node:fs'; import { spawnSync } from 'node:child_process'; const child=spawnSync(process.execPath,['-e','process.stdout.write(process.env.DSH_SYNTHETIC_OUTER)'],{encoding:'utf8'}); writeFileSync(${JSON.stringify(receipt)},JSON.stringify({argv:process.argv.slice(2),descendant:child.stdout}));`);
  const invocation = hostInvocation({ cli, profile: 'web' }); assert.equal(invocation.executable, process.execPath);
  assert.deepEqual(invocation.argv, [cli, '--profile', 'web', '--no-open', '--host', '127.0.0.1', '--port', '0']);
  const result = spawnSync(invocation.executable, invocation.argv, { env: { ...process.env, DSH_SYNTHETIC_OUTER: 'retained' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), { argv: invocation.argv.slice(1), descendant: 'retained' });
});
