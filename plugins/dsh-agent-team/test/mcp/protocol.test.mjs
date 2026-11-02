import assert from 'node:assert/strict';
import test from 'node:test';
import { createDispatcher } from '../../src/mcp/server.mjs';
import { tools } from '../../src/mcp/tools.mjs';

const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });
async function initialized(client) {
  const dispatch = createDispatcher(client);
  const result = await dispatch(rpc('initialize', { protocolVersion: '2025-06-18' }));
  assert.equal(result.result.protocolVersion, '2025-06-18');
  return dispatch;
}

test('MCP exposes fourteen explicit Session operations and requires initialization', async () => {
  const dispatch = createDispatcher({ request: async () => ({}) });
  assert.equal((await dispatch(rpc('tools/list'))).error.code, -32002);
  await dispatch(rpc('initialize', {}));
  assert.deepEqual((await dispatch(rpc('tools/list'))).result.tools.map((item) => item.name), ['dsh_team_web', 'dsh_team_shutdown', 'dsh_team_health', 'dsh_team_create', 'dsh_team_send', 'dsh_team_status', 'dsh_team_input', 'dsh_team_withdraw_input', 'dsh_team_result', 'dsh_team_turn_result', 'dsh_team_stop', 'dsh_team_pending', 'dsh_team_answer', 'dsh_team_escalate', 'dsh_team_approval', 'dsh_team_wait']);
  assert.equal(tools.length, 16);
  assert.equal(await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
});

test('validated MCP calls retain durable keys and explicit continuation', async () => {
  const calls = [];
  const dispatch = await initialized({ request: async (method, params) => { calls.push({ method, params }); return { accepted: true, processed: false }; } });
  const args = { teamId: 'native-1', inputId: 'input-1', text: 'Synthetic follow-up', mode: 'queue', continue: true };
  const response = await dispatch(rpc('tools/call', { name: 'dsh_team_send', arguments: args }));
  assert.deepEqual(calls, [{ method: 'send', params: args }]);
  assert.deepEqual(response.result.structuredContent, { accepted: true, processed: false });
  assert.equal(JSON.parse(response.result.content[0].text).processed, false);
});

test('invalid arguments and arbitrary endpoint fields never reach the bridge', async () => {
  const dispatch = await initialized({ request: async () => { assert.fail('must not reach bridge'); } });
  for (const arguments_ of [{ teamId: 'x', endpoint: 'https://example.invalid' }, { teamId: '' }, { teamId: 4 }, []]) {
    const response = await dispatch(rpc('tools/call', { name: 'dsh_team_status', arguments: arguments_ }));
    assert.equal(response.error.code, -32602);
  }
  assert.equal((await dispatch(rpc('tools/call', { name: 'anything' }))).error.code, -32602);
});

test('native refusal remains an explicit tool error without fallback', async () => {
  const dispatch = await initialized({ request: async () => { const error = new Error('Native approval is required.'); error.code = 'interaction/unavailable'; throw error; } });
  const response = await dispatch(rpc('tools/call', { name: 'dsh_team_health' }));
  assert.equal(response.result.isError, true);
  assert.deepEqual(JSON.parse(response.result.content[0].text), { code: 'interaction/unavailable', message: 'Native approval is required.' });
});

test('unknown RPC requests fail without running native work', async () => {
  const dispatch = await initialized({ request: async () => { assert.fail('must not reach bridge'); } });
  assert.equal((await dispatch(rpc('shutdown'))).error.code, -32601);
  assert.equal((await dispatch([{ jsonrpc: '2.0', method: 'ping' }])).error.code, -32600);
});
