import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedObservation, SUMMARY_BYTES } from '../../src/mcp/summary.mjs';
import { createDispatcher } from '../../src/mcp/server.mjs';
import { createExactRequestClient } from '../../src/mcp/exact-request.mjs';

const bytes = value => Buffer.byteLength(JSON.stringify(value));
const rpc = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

test('summary preserves scoped Job evidence, conservative unknown and the body budget', () => {
  const evidence = { nativeTeamCompleted: true, ownedJobsSettled: false, atomic: false, admissionBarrier: false, goalAccepted: null,
    jobs: { available: true, rootAsOfSeq: 8, ownerScopeUnchangedAtCheck: true, sameRootCut: true, counts: { running: 1, stopping: 0, completed: 0, killed: 0, failed: 0 } } };
  const result = boundedObservation('result', { completed: false, execution: evidence });
  assert.equal(result.structuredContent.execution.nativeTeamCompleted, true); assert.equal(result.structuredContent.execution.ownedJobsSettled, false);
  assert.equal(result.structuredContent.state.completed, false); assert.equal(result.structuredContent.execution.admissionBarrier, false);
  assert.equal(result.structuredContent.completionScope, 'native-team-and-observed-owned-jobs'); assert(bytes(result) <= SUMMARY_BYTES);
  assert.equal(boundedObservation('result', { completed: null }).structuredContent.execution, null);
  assert.equal(boundedObservation('status', { teamCompleted: true }).structuredContent.completionScope, 'native-team-only');
});

test('huge native observations produce bounded Unicode previews and explicit omissions', () => {
  const raw = { teamId: 'lead', completed: null, output: '中文🙂'.repeat(10000), outputSource: { turn: 2, seq: 9, truncated: true },
    inputs: Array.from({ length: 4096 }, () => ({ text: 'OMITTED_INPUT_PAYLOAD' })), errors: [{ message: 'RETAINED_ERROR_MESSAGE' }],
    teamActivity: { members: Array.from({ length: 100 }, (_, i) => ({ id: `member-${i}`, name: `worker-${i}`, role: 'worker', payload: 'OMITTED_MEMBER_PAYLOAD' })) }, asOfSeq: 10 };
  const result = boundedObservation('result', raw);
  assert(bytes(result) <= SUMMARY_BYTES);
  const summary = result.structuredContent;
  assert.equal(summary.output.text.isWellFormed(), true); assert(summary.output.previewTruncated);
  assert.equal(summary.output.source.truncated, true); assert.equal(summary.state.completed, null); assert.equal(summary.state.goalAccepted, null);
  assert.equal(summary.members.returnedCount, 100); assert.equal(summary.members.items.length, 8); assert.equal(summary.members.omitted, 92);
  assert.equal(summary.retainedEntryCounts.inputs, 4096); assert.equal(summary.retainedEntryCounts.errors, 1);
  // Retained error history is the one payload deliberately sampled by the summary;
  // oversized input/member payloads remain omitted rather than previewed.
  assert.equal(summary.retainedErrors.samples[0].seq, null); assert.equal(summary.retainedErrors.samples[0].message, 'RETAINED_ERROR_MESSAGE');
  assert.doesNotMatch(JSON.stringify(result), /OMITTED_(INPUT|MEMBER)_PAYLOAD/);
  assert.deepEqual(JSON.parse(result.content[0].text), summary);
});

test('escape-heavy identifiers count both representations and are omitted rather than clipped', async () => {
  const marker = '\u0001'.repeat(256), oversized = 'x'.repeat(257);
  const raw = { teamId: marker, output: '\u0001'.repeat(10000), baseline: marker,
    teamActivity: { members: Array.from({ length: 20 }, () => ({ id: oversized, name: marker, role: marker, phase: marker, runtimeState: marker })) } };
  const result = boundedObservation('wait', { ...raw, result: raw, status: null, interactions: [] });
  assert(bytes(result) <= SUMMARY_BYTES);
  const summary = result.structuredContent;
  assert.equal(summary.reducedForBudget, true); assert.equal(summary.members.items.length, 0); assert.equal(summary.members.omitted, 20);
  assert.equal(summary.teamId, marker); assert.equal(summary.baseline, marker);
  const smaller = boundedObservation('status', { teamId: 'lead', team: { members: [{ id: oversized, name: 'short' }] } });
  assert.equal(smaller.structuredContent.members.items[0].id, null);
  const hostile = { ...raw, taskState: marker, runtimeState: marker, rootTurnState: marker, asOfSeqScope: marker, turns: { lastEnded: { turn: 1, seq: 2, reason: marker } } };
  const tooLarge = { ...hostile, status: hostile, result: hostile, reason: marker };
  assert.throws(() => boundedObservation('wait', tooLarge), { code: 'SUMMARY_LIMIT' });
  const dispatch = createDispatcher({ request: async () => tooLarge }); await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const failure = await dispatch(rpc(2, 'dsh_team_wait', { teamId: 'lead', view: 'summary' }));
  assert.equal(failure.result.isError, true); assert(bytes(failure.result) < 512); assert.match(failure.result.content[0].text, /SUMMARY_LIMIT/);
});

