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
async function fixture(t, { catalog, createError, healthResult, health = contract } = {}) {
  const owned = await ownedFixture(t);
  const calls = [];
  const server = await serveNativeFixture({ health, dispatch: async (method, params) => {
    calls.push({ method, params });
    if (method === 'health') return { ...healthResult, ...(catalog === undefined ? {} : { roles: catalog }) };
    if (method === 'create' && createError) throw createError;
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
