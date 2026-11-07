import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayClient } from '../../src/native/gateway.mjs';
import { loadRuntime } from '../../src/native/runtime.mjs';
import { ownedFixture } from '../fixtures/owned.mjs';
import { serveNativeFixture, contract } from '../fixtures/native-server.mjs';

const status = (teamId) => ({ teamId, sessionId: teamId, team: { members: [{ id: teamId }] } });

async function fixture(t) {
  const owned = await ownedFixture(t);
  const calls = [];
  const server = await serveNativeFixture({ health: contract, dispatch: async (method, params) => {
    calls.push({ method, params });
    if (method === 'health') return {};
    if (method === 'status') return status(params.teamId);
    throw new Error(`unexpected synthetic method: ${method}`);
  } });
  const connects = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input, 'http://fixture.invalid');
    if (url.pathname === '/connect') connects.push(url.searchParams.get('interactions'));
    return originalFetch(input, init);
  };
  t.after(async () => { globalThis.fetch = originalFetch; await server.close(); });
  const runtime = await loadRuntime(owned.runtime);
  const client = (interactionMode) => new GatewayClient({ runtime, entry: { url: server.url, pid: process.pid, instanceId: null }, ...(interactionMode === undefined ? {} : { interactionMode }) });
  return { server, calls, connects, client };
}

test('default native clients remain answer mode and passive clients declare interactions=none', async t => {
  const f = await fixture(t);
  const answer = f.client();
  const passive = f.client('none');
  t.after(async () => { await answer.close(); await passive.close(); });
  assert.equal(answer.interactionMode, 'answer');
  assert.equal(passive.interactionMode, 'none');
  assert(answer.interactions !== null, 'foreground clients keep the answer/claim queue');
  assert.equal(passive.interactions, null, 'passive clients must not create an interaction queue');

  assert.equal((await answer.request('status', { teamId: 'lead' })).teamId, 'lead');
  assert.equal((await passive.request('status', { teamId: 'lead' })).teamId, 'lead');
  assert.deepEqual(f.connects, ['answer', 'none']);
  assert.throws(() => new GatewayClient({ runtime: undefined, entry: {}, interactionMode: 'claim' }), { code: 'INVALID_INTERACTION_MODE' });
});

test('passive clients refuse interaction and wait methods without native dispatch', async t => {
  const f = await fixture(t);
  const passive = f.client('none');
  t.after(() => passive.close());
  await passive.request('status', { teamId: 'lead' });
  const before = f.calls.length;
  for (const [method, params] of [['pending', { teamId: 'lead' }], ['answer', { teamId: 'lead', interactionId: 'i', deliveryId: 'd', answers: [], source: 'main' }], ['approval', { teamId: 'lead', interactionId: 'i', deliveryId: 'd', decision: 'deny' }], ['escalate', { teamId: 'lead', interactionId: 'i', deliveryId: 'd', reason: 'synthetic' }], ['wait', { teamId: 'lead' }]]) {
    await assert.rejects(passive.request(method, params), { code: 'INTERACTION_DISABLED' });
  }
  assert.equal(f.calls.length, before, 'passive interface methods must not reach the native host');
  assert.deepEqual(f.calls.map(call => call.method), ['health', 'status']);
  assert.equal(f.server.claims.size, 0);
  assert.equal(f.server.continuedAnswers.length, 0);
});

test('passive health reporting is explicit and does not advertise answer-mode delivery', async t => {
  const f = await fixture(t);
  const answer = f.client('answer');
  const passive = f.client('none');
  t.after(async () => { await answer.close(); await passive.close(); });
  assert.equal((await answer.request('health')).interactionBridge.mode, 'answer');
  const health = await passive.request('health');
  assert.equal(health.interactionBridge.mode, 'none');
  assert.equal(health.interactionBridge.pendingCount, 0);
  assert.deepEqual(health.interactionBridge.teamIds, []);
});
