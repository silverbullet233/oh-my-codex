import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionQueue } from '../../src/native/interactions.mjs';
const question = { questions: [{ id: 'design', question: 'Which scope?', options: [{ label: 'existing' }, { label: 'new' }] }] };
const answer = { answers: [{ id: 'design', selected: ['existing'] }], source: 'main' };
const ids = row => ({ teamId: row.teamId, interactionId: row.interactionId, deliveryId: row.deliveryId });
import { eventually, interactionFixture as fixture } from '../fixtures/interactions.mjs';
const pending = client => eventually(() => client.interactions.pending()[0]);

test('official answer transport resolves Lead questions, escalation and duplicate receipts', { timeout: 10000 }, async t => {
  const { server, client } = await fixture(t);
  const native = server.interaction('user-questions/request', 'lead', question);
  const row = await pending(client);
  assert.equal(row.agentId, 'lead'); assert.equal(row.kind, 'question');
  await client.request('escalate', { ...ids(row), reason: 'New product decision requires the user.' });
  await assert.rejects(client.request('answer', { ...ids(row), ...answer }), { code: 'USER_DECISION_REQUIRED' });
  const reply = { ...ids(row), ...answer, source: 'user' };
  assert.equal((await client.request('answer', reply)).confirmation, 'not-confirmed-by-native');
  assert.equal((await client.request('answer', reply)).duplicate, true);
  assert.deepEqual(await native, { kind: 'result', value: { answers: answer.answers } });
  await assert.rejects(client.request('answer', { ...reply, answers: [{ id: 'design', selected: ['new'] }] }), { code: 'INTERACTION_CONFLICT' });
  assert.equal(client.interactions.pending().length, 0);
  for (const call of server.calls.filter(c => c.method === 'follow')) {
    assert.equal(call.request.activate, undefined); assert.equal(call.request.afterSeq, undefined);
  }
});

test('native cancellation, disconnect replay and fresh delivery tokens reject stale answers', { timeout: 10000 }, async t => {
  const { server, client } = await fixture(t);
  const controller = new AbortController();
  const native = server.interaction('user-questions/request', 'lead', { ...question, wait: { callId: 'call-1', timed: false } }, controller.signal);
  const first = await pending(client);
  client.socket.close();
  await eventually(() => client.invalid); await client.ready();
  const replay = await eventually(() => client.interactions.pending().find(r => r.deliveryId !== first.deliveryId));
  assert.equal(first.interactionId, replay.interactionId);
  await assert.rejects(client.request('answer', { ...ids(first), ...answer }), { code: 'STALE_INTERACTION' });
  assert.equal((await client.request('answer', { ...ids(replay), ...answer })).submitted, true);
  assert.equal((await native).kind, 'result');
  const cancel = new AbortController();
  void server.interaction('user-questions/request', 'lead', question, cancel.signal);
  const cancelled = await pending(client); cancel.abort();
  await eventually(() => client.interactions.pending().length === 0);
  await assert.rejects(client.request('answer', { ...ids(cancelled), ...answer }), { code: 'STALE_INTERACTION' });
});

test('member questions and unrostered authority events are delegated, native member approval is explicit', { timeout: 10000 }, async t => {
  const { server, client } = await fixture(t);
  assert.deepEqual(await server.interaction('user-questions/request', 'member', question), { kind: 'next' });
  server.session('fork').header.parentSession = 'lead';
  assert.deepEqual(await server.interaction('approval/request', 'fork', { toolName: 'write', reason: 'scope' }), { kind: 'next' });
  const member = server.session('member');
  member.records = [{ type: 'event', event: { type: 'approval/asked', seq: 1, time: 0, data: { id: 'approval-1', toolName: 'write', callId: 'tool-1', reason: 'scope' } } }]; member.cursor = 1;
  const native = server.interaction('approval/request', 'member', { toolName: 'write', callId: 'tool-1', reason: 'scope' });
  const row = await pending(client); assert.equal(row.teamId, 'lead'); assert.equal(row.kind, 'approval'); assert.equal(row.correlationId, 'approval-1');
  await assert.rejects(client.request('answer', { ...ids(row), ...answer }), { code: 'INTERACTION_KIND' });
  await assert.rejects(client.request('approval', { ...ids(row), decision: 'approve' }), { code: 'USER_DECISION_REQUIRED' });
  await assert.rejects(client.request('approval', { ...ids(row), teamId: 'other', decision: 'deny' }), { code: 'STALE_INTERACTION' });
  await client.request('approval', { ...ids(row), decision: 'approve', authorization: 'User explicitly approved this single synthetic write.' });
  assert.deepEqual(await native, { kind: 'result', value: 'allowed-once' });
});

