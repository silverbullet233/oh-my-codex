/** Exercises the real manager -> Gateway -> interaction admission path without a listener. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { OwnedHost } from '../../src/host/manager.mjs';
import { GatewayClient } from '../../src/native/gateway.mjs';
import { readPermissionContext } from '../../src/host/permissions.mjs';
import { signedFixture } from '../fixtures/permission-context.mjs';

const question = { id: 'scope', question: 'Continue?', options: [{ label: 'yes' }, { label: 'no' }] };
async function fixture(t, method = 'answer', continued = true) {
  const owner = new OwnedHost({}), signed = await signedFixture(t, owner);
  const context = await readPermissionContext(owner.config);
  const entry = owner.entry = { permissionBinding: context.bindingHash, url: 'http://127.0.0.1:12345/' };
  const gateway = owner.gateway = new GatewayClient({ runtime: {}, entry });
  gateway.invalid = false;
  gateway.lastHealth = { host: { permissionBinding: context.bindingHash } };
  owner.ensure = async (_context, options) => { assert.equal(options.allowStart, false); };
  gateway.ready = async () => {};
  let status = { permissionProfile: { ...context.permissions, binding: context.bindingHash }, permissions: { sandbox: { mode: 'workspace-write', workspaceRoot: '/synthetic/workspace' }, approvalPolicy: 'ask' } };
  let onStatus, submitted = 0;
  gateway.ctx = { remote: {
    roleTeams: { status: async () => { await onStatus?.(); return { ok: true, value: status }; } },
    userQuestions: { answer: async () => { submitted++; return { ok: true, value: true }; } },
  } };
  t.after(() => gateway.interactions.invalidate());
  const payload = { questions: [{ ...question, ...(method === 'approval' ? { intent: { kind: 'approval', approve: 'yes', reject: 'no' } } : {}) }] };
  let delivery;
  if (continued) gateway.interactions.continued('root', [{ ...payload, callId: 'continued-question', state: 'continued' }]);
  else {
    gateway.interactions.authorize = async () => ({ teamId: 'root' });
    delivery = gateway.interactions.receive('questions', 'root', payload, new AbortController().signal);
    void delivery.catch(() => {});
    // receive's authority check is asynchronous.
    while (!gateway.interactions.pending().length) await new Promise(resolve => setImmediate(resolve));
  }
  const row = gateway.interactions.pending()[0];
  const params = { teamId: 'root', interactionId: row.interactionId, deliveryId: row.deliveryId,
    ...(method === 'answer' ? { source: 'main', answers: [{ id: 'scope', selected: ['yes'] }] } : { decision: 'approve', authorization: 'Explicit one-shot synthetic user grant.' }) };
  return { owner, gateway, signed, params, status, delivery, submitted: () => submitted,
    setStatus: value => { status = value; }, onStatus: fn => { onStatus = fn; } };
}

for (const method of ['answer', 'approval']) {
  test(`${method} rejects unknown/expired context, host mismatch and absent/changed Team policy before native continuation`, async t => {
    for (const failure of ['unknown', 'expired', 'host-record', 'host-response', 'legacy-team', 'team-binding', 'team-policy', 'native-policy']) await t.test(failure, async t => {
      const f = await fixture(t, method);
      if (failure === 'unknown') f.owner.config.permissionContext = undefined;
      if (failure === 'expired') await f.signed.write({ ...f.signed.payload, expiresAt: 1 });
      if (failure === 'host-record') f.owner.entry.permissionBinding = 'other';
      if (failure === 'host-response') f.gateway.lastHealth.host.permissionBinding = 'other';
      if (failure === 'legacy-team') f.setStatus({});
      if (failure === 'team-binding') f.status.permissionProfile.binding = 'other';
      if (failure === 'team-policy') f.status.permissionProfile.approvalPolicy = 'never';
      if (failure === 'native-policy') f.status.permissions.approvalPolicy = 'never';
      await assert.rejects(f.owner.request(method, f.params), error => /^(PERMISSION_|HOST_PERMISSION_)/.test(error.code));
      assert.equal(f.submitted(), 0);
      assert.equal(f.gateway.interactions.pending().length, 1);
    });
  });

  test(`${method} rechecks context after reconnect and Team observation, then allows a fresh authorized retry`, async t => {
    const f = await fixture(t, method);
    f.onStatus(() => f.signed.write({ ...f.signed.payload, expiresAt: 1 }));
    await assert.rejects(f.owner.request(method, f.params), { code: 'PERMISSION_CONTEXT_INVALID' });
    assert.equal(f.submitted(), 0);
    assert.equal(f.gateway.interactions.pending().length, 1);
    f.onStatus(undefined); await f.signed.write();
    f.gateway.ready = async () => { f.gateway.lastHealth.host.permissionBinding = 'reconnected-other-boundary'; };
    await assert.rejects(f.owner.request(method, f.params), { code: 'HOST_PERMISSION_MISMATCH' });
    assert.equal(f.submitted(), 0);
    f.gateway.ready = async () => {}; f.gateway.lastHealth.host.permissionBinding = f.owner.entry.permissionBinding;
    assert.equal((await f.owner.request(method, f.params)).confirmation, 'native-admitted');
    assert.equal((await f.owner.request(method, f.params)).duplicate, true);
    assert.equal(f.submitted(), 1);
  });

  test(`${method} checks live streamed replies before resolving native delivery`, async t => {
    const f = await fixture(t, method, false);
    f.onStatus(() => f.signed.write({ ...f.signed.payload, expiresAt: 1 }));
    await assert.rejects(f.owner.request(method, f.params), { code: 'PERMISSION_CONTEXT_INVALID' });
    assert.equal(f.gateway.interactions.pending().length, 1);
    f.onStatus(undefined); await f.signed.write();
    assert.equal((await f.owner.request(method, f.params)).submitted, true);
    assert.deepEqual(await f.delivery, { answers: [{ id: 'scope', selected: ['yes'] }] });
  });
}

test('a continued denial also requires permission context because it enqueues native continuation', async t => {
  const f = await fixture(t, 'approval');
  f.owner.config.permissionContext = undefined;
  await assert.rejects(f.owner.request('approval', { ...f.params, decision: 'deny', authorization: undefined }), { code: 'PERMISSION_CONTEXT_REQUIRED' });
  assert.equal(f.submitted(), 0);
});

test('stop, withdrawal, escalation and observations keep the existing-host-only path without a context', async () => {
  const owner = new OwnedHost({}); let calls = 0;
  owner.ensure = async (context, { allowStart }) => { assert.equal(context, null); assert.equal(allowStart, false); };
  owner.gateway = { request: async () => { calls++; return {}; } };
  for (const method of ['stop', 'withdrawInput', 'escalate', 'status', 'pending', 'result']) await owner.request(method, { teamId: 'root' });
  assert.equal(calls, 6);
});
