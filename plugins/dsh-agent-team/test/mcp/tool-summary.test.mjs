import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedObservation, SUMMARY_BYTES } from '../../src/mcp/summary.mjs';
import { createDispatcher } from '../../src/mcp/server.mjs';

const row = { sessionId: 'member', asOfSeq: 42, unchangedAtCheck: null, available: true, turn: 2, turnOpen: true,
  observedCalls: 1, observedResults: 0, correlationComplete: true, omittedCallEvents: 0, unsettledCount: 1, unsettledKnownCount: 1,
  unsettled: [{ callId: 'call', name: 'fixture_read', step: 1, callSeq: 40, arguments: 'EXCLUDED_ARG', output: 'EXCLUDED_OUTPUT' }], omittedSamples: 0, lastResult: null };
const evidence = sessions => ({ format: 'native-tool-receipts-v1', sessions, omittedSessions: 0 });
test('summary retains payload-free tool evidence and cold source cuts with no text or Job', () => {
  for (const method of ['status', 'result', 'wait']) {
    const source = { toolActivity: evidence([row]) }, value = method === 'wait' ? { status: source, result: source } : source;
    const summary = boundedObservation(method, value).structuredContent;
    assert.equal(summary.toolActivity.available, true);
    assert.equal(summary.toolActivity.sessions[0].unsettledCount, 1); assert.equal(summary.toolActivity.sessions[0].unchangedAtCheck, null);
    assert.equal(summary.toolActivity.sessions[0].unsettled[0].callId, 'call');
    assert.equal(summary.output.available, false); assert.equal(summary.state.goalAccepted, null);
    assert.doesNotMatch(JSON.stringify(summary.toolActivity), /EXCLUDED|arguments|output/);
  }
});
test('legacy hosts, unsupported formats, incomplete correlation and omitted samples stay explicit', () => {
  for (const toolActivity of [undefined, {}, { format: 'future-v2', sessions: [] }]) assert.equal(boundedObservation('status', { toolActivity }).structuredContent.toolActivity.available, false);
  const incomplete = { ...row, correlationComplete: false, unsettledCount: null, unsettled: Array(4).fill(row.unsettled[0]), omittedSamples: 12 };
  const summary = boundedObservation('status', { toolActivity: evidence(Array(6).fill(incomplete)) }).structuredContent.toolActivity;
  assert.equal(summary.sessions.length, 4); assert.equal(summary.omittedSessions, 2);
  assert.equal(summary.sessions[0].unsettledCount, null); assert.equal(summary.sessions[0].omittedSamples, 14);
});
test('tool metadata with escape-heavy IDs remains inside the existing total body budget', () => {
  const large = { ...row, sessionId: '\0'.repeat(256), unsettled: Array(4).fill({ callId: '\0'.repeat(256), name: '\0'.repeat(256), step: 1, callSeq: 40 }), lastResult: { callId: '\0'.repeat(256), name: '\0'.repeat(256), resultSeq: 41 } };
  const body = boundedObservation('result', { toolActivity: evidence(Array(32).fill(large)) });
  assert(Buffer.byteLength(JSON.stringify(body)) <= SUMMARY_BYTES);
  assert.equal(body.structuredContent.reducedForBudget, true); assert.deepEqual(body.structuredContent.toolActivity.sessions, []);
  assert.equal(body.structuredContent.toolActivity.omittedSessions, 32);
});
test('MCP presentation preserves native status/result requests without new arguments or member controls', async () => {
  const calls = [], dispatch = createDispatcher({ request: async (method, params) => { calls.push({ method, params }); return { toolActivity: evidence([row]) }; } });
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const result = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_status', arguments: { teamId: 'root', view: 'summary' } } });
  assert.equal(result.result.structuredContent.toolActivity.sessions[0].sessionId, 'member');
  assert.deepEqual(calls, [{ method: 'status', params: { teamId: 'root' } }]);
});