test('wait summaries keep distinct source cuts and never replace unknown authoritative completion', () => {
  const result = boundedObservation('wait', { teamId: 'lead', reason: 'interaction', baseline: 'opaque', resynchronized: true,
    status: { sessionId: 'lead', asOfSeq: 10, asOfSeqScope: 'root-session', teamCompleted: true },
    result: { asOfSeq: 11, asOfSeqScope: 'root-session', completed: null },
    interactions: [{ interactionId: 'full-id', questions: [{ id: 'exact', options: ['DO_NOT_TRUNCATE_OPTION'] }] }] });
  const summary = result.structuredContent;
  assert.equal(summary.atomic, false); assert.equal(summary.sourceCuts.status.asOfSeq, 10); assert.equal(summary.sourceCuts.result.asOfSeq, 11);
  assert.equal(summary.state.completed, null); assert.equal(summary.reason, 'interaction'); assert.equal(summary.baseline, 'opaque');
  assert.equal(summary.pendingInteractions.count, 1); assert.equal(summary.pendingInteractions.questionPayloadIncluded, false);
  assert.equal(summary.pendingInteractions.exactDetailsTool, 'dsh_team_pending'); assert.doesNotMatch(JSON.stringify(summary), /DO_NOT_TRUNCATE_OPTION/);
  const cancelled = boundedObservation('wait', { teamId: 'lead', reason: 'cancelled', status: null, result: null, interactions: [] }).structuredContent;
  assert.equal(cancelled.state.completed, null); assert.equal(cancelled.reason, 'cancelled'); assert.equal(cancelled.output.available, false);
  assert.equal(boundedObservation('wait', { status: { teamCompleted: true }, result: null }).structuredContent.state.completed, null);
});

test('summary works through pinned native transport without a new host capability', async t => {
  const [{ ownedFixture }, { serveNativeFixture }, { GatewayClient }, { loadRuntime }] = await Promise.all([
    import('../fixtures/owned.mjs'), import('../fixtures/native-server.mjs'), import('../../src/native/gateway.mjs'), import('../../src/native/runtime.mjs'),
  ]);
  const owned = await ownedFixture(t), calls = [];
  const server = await serveNativeFixture({ dispatch: async (method, params) => {
    calls.push({ method, params });
    if (method === 'status') throw Object.assign(new Error('中文🙂'.repeat(5000)), { code: 'team-roles/NATIVE_ERROR_LARGE' });
    return method === 'result' ? { teamId: 'lead', completed: null, output: '中文🙂'.repeat(5000), asOfSeq: 10, inputs: [{ id: 'retained' }] } : {};
  } });
  const client = new GatewayClient({ runtime: await loadRuntime(owned.runtime), entry: { url: server.url, pid: process.pid, instanceId: null } });
  t.after(async () => { await client.close(); await server.close(); });
  const dispatch = createDispatcher(client); await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const reply = await dispatch(rpc(2, 'dsh_team_result', { teamId: 'lead', view: 'summary' }));
  assert(bytes(reply.result) <= SUMMARY_BYTES); assert.equal(reply.result.structuredContent.output.previewTruncated, true);
  assert.equal(reply.result.structuredContent.sourceCuts.result.scope, 'unknown'); assert.equal(reply.result.structuredContent.output.source, null);
  assert.deepEqual(calls.map(c => c.method), ['health', 'result']); assert.deepEqual(calls[1].params, { teamId: 'lead' });
  assert.equal(client.lastHealth.api.capabilities.includes('ended-turn-results'), false);
  const failed = (await dispatch(rpc(3, 'dsh_team_status', { teamId: 'lead', view: 'summary' }))).result;
  assert.equal(failed.isError, true); assert(bytes(failed) <= SUMMARY_BYTES);
  assert.equal(JSON.parse(failed.content[0].text).code, 'team-roles/NATIVE_ERROR_LARGE');
  assert.equal(JSON.parse(failed.content[0].text).messageOmitted, true);
});

