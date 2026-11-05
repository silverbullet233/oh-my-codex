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

test('MCP exposes eighteen explicit Session operations and requires initialization', async () => {
  const dispatch = createDispatcher({ request: async () => ({}) });
  assert.equal((await dispatch(rpc('tools/list'))).error.code, -32002);
  await dispatch(rpc('initialize', {}));
  assert.deepEqual((await dispatch(rpc('tools/list'))).result.tools.map((item) => item.name), ['dsh_team_web', 'dsh_team_web_url', 'dsh_team_shutdown', 'dsh_team_health', 'dsh_team_create', 'dsh_team_send', 'dsh_team_status', 'dsh_team_jobs', 'dsh_team_input', 'dsh_team_withdraw_input', 'dsh_team_result', 'dsh_team_turn_result', 'dsh_team_stop', 'dsh_team_pending', 'dsh_team_answer', 'dsh_team_escalate', 'dsh_team_approval', 'dsh_team_wait']);
  assert.equal(tools.length, 18);
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

test('MCP validates optional local wait policy and keeps native write controls unavailable', async () => {
  const calls = [];
  const dispatch = await initialized({ request: async (method, params) => { calls.push({ method, params }); return { reason: 'timeout', wakeOn: params.wakeOn }; } });
  const response = await dispatch(rpc('tools/call', { name: 'dsh_team_wait', arguments: { teamId: 'lead', wakeOn: 'state', view: 'summary' } }));
  assert.deepEqual(calls, [{ method: 'wait', params: { teamId: 'lead', wakeOn: 'state' } }]);
  assert.equal(response.result.structuredContent.wakeOn, 'state');
  for (const extra of [{ wakeOn: 'tokens' }, { member: 'other' }, { activate: true }]) {
    assert.equal((await dispatch(rpc('tools/call', { name: 'dsh_team_wait', arguments: { teamId: 'lead', ...extra } }))).error.code, -32602);
  }
  assert.equal(calls.length, 1);
});

test('unknown RPC requests fail without running native work', async () => {
  const dispatch = await initialized({ request: async () => { assert.fail('must not reach bridge'); } });
  assert.equal((await dispatch(rpc('shutdown'))).error.code, -32601);
  assert.equal((await dispatch([{ jsonrpc: '2.0', method: 'ping' }])).error.code, -32600);
});

test('authenticated Web URL disclosure is explicit, schema-gated and mapped without defaults', async () => {
  const calls = [];
  const dispatch = await initialized({ request: async (method, params) => { calls.push({ method, params }); return { teamId: params.teamId, scope: 'host', url: 'http://127.0.0.1:12345/?token=synthetic-only', origin: 'http://127.0.0.1:12345' }; } });
  const definition = (await dispatch(rpc('tools/list'))).result.tools.find(tool => tool.name === 'dsh_team_web_url');
  assert(definition);
  assert.equal(definition.description.includes('bearer credential'), true);
  assert.deepEqual(definition.inputSchema.required, ['teamId', 'acknowledge']);
  assert.deepEqual(definition.inputSchema.properties.acknowledge.enum, ['reveal-bearer-credential']);
  for (const arguments_ of [{ teamId: 'lead' }, { teamId: 'lead', acknowledge: 'yes' }, { teamId: 'lead', acknowledge: 'reveal-bearer-credential', memberId: 'synthetic-child' }, { acknowledge: 'reveal-bearer-credential' }, { teamId: '', acknowledge: 'reveal-bearer-credential' }]) {
    assert.equal((await dispatch(rpc('tools/call', { name: 'dsh_team_web_url', arguments: arguments_ }))).error.code, -32602);
  }
  assert.equal(calls.length, 0);
  const response = await dispatch(rpc('tools/call', { name: 'dsh_team_web_url', arguments: { teamId: 'lead', acknowledge: 'reveal-bearer-credential' } }));
  assert.deepEqual(calls, [{ method: 'webUrl', params: { teamId: 'lead', acknowledge: 'reveal-bearer-credential' } }]);
  assert.equal(response.result.structuredContent.scope, 'host');
  // The existing browser handoff tool keeps its unchanged clean-origin contract.
  const web = tools.find(tool => tool.name === 'dsh_team_web');
  assert.equal(web.description.includes('Launch tokens and API cookies are never returned'), true);
  assert.deepEqual(web.inputSchema, { type: 'object', properties: {}, required: [], additionalProperties: false });
});