test('permission-shaped questions cannot bypass the separate approval tool or select always', async t => {
  const { server, client } = await fixture(t);
  const native = server.interaction('user-questions/request', 'lead', { questions: [{ id: 'permit', question: 'Allow?', options: [{ label: 'yes' }, { label: 'no' }, { label: 'always' }], intent: { kind: 'approval', approve: 'yes', reject: 'no', always: 'always' } }] });
  const row = await pending(client); assert.equal(row.kind, 'approval');
  await assert.rejects(client.request('answer', { ...ids(row), source: 'user', answers: [{ id: 'permit', selected: ['always'] }] }), { code: 'INTERACTION_KIND' });
  await client.request('approval', { ...ids(row), decision: 'deny' });
  assert.deepEqual(await native, { kind: 'result', value: { answers: [{ id: 'permit', selected: ['no'] }] } });
  const member = server.interaction('user-questions/request', 'member', { questions: [{ id: 'permit', question: 'Allow native member authority?', options: [{ label: 'yes' }, { label: 'no' }], intent: { kind: 'approval', approve: 'yes', reject: 'no' } }] });
  const authority = await pending(client); assert.equal(authority.agentId, 'member');
  await client.request('approval', { ...ids(authority), decision: 'deny' }); assert.equal((await member).kind, 'result');
});

test('cancelled calls cannot answer or grant authority and audit ambiguity fails closed across pages', async t => {
  const { client, server } = await fixture(t);
  const lead = server.session('lead'); lead.hasMore = true;
  lead.cursor = 10;
  const audit = id => ({ type: 'event', event: { type: 'approval/asked', seq: id === 'old' ? 1 : 10, time: 0, data: { id, toolName: 'write', reason: 'scope' } } });
  lead.records = [audit('new')];
  server.ctx.sessionController.events = async () => ({ cursor: 10, records: [audit('old')], hasMore: false });
  await assert.rejects(server.interaction('approval/request', 'lead', { toolName: 'write', reason: 'scope' }), { code: 'INTERACTION_CORRELATION' });
  assert.equal(client.interactions.pending().length, 0);
  lead.hasMore = false; lead.records = [audit('unique')];
  const native = server.interaction('approval/request', 'lead', { toolName: 'write', reason: 'scope' });
  const row = await pending(client), cancelled = AbortSignal.abort(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }));
  await assert.rejects(client.request('approval', { ...ids(row), decision: 'approve', authorization: 'Approved synthetic action.' }, { signal: cancelled }), { code: 'CANCELLED' });
  assert.equal(client.interactions.pending().length, 1);
  await client.request('approval', { ...ids(row), decision: 'deny' }); assert.equal((await native).value, 'rejected');
});

test('continued questions deduplicate at capacity, serialize replies, reconcile and invalidate on close', async t => {
  const { client, server } = await fixture(t);
  const active = [{ callId: 'continued', questions: question.questions, state: 'continued' }];
  // Official native projection includes its asked-at log identity.
  active[0].askedAt = 1;
  server.session('lead').projections.values.userQuestions = { active };
  const row = (await client.request('pending', { teamId: 'lead' })).interactions[0];
  const reply = { ...ids(row), ...answer };
  assert.equal((await client.request('answer', reply)).confirmation, 'native-admitted');
  assert.equal(server.continuedAnswers.length, 1);
  assert.equal((await client.request('pending', { teamId: 'lead' })).interactions.length, 0);
  await client.close();
  await assert.rejects(client.interactions.answer(reply), { code: 'STALE_INTERACTION' });
  const gate = Promise.withResolvers(); let calls = 0;
  const queue = new InteractionQueue({ instanceId: 'continued', maxPending: 1, answerContinued: async () => { calls++; return gate.promise; } });
  t.after(() => queue.invalidate());
  queue.continued('lead', active); queue.continued('lead', active);
  const item = queue.pending()[0], params = { ...ids(item), ...answer };
  const first = queue.answer(params), second = queue.answer(params);
  await assert.rejects(queue.answer({ ...params, answers: [{ id: 'design', selected: ['new'] }] }), { code: 'INTERACTION_CONFLICT' });
  gate.resolve(true); await Promise.all([first, second]); assert.equal(calls, 1);
  queue.continued('lead', []); queue.invalidate(); queue.continued('lead', active);
  assert.notEqual(queue.pending()[0].deliveryId, item.deliveryId);
  queue.continued('lead', []); assert.equal(queue.pending().length, 0); assert.equal(queue.bytes, 0);
});