test('MCP summary is opt-in, strips presentation arguments and preserves full native payloads by default', async () => {
  const calls = [], errors = [{ seq: 12, message: 'retained native failure' }], raw = { teamId: 'lead', output: 'native full', inputs: [{ id: 'exact-input' }], errors };
  const dispatch = createDispatcher({ request: async (method, args) => { calls.push({ method, args }); return raw; } });
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const full = await dispatch(rpc(2, 'dsh_team_result', { teamId: 'lead' }));
  assert.deepEqual(full.result.structuredContent, raw);
  const summary = await dispatch(rpc(3, 'dsh_team_result', { teamId: 'lead', view: 'summary' }));
  assert.equal(summary.result.structuredContent.view, 'summary'); assert(bytes(summary.result) <= SUMMARY_BYTES);
  assert.deepEqual(summary.result.structuredContent.retainedErrors.samples.map(sample => [sample.seq, sample.message]), [[12, 'retained native failure']]);
  assert.deepEqual(calls, [{ method: 'result', args: { teamId: 'lead' } }, { method: 'result', args: { teamId: 'lead' } }]);
  const explicitFull = await dispatch(rpc(4, 'dsh_team_result', { teamId: 'lead', view: 'full' }));
  assert.deepEqual(explicitFull.result.structuredContent, raw);
  assert.equal((await dispatch(rpc(5, 'dsh_team_create', { key: 'k', cwd: '/tmp', text: 'task', view: 'summary' }))).error.code, -32602);
  assert.equal((await dispatch(rpc(6, 'dsh_team_result', { teamId: 'lead', view: 'invalid' }))).error.code, -32602);
});

