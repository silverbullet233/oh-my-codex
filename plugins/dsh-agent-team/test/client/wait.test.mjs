import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionFixture, eventually } from '../fixtures/interactions.mjs';
const opened = server => eventually(() => server.streams.get('member:follow')?.size && server.streams.get('lead:observeState')?.size);
const drained = server => eventually(() => [...server.streams.values()].every(set => !set.size));
test('wait retains owned Job settlement evidence and notices count changes before terminal completion', { timeout: 10000 }, async t => {
  const { client, server, state } = await interactionFixture(t);
  state.execution = { nativeTeamCompleted: true, ownedJobsSettled: false, jobs: { available: true, counts: { running: 1, stopping: 0 } } };
  const controller = new AbortController();
  const observing = client.request('wait', { teamId: 'lead', timeoutMs: 5000 }, { signal: controller.signal });
  await opened(server); await eventually(() => state.reads >= 2);
  controller.abort();
  const first = await observing;
  assert.equal(first.reason, 'cancelled'); assert(first.baseline); assert.equal(first.result.execution.ownedJobsSettled, false); await drained(server);
  state.execution.jobs.counts = { running: 0, stopping: 1 };
  const stopping = await client.request('wait', { teamId: 'lead', timeoutMs: 5000, after: first.baseline });
  assert.equal(stopping.reason, 'changed'); assert.equal(stopping.result.completed, false); await drained(server);
  state.completed = true; state.execution.ownedJobsSettled = true; state.execution.jobs.counts = { running: 0, stopping: 0 };
  assert.equal((await client.request('wait', { teamId: 'lead', timeoutMs: 5000, after: stopping.baseline })).reason, 'completed'); await drained(server);
});
test('wait observes cold native subagents through their durable parent address', { timeout: 10000 }, async t => {
  const { client, server } = await interactionFixture(t);
  const member = server.session('member');
  member.header.origin = 'subagent'; member.state.active = false;
  // Match the pinned native boundary rather than accepting an ordinary
  // Session address for a child, as the original transport fixture did.
  await assert.rejects(client.observation.opening('member', AbortSignal.timeout(1000)), { code: 'session/agent-busy' });
  const controller = new AbortController();
  const waiting = client.request('wait', { teamId: 'lead', timeoutMs: 5000 }, { signal: controller.signal });
  await opened(server); controller.abort();
  assert.equal((await waiting).reason, 'cancelled'); await drained(server);
  const childCalls = server.calls.filter(c => c.method === 'follow' && c.request.address.childSessionId === 'member');
  assert(childCalls.length > 0);
  for (const { request } of childCalls) {
    assert.deepEqual(request.address, { kind: 'subagent', parentSessionId: 'lead', childSessionId: 'member', mode: 'unknown' });
    assert.equal(request.activate, undefined); assert.equal(request.afterSeq, undefined);
  }
  assert.equal(member.state.active, false);
  const rootCall = server.calls.find(c => c.method === 'follow' && c.request.address.sessionId === 'lead');
  assert.deepEqual(rootCall.request.address, { kind: 'session', sessionId: 'lead' });
});
test('wait refuses a child with a foreign parent without falling back to another address', { timeout: 10000 }, async t => {
  const { client, server } = await interactionFixture(t);
  server.session('member').header.origin = 'subagent';
  server.session('member').header.parentSession = 'other';
  await assert.rejects(client.request('wait', { teamId: 'lead', timeoutMs: 1000 }), { code: 'subagent/unauthorized' });
  await drained(server);
  assert.equal(server.calls.some(c => c.method === 'follow' && c.request.address.sessionId === 'member'), false);
});
test('bounded passive wait times out, ignores token chunks, and requires whole-Team completion', { timeout: 10000 }, async t => {
  const { client, server } = await interactionFixture(t);
  const waiting = client.request('wait', { teamId: 'lead', timeoutMs: 150 });
  await opened(server);
  server.broadcast('lead', 'follow', { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a', index: 0, chunk: { type: 'text-delta', index: 0, text: 'ignored' } } });
  const result = await waiting;
  assert.equal(result.reason, 'timeout'); assert.equal(result.result.completed, false);
  assert.equal(result.status.runtimeState, 'idle'); assert(result.baseline);
  await drained(server);
  const same = await client.request('wait', { teamId: 'lead', timeoutMs: 30, after: result.baseline });
  assert.equal(same.reason, 'timeout');
  const stale = await client.request('wait', { teamId: 'lead', timeoutMs: 100, after: 'old-baseline' });
  assert.equal(stale.reason, 'changed');
  for (const call of server.calls.filter(c => c.method === 'follow')) { assert.equal(call.request.activate, undefined); assert.equal(call.request.afterSeq, undefined); }
});
test('member state changes wake a wait, completion is authoritative and streams are cleaned', { timeout: 10000 }, async t => {
  const { client, server, state } = await interactionFixture(t);
  const waiting = client.request('wait', { teamId: 'lead', timeoutMs: 1000 });
  await opened(server); await eventually(() => state.reads >= 2); await new Promise(resolve => setTimeout(resolve, 30));
  const member = server.session('member'); member.state = { ...member.state, running: true };
  server.broadcast('member', 'observeState', member.state);
  assert.equal((await waiting).reason, 'changed'); await drained(server);
  state.completed = true;
  assert.equal((await client.request('wait', { teamId: 'lead', timeoutMs: 1000 })).reason, 'completed'); await drained(server);
});
test('pending-only questions wake waits without observeState, and cancellation leaves answers responsive', { timeout: 10000 }, async t => {
  const { client, server, state } = await interactionFixture(t);
  const controller = new AbortController();
  const waiting = client.request('wait', { teamId: 'lead', timeoutMs: 1000, wakeOn: 'state' }, { signal: controller.signal });
  await opened(server);
  const native = server.interaction('user-questions/request', 'lead', { questions: [{ id: 'q', question: 'Need existing scope?' }] });
  const result = await waiting; assert.equal(result.reason, 'interaction'); await drained(server);
  const row = result.interactions[0];
  await client.request('answer', { teamId: 'lead', interactionId: row.interactionId, deliveryId: row.deliveryId, source: 'main', answers: [{ id: 'q', selected: [], custom: 'Use the approved scope.' }] });
  assert.equal((await native).kind, 'result');
  const next = client.request('wait', { teamId: 'lead', timeoutMs: 30000 }, { signal: controller.signal });
  await opened(server); controller.abort(); assert.equal((await next).reason, 'cancelled'); await drained(server);
  assert.deepEqual(await client.request('stop', { teamId: 'lead' }), {});
});
test('sequence gaps replace a passive snapshot and reconnect does not replay writes', { timeout: 10000 }, async t => {
  const { client, server, state } = await interactionFixture(t);
  const waiting = client.request('wait', { teamId: 'lead', timeoutMs: 1000 });
  await opened(server); await eventually(() => state.reads >= 2); await new Promise(resolve => setTimeout(resolve, 30));
  server.session('lead').cursor = 5;
  server.broadcast('lead', 'follow', { type: 'event', event: { type: 'synthetic/change', seq: 5, time: 0, data: {} } });
  const result = await waiting; assert.equal(result.reason, 'changed'); assert.equal(result.resynchronized, true); await drained(server);
  const reconnect = client.request('wait', { teamId: 'lead', timeoutMs: 1000 });
  await opened(server); client.socket.close();
  assert.equal((await reconnect).resynchronized, true); await drained(server);
});
test('wait rejects invalid bounds, unknown member roots and excess concurrent observations', { timeout: 10000 }, async t => {
  const { client, server } = await interactionFixture(t);
  for (const timeoutMs of [-1, 30001, 0.5]) await assert.rejects(client.request('wait', { teamId: 'lead', timeoutMs }), { code: 'INVALID_WAIT' });
  await assert.rejects(client.request('wait', { teamId: 'member' }), { code: 'team-roles/UNKNOWN_TEAM' });
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const running = controllers.map(c => client.request('wait', { teamId: 'lead', timeoutMs: 1000 }, { signal: c.signal }));
  await opened(server);
  await assert.rejects(client.request('wait', { teamId: 'lead' }), { code: 'WAIT_BUSY' });
  controllers.forEach(c => c.abort()); await Promise.all(running); await drained(server);
});
test('wait restores continued questions before reporting a completed originating turn', async t => {
  const { client, server, state } = await interactionFixture(t);
  state.completed = true;
  server.session('lead').projections.values.userQuestions = { active: [{ callId: 'continued', askedAt: 1, state: 'continued', questions: [{ id: 'q', question: 'Choose next scope?' }] }] };
  const result = await client.request('wait', { teamId: 'lead', timeoutMs: 1000 });
  assert.equal(result.reason, 'interaction'); assert.equal(result.result.completed, true); assert.equal(result.interactions[0].continued, true);
  await client.close(); assert.equal(client.interactions.pending().length, 0);
});
test('explicit client close cancels active waits without reopening an unattended answer peer', async t => {
  const { client, server, state } = await interactionFixture(t);
  const waiting = client.request('wait', { teamId: 'lead', timeoutMs: 1000 });
  await opened(server); await eventually(() => state.reads >= 2);
  await client.close(); assert.equal((await waiting).reason, 'cancelled');
  assert.equal(client.ctx, undefined); await drained(server);
  assert.equal((await client.request('health')).interactionBridge.mode, 'answer');
});
