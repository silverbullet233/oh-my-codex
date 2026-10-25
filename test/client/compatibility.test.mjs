import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeClient } from '../../src/bridge/client.mjs';
import { serveFakeBridge, contract } from '../fixtures/ipc-server.mjs';
async function fixture(t, options={}) {
  const root=await mkdtemp(join(tmpdir(),'dsh-client-'));const socketPath=join(root,'ipc.sock');const calls=[];
  const server=await serveFakeBridge({socketPath,bridge:{dispatch:async(method,params)=>{calls.push({method,params});return method==='health'?{ok:true}:{accepted:true};}},...options});
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
