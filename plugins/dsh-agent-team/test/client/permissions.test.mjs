import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { OwnedHost, configuration } from '../../src/host/manager.mjs';
import { signedFixture } from '../fixtures/permission-context.mjs';
import { readPermissionContext, selectPermissions, verifyHostBinding, verifyNativePermissions } from '../../src/host/permissions.mjs';


test('no flags, Codex-looking env or ordinary config default establish effective permissions', async () => {
  const config = configuration({ CODEX_SANDBOX: 'danger-full-access', CODEX_YOLO: 'true', DSH_AGENT_TEAM_PERMISSION_AUTHORITY: '/forged' });
  assert.equal(config.permissionAuthority, undefined);
  await assert.rejects(readPermissionContext(config), { code: 'PERMISSION_CONTEXT_REQUIRED' });
  const owner = new OwnedHost({}); let calls = 0;
  owner.ensure = async () => calls++;
  await assert.rejects(owner.request('create', {}), { code: 'PERMISSION_CONTEXT_REQUIRED' });
  assert.equal(calls, 0);
});

test('signed restricted and actual YOLO launch statements map all four permission dimensions honestly', async t => {
  const f = await signedFixture(t);
  const context = await readPermissionContext(f.config);
  assert.deepEqual(context.permissions, { sandboxMode: 'workspace-write', approvalPolicy: 'ask', writableRoots: ['/synthetic/workspace'], networkAccess: 'restricted' });
  assert.equal(context.provenance.signatureVerified, true); assert.equal(context.provenance.osLimitsVerified, false);
  f.payload.permissions = { sandboxMode: 'danger-full-access', approvalPolicy: 'never', writableRoots: [], networkAccess: 'enabled' };
  await f.write();
  assert.equal(selectPermissions(await readPermissionContext(f.config), {}).sandboxMode, 'danger-full-access');
});

test('forged signatures, altered payloads, expiry, wrong process, unsupported approval and malformed roots fail closed', async t => {
  const f = await signedFixture(t);
  await f.write({ ...f.payload, basis: 'declared-configuration', permissions: { sandboxMode: 'danger-full-access', approvalPolicy: 'never', writableRoots: [], networkAccess: 'enabled' } });
  await assert.rejects(readPermissionContext(f.config), { code: 'PERMISSION_CONTEXT_UNVERIFIED' });
  const other = generateKeyPairSync('ed25519');
  await f.write(f.payload, other.privateKey);
  await assert.rejects(readPermissionContext(f.config), { code: 'PERMISSION_CONTEXT_INVALID' });
  for (const change of [{ audience: 'other-process' }, { expiresAt: 1 }, { issuedAt: Date.now() + 10000 }, { permissions: { ...f.payload.permissions, approvalPolicy: 'untrusted' } }, { permissions: { ...f.payload.permissions, writableRoots: ['relative'] } }, { permissions: { ...f.payload.permissions, networkAccess: 'unknown' } }]) {
    await f.write({ ...f.payload, ...change });
    await assert.rejects(readPermissionContext(f.config), { code: 'PERMISSION_CONTEXT_INVALID' });
  }
  const link = join(f.root, 'link.json'); await symlink(f.config.permissionContext, link);
  await assert.rejects(readPermissionContext({ ...f.config, permissionContext: link }), { code: 'PERMISSION_CONTEXT_INVALID' });
});

test('explicit overrides require the signed user grant, never a self-authored acknowledgement', async t => {
  const f = await signedFixture(t);
  f.payload.overrides = [{ id: 'user-grant-1', preset: 'read-only', permissions: { sandboxMode: 'read-only', approvalPolicy: 'on-request', writableRoots: [], networkAccess: 'restricted' } }];
  await f.write(); const context = await readPermissionContext(f.config);
  for (const params of [{ permissionPreset: 'danger-full-access' }, { permissionPreset: 'read-only', permissionAuthorization: 'I approve' }, { permissionAuthorization: 'user-grant-1' }]) assert.throws(() => selectPermissions(context, params), { code: 'PERMISSION_AUTHORIZATION_REQUIRED' });
  assert.equal(selectPermissions(context, { permissionPreset: 'read-only', permissionAuthorization: 'user-grant-1' }).sandboxMode, 'read-only');
});

test('retained hosts require matching recorded and responding launch boundaries; exact native roots are checked', async t => {
  const f = await signedFixture(t), context = await readPermissionContext(f.config);
  const entry = { permissionBinding: context.bindingHash }, health = { host: { permissionBinding: context.bindingHash } };
  verifyHostBinding(entry, context, health);
  for (const [record, response] of [[{}, health], [entry, { host: {} }], [{ permissionBinding: 'other' }, health]]) assert.throws(() => verifyHostBinding(record, context, response), { code: 'HOST_PERMISSION_MISMATCH' });
  const actual = { sandbox: { mode: 'workspace-write', workspaceRoot: '/synthetic/workspace' }, approvalPolicy: 'ask' };
  verifyNativePermissions(actual, context.permissions);
  assert.throws(() => verifyNativePermissions({ ...actual, sandbox: { ...actual.sandbox, additionalWritableRoots: ['/extra'] } }, context.permissions), { code: 'PERMISSION_MISMATCH' });
});

test('OwnedHost create inherits detached signed values and send refuses legacy or changed Team intents', async t => {
  const owner = new OwnedHost({}), f = await signedFixture(t, owner);
  const context = await readPermissionContext(f.config), calls = [];
  owner.entry = { permissionBinding: context.bindingHash, url: 'http://127.0.0.1:12345/' };
  owner.ensure = async () => {};
  const profile = { ...context.permissions, binding: context.bindingHash };
  let status = { permissionProfile: profile };
  owner.gateway = { request: async (method, params) => { calls.push({ method, params }); if (method === 'status') return status; return { teamId: 'root', permissions: { sandbox: { mode: profile.sandboxMode, workspaceRoot: '/synthetic/workspace' }, approvalPolicy: profile.approvalPolicy } }; } };
  await owner.request('create', { key: 'one', cwd: '/synthetic/workspace', text: 'Synthetic task' });
  assert.deepEqual(calls[0].params.permissionProfile, profile);
  await owner.request('send', { teamId: 'root', inputId: 'next', text: 'Synthetic follow-up' });
  status = {};
  await assert.rejects(owner.request('send', { teamId: 'root', inputId: 'blocked', text: 'Synthetic follow-up' }), { code: 'PERMISSION_MISMATCH' });
  assert.equal(calls.filter(call => call.method === 'send').length, 1);
});

test('expired or replaced context after host preparation cannot admit create input', async t => {
  const owner = new OwnedHost({}), f = await signedFixture(t, owner);
  const context = await readPermissionContext(f.config);
  owner.entry = { permissionBinding: context.bindingHash, url: 'http://127.0.0.1:12345/' };
  owner.ensure = async () => { await f.write({ ...f.payload, expiresAt: Date.now() - 1 }); };
  owner.gateway = { request: () => assert.fail('expired context must not reach native admission') };
  await assert.rejects(owner.request('create', { key: 'expiry', cwd: '/synthetic/workspace', text: 'Synthetic task' }), { code: 'PERMISSION_CONTEXT_INVALID' });
});
