import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDispatcher } from '../../src/mcp/server.mjs';
import { GatewayClient } from '../../src/native/gateway.mjs';
import { loadRuntime } from '../../src/native/runtime.mjs';
import { serveNativeFixture, contract } from '../fixtures/native-server.mjs';
import { ownedFixture } from '../fixtures/owned.mjs';
async function fixture(t, { catalog, createError, createResult, healthResult, health = contract } = {}) {
  const owned = await ownedFixture(t);
  const calls = [];
  const server = await serveNativeFixture({ health, dispatch: async (method, params) => {
    calls.push({ method, params });
    if (method === 'health') return { ...healthResult, ...(catalog === undefined ? {} : { roles: catalog }) };
    if (method === 'create' && createError) throw createError;
    if (method === 'create' && createResult) return createResult;
    return { accepted: true };
  } });
  const client = new GatewayClient({ runtime: await loadRuntime(owned.runtime), entry: { url: server.url, pid: process.pid, instanceId: null } });
  t.after(async () => { await client.close(); await server.close(); });
  return { client, calls };
}
test('independent client handshakes capabilities before a write and retains exact params',async t=>{
  const {client,calls}=await fixture(t);
  const params={key:'synthetic',cwd:'/synthetic',text:'Synthetic standalone client input.'};
  assert.equal((await client.request('create',params)).accepted,true);
  assert.deepEqual(calls,[{method:'health',params:{}},{method:'create',params}]);
});
test('explicit permission intent requires host support without fallback; default remains compatible', async t => {
  const { client, calls } = await fixture(t);
  const params = { key: 'explicit-permission', cwd: '/synthetic', text: 'Synthetic task.', permissionPreset: 'danger-full-access' };
  await assert.rejects(client.request('create', params), { code: 'CAPABILITY_MISMATCH' });
  assert.deepEqual(calls.map(call => call.method), ['health']);
});
test('historical reads require an additive capability and never fall back to latest', async t => {
  const { client, calls } = await fixture(t);
  await assert.rejects(client.request('turnResult', { teamId: 'lead', turn: 1 }), { code: 'CAPABILITY_MISMATCH' });
  assert.deepEqual(calls.map(call => call.method), ['health']);
  assert.equal((await client.request('result', { teamId: 'lead' })).accepted, true);
  assert.deepEqual(calls.map(call => call.method), ['health', 'result']);
});
test('input evidence requires an additive capability without reading status or resending', async t => {
  const { client, calls } = await fixture(t);
  await assert.rejects(client.request('input', { teamId: 'lead', inputId: 'input-1' }), { code: 'CAPABILITY_MISMATCH' });
  assert.deepEqual(calls.map(call => call.method), ['health']);
});
test('owned Job reads require capability without unscoped fallback', async t => {
  const { client, calls } = await fixture(t);
  await assert.rejects(client.request('jobs', { teamId: 'lead' }), { code: 'CAPABILITY_MISMATCH' });
  assert.deepEqual(calls.map(call => call.method), ['health']);
});
test('MCP maps bounded Team Job queries and refuses raw owner/output controls', async t => {
  const { client, calls } = await fixture(t, { health: { ...contract, capabilities: [...contract.capabilities, 'owned-job-observations'] } });
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const params = { teamId: 'lead', limit: 3 };
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_jobs', arguments: params } });
  assert.equal(response.result.structuredContent.accepted, true); assert.deepEqual(calls.at(-1), { method: 'jobs', params });
  const before = calls.length;
  for (const arguments_ of [{ ...params, owner: 'foreign' }, { ...params, consume: true }, { ...params, limit: 26 }, { ...params, limit: 0 }]) {
    assert.equal((await dispatch({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_jobs', arguments: arguments_ } })).error.code, -32602);
  }
  assert.equal(calls.length, before);
});
test('withdrawal refuses unsupported hosts before mutation or resume', async t => {
  const { client, calls } = await fixture(t);
  await assert.rejects(client.request('withdrawInput', { teamId: 'lead', inputId: 'input-1', expectedMessageId: 'message-1' }), { code: 'CAPABILITY_MISMATCH' });
  assert.deepEqual(calls.map(call => call.method), ['health']);
});
test('MCP withdrawal maps exact native IDs and refuses missing identity or extra targets', async t => {
  const { client, calls } = await fixture(t, { health: { ...contract, capabilities: [...contract.capabilities, 'live-input-withdrawal'] } });
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const params = { teamId: 'lead', inputId: 'input-1', expectedMessageId: 'message-1' };
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_withdraw_input', arguments: params } });
  assert.equal(response.result.structuredContent.accepted, true);
  assert.deepEqual(calls.at(-1), { method: 'withdrawInput', params });
  const before = calls.length;
  for (const arguments_ of [{ teamId: 'lead', inputId: 'input-1' }, { ...params, memberId: 'bypass' }, { ...params, expectedMessageId: '' }]) {
    assert.equal((await dispatch({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_withdraw_input', arguments: arguments_ } })).error.code, -32602);
  }
  assert.equal(calls.length, before);
});
test('lost withdrawal reply is uncertain and never replays the mutation', { timeout: 15000 }, async t => {
  const owned = await ownedFixture(t);
  let admitted = 0, response;
  const server = await serveNativeFixture({ health: { ...contract, capabilities: [...contract.capabilities, 'live-input-withdrawal'] }, dispatch: async method => {
    if (method === 'withdrawInput') { admitted++; response.destroy(); return { state: 'withdrawn' }; }
    return {};
  } });
  server.ctx.on('connection/request', (request, current, next) => { if (request.url === '/api/roleTeams/withdrawInput') response = current; return next(); });
  const client = new GatewayClient({ runtime: await loadRuntime(owned.runtime), entry: { url: server.url, pid: process.pid, instanceId: null } });
  t.after(async () => { await client.close(); await server.close(); });
  await assert.rejects(client.request('withdrawInput', { teamId: 'lead', inputId: 'input-1', expectedMessageId: 'message-1' }), { code: 'OUTCOME_UNCERTAIN' });
  assert.equal(admitted, 1);
});
test('MCP input query preserves root/input identity and refuses extra targets before transport', async t => {
  const { client, calls } = await fixture(t, { health: { ...contract, capabilities: [...contract.capabilities, 'input-observations'] } });
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const params = { teamId: 'lead', inputId: 'queued-input' };
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_input', arguments: params } });
  assert.equal(response.result.structuredContent.accepted, true);
  assert.deepEqual(calls.at(-1), { method: 'input', params });
  const before = calls.length;
  for (const arguments_ of [{ ...params, memberId: 'bypass' }, { teamId: 'lead' }, { ...params, inputId: '' }]) {
    assert.equal((await dispatch({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_input', arguments: arguments_ } })).error.code, -32602);
  }
  assert.equal(calls.length, before);
});
test('MCP maps historical selectors and opaque pagination exactly to the native Remote', async t => {
  const { client, calls } = await fixture(t, { health: { ...contract, capabilities: [...contract.capabilities, 'ended-turn-results'] } });
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  for (const params of [{ teamId: 'lead', turn: 1, maxBytes: 997 }, { teamId: 'lead', resultRef: 'opaque-history-ref', offset: 997, maxBytes: 4093 }]) {
    const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_turn_result', arguments: params } });
    assert.equal(response.result.structuredContent.accepted, true);
    assert.deepEqual(calls.at(-1), { method: 'turnResult', params });
  }
  const before = calls.length;
  for (const params of [{ teamId: 'lead', turn: 0 }, { teamId: 'lead', turn: 1, maxBytes: 32769 }, { teamId: 'lead', resultRef: 'x'.repeat(2049) }]) {
    assert.equal((await dispatch({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_turn_result', arguments: params } })).error.code, -32602);
  }
  assert.equal(calls.length, before);
});
test('MCP forwards exact explicit preset and reports actual configured permissions', async t => {
  const permissions = { preset: 'danger-full-access', sandbox: { mode: 'workspace-write', workspaceRoot: '/synthetic' }, approvalPolicy: 'ask', asOfSeq: 5 };
  const { client, calls } = await fixture(t, { health: { ...contract, capabilities: [...contract.capabilities, 'create-permission-preset'] }, createResult: { teamId: 'synthetic', accepted: true, permissions } });
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const params = { key: 'explicit-permission', cwd: '/synthetic', text: 'Synthetic task.', permissionPreset: 'danger-full-access' };
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_create', arguments: params } });
  assert.deepEqual(response.result.structuredContent.permissions, permissions);
  assert.deepEqual(calls.filter(call => call.method === 'create'), [{ method: 'create', params }]);
});
test('missing or mismatched permission receipts stay uncertain without replays', async t => {
  const receipt = { preset: 'danger-full-access', sandbox: { mode: 'workspace-write', workspaceRoot: '/synthetic' }, approvalPolicy: 'ask', asOfSeq: 1 };
  const malformedScopes = [undefined, '', 'relative', 42, '/bad\0root'].map(workspaceRoot => ({ ...receipt, sandbox: { mode: 'workspace-write', workspaceRoot } }));
  malformedScopes.push({ ...receipt, sandbox: { ...receipt.sandbox, additionalWritableRoots: ['relative'] } });
  for (const permissions of [undefined, { ...receipt, preset: 'read-only' }, ...malformedScopes]) await t.test(String(permissions?.sandbox?.workspaceRoot), async t => {
    const { client, calls } = await fixture(t, { health: { ...contract, capabilities: [...contract.capabilities, 'create-permission-preset'] }, createResult: { teamId: 'synthetic', permissions } });
    await assert.rejects(client.request('create', { key: 'permission-receipt', cwd: '/synthetic', text: 'Synthetic task.', permissionPreset: 'danger-full-access' }), { code: 'OUTCOME_UNCERTAIN' });
    assert.equal(calls.filter(call => call.method === 'create').length, 1);
  });
});
test('MCP preserves released runtime package identity with null sourceSha and admits compatible work', async t => {
  const evidence = { sourceSha: null, runtime: { packageVersion: '0.2.2-alpha.2' } };
  const { client, calls } = await fixture(t, { healthResult: evidence });
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const health = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {} } });
  assert.equal(health.result.structuredContent.sourceSha, null);
  assert.equal(health.result.structuredContent.runtime.packageVersion, '0.2.2-alpha.2');
  assert.deepEqual(health.result.structuredContent.api, contract);
  const params = { key: 'released-runtime', cwd: '/synthetic', text: 'Synthetic release runtime input.' };
  const created = await dispatch({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_create', arguments: params } });
  assert.equal(created.result.structuredContent.accepted, true);
  assert.deepEqual(calls.filter(call => call.method === 'create'), [{ method: 'create', params }]);
});
test('missing native capabilities refuse work before create dispatch',async t=>{
  const {client,calls}=await fixture(t,{health:{...contract,capabilities:['native-session']}});
  await assert.rejects(client.request('create',{}),error=>error.code==='CAPABILITY_MISMATCH');
  assert.deepEqual(calls.map(c=>c.method),['health']);
});
test('incompatible API versions refuse work without fallback',async t=>{
  const {client,calls}=await fixture(t,{health:{...contract,version:0}});
  await assert.rejects(client.request('send',{}),error=>error.code==='CAPABILITY_MISMATCH');
  assert.deepEqual(calls.map(c=>c.method),['health']);
});

test('oversized client writes are rejected locally after health and before native dispatch',async t=>{
  const {client,calls}=await fixture(t);
  await assert.rejects(client.request('send',{teamId:'synthetic',text:'x'.repeat(131072)}),error=>error.code==='REQUEST_TOO_LARGE');
  assert.deepEqual(calls.map(c=>c.method),[]);
});

test('MCP accepts a API-1 empty role catalog and leaves native inheritance to the host', async t => {
  const catalog = { leadRole: '', roles: [] };
  const { client, calls } = await fixture(t, { catalog });
  assert.deepEqual((await client.request('health')).roles, catalog);
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const params = { key: 'native-default', cwd: '/synthetic', text: 'Synthetic native inheritance input.' };
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_create', arguments: params } });
  assert.equal(response.result.structuredContent.accepted, true);
  assert.deepEqual(calls.filter(call => call.method === 'create'), [{ method: 'create', params }]);
});

test('an explicit role refusal propagates through MCP without dropping the role or retrying native defaults', async t => {
  const error = Object.assign(new Error('The explicit native role was rejected.'), { code: 'team-roles/NATIVE_FAILURE' });
  const { client, calls } = await fixture(t, { catalog: { leadRole: '', roles: [] }, createError: error });
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const params = { key: 'explicit-role', cwd: '/synthetic', text: 'Synthetic strict role input.', leadRole: 'unknown' };
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_create', arguments: params } });
  assert.equal(response.result.isError, true);
  assert.equal(JSON.parse(response.result.content[0].text).code, 'team-roles/NATIVE_FAILURE');
  assert.deepEqual(calls, [{ method: 'health', params: {} }, { method: 'create', params }]);
});

test('concurrent calls await a gated reconnect before using the native Remote', { timeout: 15000 }, async t => {
  const owned = await ownedFixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  let block = true;
  const server = await serveNativeFixture({ dispatch: async method => { if (method === 'health' && block) { block = false; entered.resolve(); await release.promise; } return {}; } });
  const client = new GatewayClient({ runtime: await loadRuntime(owned.runtime), entry: { url: server.url, pid: process.pid, instanceId: null } });
  t.after(async () => { release.resolve(); await client.close(); await server.close(); });
  const first = client.request('status', { teamId: 'first' }); await entered.promise;
  let settled = false;
  const second = client.request('status', { teamId: 'second' }).then(value => { settled = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(settled, false);
  release.resolve(); await Promise.all([first, second]);
  assert.equal(client.invalid, false);
});

test('explicit close during a gated handshake cannot publish a replacement client', { timeout: 15000 }, async t => {
  const owned = await ownedFixture(t), entered = Promise.withResolvers(), release = Promise.withResolvers();
  const server = await serveNativeFixture({ dispatch: async method => { if (method === 'health') { entered.resolve(); await release.promise; } return {}; } });
  const client = new GatewayClient({ runtime: await loadRuntime(owned.runtime), entry: { url: server.url, pid: process.pid, instanceId: null } });
  t.after(async () => { release.resolve(); await client.close(); await server.close(); });
  const outcome = assert.rejects(client.request('health'), { code: 'CANCELLED' });
  await entered.promise;
  const closing = client.close(); release.resolve();
  await closing; await outcome; assert.equal(client.ctx, undefined);
});

test('a dropped response after native admission is uncertain and never automatically replays a write', { timeout: 15000 }, async t => {
  const owned = await ownedFixture(t);
  let admitted = 0, response;
  const server = await serveNativeFixture({ dispatch: async method => {
    if (method === 'create') { admitted++; response.destroy(); return { accepted: true }; }
    if (method === 'status') return { admitted };
    return {};
  } });
  server.ctx.on('connection/request', (request, current, next) => { if (request.url === '/api/roleTeams/create') response = current; return next(); });
  const client = new GatewayClient({ runtime: await loadRuntime(owned.runtime), entry: { url: server.url, pid: process.pid, instanceId: null } });
  t.after(async () => { await client.close(); await server.close(); });
  await assert.rejects(client.request('create', { key: 'uncertain', cwd: owned.home, text: 'Synthetic accepted input.' }), { code: 'OUTCOME_UNCERTAIN' });
  assert.equal(admitted, 1);
  assert.equal((await client.request('status', { teamId: 'uncertain' })).admitted, 1);
});
