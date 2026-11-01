import assert from 'node:assert/strict';
import { GatewayClient } from '../../src/native/gateway.mjs';
import { loadRuntime } from '../../src/native/runtime.mjs';
import { serveNativeFixture } from './native-server.mjs';
import { ownedFixture } from './owned.mjs';
export async function eventually(check) {
  for (let i = 0; i < 200; i++) { const value = await check(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('Expected native condition did not arrive.');
}
export async function interactionFixture(t) {
  const owned = await ownedFixture(t);
  const state = { completed: false, runtimeState: 'idle', reads: 0 };
  const server = await serveNativeFixture({ dispatch: async (method, request) => {
    if (method === 'status') {
      if (request.teamId !== 'lead') throw Object.assign(new Error('Unknown managed root'), { code: 'team-roles/UNKNOWN_TEAM' });
      return { teamId: 'lead', sessionId: 'lead', runtimeState: state.runtimeState, team: { members: [{ id: 'lead', role: 'lead', phase: 'active' }, { id: 'member', role: 'worker', phase: 'active' }] } };
    }
    if (method === 'result') { state.reads++; return { completed: state.completed }; }
    return {};
  } });
  server.session('member').header.parentSession = 'lead';
  const client = new GatewayClient({ runtime: await loadRuntime(owned.runtime), entry: { url: server.url, pid: process.pid, instanceId: null } });
  t.after(async () => { await client.close(); await server.close(); });
  await client.ready();
  return { server, client, state };
}