test('summary presentation cannot widen exact read authority or native errors', async () => {
  const calls = [];
  const exact = createExactRequestClient({ request: async (method, params) => { calls.push({ method, params }); return { teamId: 'lead', output: 'safe' }; } },
    { method: 'send', params: { teamId: 'lead', inputId: 'input', text: 'Authorized text.' } });
  const dispatch = createDispatcher(exact); await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal((await dispatch(rpc(2, 'dsh_team_result', { teamId: 'lead', view: 'summary' }))).result.structuredContent.view, 'summary');
  for (const [name, args] of [['dsh_team_status', { teamId: 'lead', view: 'summary' }], ['dsh_team_result', { teamId: 'other', view: 'summary' }]]) {
    assert.equal((await dispatch(rpc(3, name, args))).result.isError, true);
  }
  assert.deepEqual(calls, [{ method: 'result', params: { teamId: 'lead' } }]);
  const failing = createDispatcher({ request: async () => { throw Object.assign(new Error('Native history unavailable.'), { code: 'HISTORY_UNAVAILABLE' }); } });
  await failing({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const result = await failing(rpc(2, 'dsh_team_result', { teamId: 'lead', view: 'summary' }));
  assert.equal(result.result.isError, true); assert.match(result.result.content[0].text, /HISTORY_UNAVAILABLE/);
});

test('summary native error paths obey the budget for long, multibyte and escaped details', async () => {
  for (const message of ['x'.repeat(20000), '中文🙂'.repeat(5000), '\u0001'.repeat(3000)]) {
    const error = Object.assign(new Error(message), { code: 'NATIVE_FAILURE' });
    const dispatch = createDispatcher({ request: async () => { throw error; } });
    await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    const summary = (await dispatch(rpc(2, 'dsh_team_result', { teamId: 'lead', view: 'summary' }))).result;
    assert.equal(summary.isError, true); assert(bytes(summary) <= SUMMARY_BYTES);
    const detail = JSON.parse(summary.content[0].text);
    assert.equal(detail.code, 'NATIVE_FAILURE'); assert.equal(detail.messageOmitted, true); assert.equal(detail.message.isWellFormed(), true);
    const full = (await dispatch(rpc(3, 'dsh_team_result', { teamId: 'lead', view: 'full' }))).result;
    assert.equal(JSON.parse(full.content[0].text).message, message);
  }
  const short = '授权范围不足🙂';
  const dispatch = createDispatcher({ request: async () => { throw Object.assign(new Error(short), { code: 'SCOPE_DENIED' }); } });
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.deepEqual(JSON.parse((await dispatch(rpc(2, 'dsh_team_status', { teamId: 'lead', view: 'summary' }))).result.content[0].text), { code: 'SCOPE_DENIED', message: short });
  const largeCode = createDispatcher({ request: async () => { throw Object.assign(new Error('short'), { code: 'x'.repeat(20000) }); } });
  await largeCode({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const failure = (await largeCode(rpc(2, 'dsh_team_wait', { teamId: 'lead', view: 'summary' }))).result;
  assert(bytes(failure) <= SUMMARY_BYTES); assert.equal(JSON.parse(failure.content[0].text).codeOmitted, true);
});

test('status/result/wait summaries sample the two most recent retained root-session errors without turn attribution', () => {
  const errors = Array.from({ length: 6 }, (_, index) => ({ seq: 40 + index, message: `retained error ${index}` }));
  for (const [method, value] of [
    ['status', { observation: { errors } }],
    ['result', { errors }],
    ['wait', { status: { observation: { errors } }, result: { errors } }],
  ]) {
    const body = boundedObservation(method, value);
    assert(bytes(body) <= SUMMARY_BYTES);
    const summary = body.structuredContent;
    assert.deepEqual(JSON.parse(body.content[0].text), summary);
    assert.equal(summary.retainedEntryCounts.errors, 6);
    assert.equal(summary.state.goalAccepted, null);
    const retained = summary.retainedErrors;
    assert.equal(retained.scope, 'root-session-retained-history');
    assert.equal(retained.attribution, 'not-inferred');
    assert.equal(retained.currentTurnAttribution, null);
    assert.equal(retained.goalOutcomeInferred, false);
    assert.equal(retained.samplePolicy, 'most-recent-retained');
    assert.equal(retained.available, true);
    assert.equal(retained.retainedCount, 6);
    assert.equal(retained.sampleLimit, 2);
    assert.equal(retained.previewBytes, 256);
    assert.deepEqual(retained.samples.map(sample => sample.seq), [44, 45]);
    assert.deepEqual(retained.samples.map(sample => sample.message), ['retained error 4', 'retained error 5']);
    assert.deepEqual(retained.samples.map(sample => sample.previewTruncated), [false, false]);
    assert.deepEqual(retained.samples.map(sample => sample.messageAvailable), [true, true]);
    assert.equal(retained.omittedSamples, 4);
    assert(retained.samples.every(sample => !Object.hasOwn(sample, 'turn') && !Object.hasOwn(sample, 'outcome')));
  }
});

test('retained error summary matrix distinguishes unavailable, empty, partial and malformed history for status/result/wait', () => {
  // Same absent/non-array/empty/single/malformed matrix across every summary view.
  const views = [
    ['status', errors => ({ observation: errors === undefined ? {} : { errors } })],
    ['result', errors => errors === undefined ? {} : { errors }],
    ['wait', errors => ({ status: { observation: errors === undefined ? {} : { errors } }, result: errors === undefined ? null : { errors } })],
  ];
  const cases = [['absent', undefined], ['unavailable-string', 'native/history-unavailable'],
    ['unavailable-object', { reason: 'native/history-unavailable' }], ['empty', []],
    ['single', [{ seq: 7, message: 'only retained error' }]], ['malformed', [{ seq: 'seven', message: 7 }, null]]];
  const metadata = retained => {
    assert.equal(retained.scope, 'root-session-retained-history');
    assert.equal(retained.attribution, 'not-inferred');
    assert.equal(retained.currentTurnAttribution, null);
    assert.equal(retained.goalOutcomeInferred, false);
    assert.equal(retained.samplePolicy, 'most-recent-retained');
    assert.equal(retained.sampleLimit, 2);
    assert.equal(retained.previewBytes, 256);
  };
  for (const [method, build] of views) {
    for (const [name, errors] of cases) {
      const summary = boundedObservation(method, build(errors)).structuredContent;
      const retained = summary.retainedErrors;
      metadata(retained);
      if (name === 'absent' || name.startsWith('unavailable-')) {
        // Unknown/unavailable must stay null, never a fabricated zero count.
        assert.equal(retained.available, false, `${method}/${name}: unavailable`);
        assert.equal(retained.retainedCount, null, `${method}/${name}: retainedCount`);
        assert.equal(retained.omittedSamples, null, `${method}/${name}: omittedSamples`);
        assert.equal(summary.retainedEntryCounts.errors, null, `${method}/${name}: projected count`);
        assert.equal(retained.reason, 'not-provided-or-unsupported-format', `${method}/${name}: reason`);
        assert.deepEqual(retained.samples, [], `${method}/${name}: samples`);
      } else if (name === 'empty') {
        assert.equal(retained.available, true, `${method}/empty: available`);
        assert.equal(retained.retainedCount, 0, `${method}/empty: retainedCount`);
        assert.equal(retained.omittedSamples, 0, `${method}/empty: omittedSamples`);
        assert.equal(summary.retainedEntryCounts.errors, 0, `${method}/empty: projected count`);
        assert.equal(Object.hasOwn(retained, 'reason'), false, `${method}/empty: no reason`);
        assert.deepEqual(retained.samples, [], `${method}/empty: samples`);
      } else if (name === 'single') {
        assert.equal(retained.available, true, `${method}/single: available`);
        assert.equal(retained.retainedCount, 1, `${method}/single: retainedCount`);
        assert.equal(retained.omittedSamples, 0, `${method}/single: omittedSamples`);
        assert.equal(summary.retainedEntryCounts.errors, 1, `${method}/single: projected count`);
        assert.deepEqual(retained.samples.map(sample => sample.seq), [7], `${method}/single: sample seq`);
      } else {
        assert.equal(retained.available, true, `${method}/malformed: available`);
        assert.equal(retained.retainedCount, 2, `${method}/malformed: retainedCount`);
        assert.equal(retained.omittedSamples, 0, `${method}/malformed: omittedSamples`);
        assert.equal(summary.retainedEntryCounts.errors, 2, `${method}/malformed: projected count`);
        assert.equal(retained.samples.length, 2, `${method}/malformed: sample count`);
        assert.equal(retained.samples[0].seq, null); assert.equal(retained.samples[0].messageAvailable, false);
        assert.equal(retained.samples[0].message, ''); assert.equal(retained.samples[1].seq, null);
        assert.equal(retained.samples[1].messageAvailable, false);
      }
    }
  }
});

test('retained error attribution stays unknown for older and latest-turn sequences across status/result/wait', () => {
  const latestStartSeq = 90;
  const latestTurn = () => ({ latestStarted: { turn: 2, startSeq: latestStartSeq },
    active: null, lastEnded: { turn: 2, seq: 99, reason: 'error' }, lastCompleted: null });
  const observation = errors => ({ turn: 2, turnStartSeq: latestStartSeq, open: false,
    lastEnd: { turn: 2, reason: 'error', seq: 99 }, lastCompletedTurn: null, errors });
  const result = errors => ({ turns: latestTurn(), errors });
  const views = [
    ['status', errors => ({ observation: observation(errors) })],
    ['result', errors => result(errors)],
    ['wait', errors => ({ status: { observation: observation(errors) }, result: result(errors) })],
  ];
  // Sequence placement alone must not become a turn claim: retained history can contain
  // errors older than, inside, or spanning the latest started turn.
  const placements = [
    ['older-and-latest-turn', [{ seq: 40, message: 'older retained error' }, { seq: 95, message: 'error inside latest turn range' }]],
    ['latest-turn-only', [{ seq: 96, message: 'latest turn error a' }, { seq: 97, message: 'latest turn error b' }]],
    ['older-only', [{ seq: 40, message: 'older error a' }, { seq: 41, message: 'older error b' }]],
  ];
  const labels = [];
  for (const [method, build] of views) {
    for (const [name, errors] of placements) {
      const summary = boundedObservation(method, build(errors)).structuredContent;
      const retained = summary.retainedErrors;
      labels.push({ scope: retained.scope, attribution: retained.attribution,
        currentTurnAttribution: retained.currentTurnAttribution, goalOutcomeInferred: retained.goalOutcomeInferred });
      // Neutral not-inferred/unknown attribution regardless of whether a sampled seq
      // falls before or inside the latest turn's sequence range.
      assert.equal(retained.scope, 'root-session-retained-history', `${method}/${name}: scope`);
      assert.equal(retained.attribution, 'not-inferred', `${method}/${name}: attribution`);
      assert.equal(retained.currentTurnAttribution, null, `${method}/${name}: currentTurnAttribution`);
      assert.equal(retained.goalOutcomeInferred, false, `${method}/${name}: goalOutcomeInferred`);
      // Native identity and retained order survive; no per-sample turn classification is added.
      assert.deepEqual(retained.samples.map(sample => sample.seq), errors.slice(-2).map(error => error.seq), `${method}/${name}: sample seqs`);
      assert(retained.samples.every(sample => !Object.hasOwn(sample, 'turn') && !Object.hasOwn(sample, 'outcome')));
      // The latest turn boundary remains separate evidence, not an attribution rule.
      assert.equal(summary.turns.latestStarted.startSeq, latestStartSeq, `${method}/${name}: latest turn cut`);
      assert.equal(summary.state.goalAccepted, null, `${method}/${name}: goal acceptance unknown`);
      assert.doesNotMatch(JSON.stringify(retained), /not-current-turn/u, `${method}/${name}: no exclusion claim`);
      assert.doesNotMatch(JSON.stringify(retained), /current-turn/u, `${method}/${name}: no current-turn claim`);
    }
  }
  assert(labels.every(label => JSON.stringify(label) === JSON.stringify(labels[0])),
    'attribution label is independent of sequence placement');
  const mixed = boundedObservation('result', result(placements[0][1])).structuredContent.retainedErrors;
  assert.deepEqual(mixed.samples.map(sample => sample.seq), [40, 95]);
  assert(mixed.samples.some(sample => sample.seq >= latestStartSeq), 'latest-turn-range error is retained, not excluded');
  const latest = boundedObservation('result', result(placements[1][1])).structuredContent.retainedErrors;
  assert.equal(latest.currentTurnAttribution, null, 'latest-turn-only history is not asserted current-turn');
  const older = boundedObservation('result', result(placements[2][1])).structuredContent.retainedErrors;
  assert.equal(older.currentTurnAttribution, null, 'older-only history is not asserted non-current-turn');
});

test('retained error message previews are UTF-8 safe, explicitly truncated and escape-budgeted', () => {
  const multibyte = '中文🙂'.repeat(100), exact = 'a'.repeat(256), lone = 'ok\uD800end', escaped = '\u0001'.repeat(300);
  const retained = boundedObservation('result', { errors: [{ seq: 1, message: multibyte }, { seq: 2, message: exact }] }).structuredContent.retainedErrors;
  const [huge, bounded] = retained.samples;
  assert.equal(huge.previewTruncated, true); assert.equal(huge.originalWellFormed, true);
  assert(Buffer.byteLength(huge.message) <= 256); assert.equal(huge.message.isWellFormed(), true);
  assert(multibyte.startsWith(huge.message) && huge.message.length > 0, 'truncation never splits a Unicode scalar');
  assert.equal(bounded.previewTruncated, false); assert.equal(bounded.message, exact);
  const surrogate = boundedObservation('status', { observation: { errors: [{ seq: 3, message: lone }] } }).structuredContent.retainedErrors.samples[0];
  assert.equal(surrogate.originalWellFormed, false); assert.equal(surrogate.message.isWellFormed(), true);
  assert.equal(surrogate.message, 'ok\uFFFDend'); assert.equal(surrogate.previewTruncated, false);
  const body = boundedObservation('result', { errors: [{ seq: 4, message: escaped }] });
  const sample = body.structuredContent.retainedErrors.samples[0];
  assert.equal(sample.previewTruncated, true); assert(Buffer.byteLength(sample.message) <= 256);
  assert(bytes(body) <= SUMMARY_BYTES);
  assert.equal(JSON.parse(body.content[0].text).retainedErrors.samples[0].message, sample.message);
});

test('retained error samples are the last detail omitted under the total body budget and never fall back to full', () => {
  const marker = '\u0001'.repeat(256);
  const raw = { teamId: marker, taskState: marker, runtimeState: marker,
    errors: [{ seq: 1, message: '\u0001'.repeat(300) }, { seq: 2, message: '\u0001'.repeat(300) }] };
  const body = boundedObservation('result', raw);
  assert(bytes(body) <= SUMMARY_BYTES);
  const summary = body.structuredContent;
  assert.equal(summary.reducedForBudget, true);
  assert.equal(summary.state.taskState, marker);
  assert.equal(summary.retainedErrors.available, true);
  assert.equal(summary.retainedErrors.retainedCount, 2);
  assert.deepEqual(summary.retainedErrors.samples, []);
  assert.equal(summary.retainedErrors.samplesOmittedForBudget, 2);
  assert.equal(summary.retainedErrors.omittedSamples, 2);
  assert.equal(summary.retainedEntryCounts.errors, 2);
  assert.deepEqual(JSON.parse(body.content[0].text), summary);
});
