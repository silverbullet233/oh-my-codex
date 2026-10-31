/** Official native transport fixture; no scheduler, provider credentials or model. */
import { realpath } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import * as Connection from '@deepseek-ai/dsh-client-connection';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import Access from '@deepseek-ai/dsh-api-remote-access';
import WebServer from '@deepseek-ai/dsh-host-webserver';
import { TypertRemoteService, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';
import { z } from 'zod';
import { createTeamRemote } from '../../src/native/remote.mjs';
export const contract = { name: 'dsh-team-roles', version: 1, capabilities: ['native-session', 'durable-role-snapshots', 'native-role-settings', 'text-input', 'idempotent-admission', 'host-activity'] };
export const fixtureRuntime = async () => {
  const { loadRuntime } = await import('../../src/native/runtime.mjs');
  return loadRuntime;
};
export async function serveNativeFixture({ dispatch = async () => ({}), health = contract } = {}) {
  const ctx = new Context();
  await ctx.plugin(TypertRegistry);
  const record = { kind: 'grant', payload: { version: 1, secret: Buffer.alloc(32, 57).toString('base64url') } };
  ctx.provide('credentials', { modifyRecord: async (_key, mutate) => { if (await mutate(record) !== undefined) throw new Error('Fixture credentials are read-only'); return record; } });
  await ctx.plugin(Connection); await ctx.plugin(Access); await ctx.plugin(Gateway);
  const remote = createTeamRemote({ createTypertRemoteInfo, z });
  class FixtureRemote extends TypertRemoteService {
    static inject = ['typert'];
    constructor(child) {
      super(child, 'roleTeams');
      child.effect(() => child.typert.register({ package: remote.package, face: 'host', schemas: [], invocations: remote.descriptors, model: { services: [], events: [], objects: [] } }));
    }
    async call(method, request) {
      try {
        const value = await dispatch(method, request);
        return method === 'health' ? { ok: true, api: health, sourceSha: null, runtime: { packageVersion: '0.2.2-alpha.2' }, host: { pid: process.pid, instanceId: process.env.DSH_OWNED_INSTANCE_ID ?? null, home: process.env.DSH_HOME ? await realpath(process.env.DSH_HOME) : null }, ...value } : value;
      } catch (error) { throw new RemoteError(error.code ?? 'team-roles/NATIVE_FAILURE', error.message, {}); }
    }
    health(r) { return this.call('health', r); } create(r) { return this.call('create', r); }
    send(r) { return this.call('send', r); } status(r) { return this.call('status', r); }
    result(r) { return this.call('result', r); } stop(r) { return this.call('stop', r); }
    activity(r) { return this.call('activity', r); } prepareShutdown(r) { return this.call('prepareShutdown', r); }
  }
  await ctx.plugin(FixtureRemote);
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 });
  const url = ctx.connection.authenticatedUrl(ctx.webServer.getOrigin());
  return { ctx, url, close: () => ctx.fiber.dispose() };
}