test('equivalent reordered replies share in-flight submission and completed receipts', async t => {
  const gate = Promise.withResolvers(); let calls = 0;
  const queue = new InteractionQueue({ instanceId: 'retry', answerContinued: async () => { calls++; return gate.promise; } });
  t.after(() => queue.invalidate());
  queue.continued('lead', [{ callId: 'retry-call', questions: question.questions, state: 'continued' }]);
  const identity = ids(queue.pending()[0]);
  const original = { ...identity, ...answer };
  const reordered = { source: original.source, answers: original.answers.map(a => ({ selected: a.selected, id: a.id })), deliveryId: identity.deliveryId, interactionId: identity.interactionId, teamId: identity.teamId };
  const replies = Promise.all([queue.answer(original), queue.answer(reordered)]);
  gate.resolve(true);
  const receipts = await replies;
  assert.equal(receipts[1].duplicate, true); assert.equal(calls, 1);
  assert.equal((await queue.answer(reordered)).duplicate, true);
});

test('projection reconciliation ignores older cuts and responses from a prior connection', async t => {
  const { client, server } = await fixture(t);
  const snapshot = (seq, callId) => ({ kind: 'sequenced', asOfSeq: seq, values: { userQuestions: { active: callId ? [{ callId, questions: question.questions, state: 'continued' }] : [], settled: [] } } });
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let first = true, current = snapshot(2, 'new');
  server.ctx.sessionController.projections = async () => { if (first) { first = false; entered.resolve(); return release.promise; } return current; };
  const older = client.refreshPending('lead'); await entered.promise;
  try {
    await client.refreshPending('lead'); const fresh = client.interactions.pending('lead')[0];
    release.resolve(snapshot(1)); await older;
    assert.equal(client.interactions.pending('lead')[0]?.deliveryId, fresh.deliveryId);
    current = snapshot(3); await client.refreshPending('lead');
    current = snapshot(2, 'new'); await client.refreshPending('lead');
    assert.equal(client.interactions.pending('lead').length, 0);
    const nativeRead = client.observation.unary.bind(client.observation);
    for (const outcome of ['value', 'failure']) {
      const late = Promise.withResolvers();
      client.observation.unary = () => late.promise;
      const previousConnection = client.refreshPending('lead');
      await client.close(); await client.ready(); client.observation.unary = nativeRead;
      current = snapshot(1, 'reconnected'); await client.refreshPending('lead');
      const reconnected = client.interactions.pending('lead')[0]; assert(reconnected);
      if (outcome === 'value') late.resolve(snapshot(50, 'stale-connection'));
      else late.reject(Object.assign(new Error('Old connection was disposed'), { code: 'gateway/cancelled' }));
      await previousConnection;
      assert.equal(client.interactions.pending('lead')[0].deliveryId, reconnected.deliveryId);
    }
  } finally { release.resolve(snapshot(1)); }
});

test('timed native waits claim an answer window and retain it through result transmission', { timeout: 10000 }, async t => {
  const { server, client } = await fixture(t);
  const cancel = new AbortController();
  const native = server.interaction('user-questions/request', 'lead', { ...question, wait: { callId: 'timed', timed: true } }, cancel.signal);
  const row = await pending(client); await eventually(() => server.claims.has('timed'));
  await client.request('answer', { ...ids(row), ...answer });
  assert.equal((await native).kind, 'result');
  await eventually(() => !server.claims.has('timed'));
});

test('queue validates answers, bounds pending payloads, expires and recovers failed claims', async () => {
  const queue = new InteractionQueue({ instanceId: 'unit', authorize: async () => ({ teamId: 'lead', correlationId: 'same' }), maxPending: 2, timeoutMs: 20, claimTimed: async () => { throw new Error('claim ended'); } });
  const failed = queue.receive('questions', 'lead', { ...question, wait: { callId: 'same', timed: true } }, new AbortController().signal);
  await assert.rejects(failed, /claim ended/);
  assert.equal(queue.pending().length, 0); assert.equal(queue.bytes, 0);
  const native = queue.receive('questions', 'lead', question, new AbortController().signal);
  const row = await pending({ interactions: queue });
  await assert.rejects(queue.answer({ ...ids(row), source: 'main', answers: [{ id: 'design', selected: ['missing'] }] }), { code: 'INVALID_ANSWER' });
  await assert.rejects(native, { code: 'INTERACTION_EXPIRED' }); assert.equal(queue.pending().length, 0);
  await assert.rejects(queue.receive('questions', 'lead', { questions: [{ id: 'big', question: 'x'.repeat(65536) }] }, new AbortController().signal), { code: 'INTERACTION_QUEUE_FULL' });
});
