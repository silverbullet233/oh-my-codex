import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeClient } from '../../src/bridge/client.mjs';
import { serveFakeBridge, contract } from '../fixtures/ipc-server.mjs';
import { createDispatcher } from '../../src/mcp/server.mjs';
async function fixture(t, { catalog, createError, healthResult, ...options } = {}) {
  const root=await mkdtemp(join(tmpdir(),'dsh-client-'));const socketPath=join(root,'ipc.sock');const calls=[];
  const server=await serveFakeBridge({socketPath,bridge:{dispatch:async(method,params)=>{
    calls.push({method,params});
    if(method==='health')return {ok:true,...healthResult,...(catalog===undefined?{}:{roles:catalog})};
    if(method==='create' && createError)throw createError;
    return {accepted:true};
  }},...options});
  const client=new BridgeClient({socketPath});
  t.after(async()=>{client.close();await server.close();await rm(root,{recursive:true,force:true});});
  return {client,calls};
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
  assert.deepEqual(health.result.structuredContent.protocol, contract);
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
test('incompatible response versions refuse work without fallback',async t=>{
  const {client,calls}=await fixture(t,{protocol:0});
  await assert.rejects(client.request('send',{}),error=>error.code==='PROTOCOL_MISMATCH');
  assert.deepEqual(calls.map(c=>c.method),['health']);
});

test('oversized client writes are rejected locally after health and before native dispatch',async t=>{
  const {client,calls}=await fixture(t);
  await assert.rejects(client.request('send',{teamId:'synthetic',text:'x'.repeat(131072)}),error=>error.code==='REQUEST_TOO_LARGE');
  assert.deepEqual(calls.map(c=>c.method),['health']);
});

test('MCP accepts a protocol-1 empty role catalog and leaves native inheritance to the host', async t => {
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
  const error = Object.assign(new Error('The explicit native role was rejected.'), { code: 'NATIVE_FAILURE' });
  const { client, calls } = await fixture(t, { catalog: { leadRole: '', roles: [] }, createError: error });
  const dispatch = createDispatcher(client);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const params = { key: 'explicit-role', cwd: '/synthetic', text: 'Synthetic strict role input.', leadRole: 'unknown' };
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_create', arguments: params } });
  assert.equal(response.result.isError, true);
  assert.equal(JSON.parse(response.result.content[0].text).code, 'NATIVE_FAILURE');
  assert.deepEqual(calls, [{ method: 'health', params: {} }, { method: 'create', params }]);
});
