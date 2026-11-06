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
import SessionRemote from '@deepseek-ai/dsh-api-session-controller/remote';
import QuestionsRemote from '@deepseek-ai/dsh-user-questions/remote';
export class Channel {
  constructor() { this.items = []; }
  push(value) { this.items.push(value); this.wake?.(); }
  close() { this.ended = true; this.wake?.(); }
  async *stream(signal) {
    const wake = () => this.wake?.(); signal.addEventListener('abort', wake);
    try {
      while (!signal.aborted && !this.ended) {
        while (this.items.length && !signal.aborted) yield this.items.shift();
        if (!signal.aborted) await new Promise(resolve => { this.wake = resolve; });
      }
    } finally { signal.removeEventListener('abort', wake); }
  }
}
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
  const events = new Channel();
  ctx.effect(() => ctx.typertGateway.registerRemoteEvents(signal => events.stream(signal), { home: '/synthetic' }));
  const sessions = new Map(), streams = new Map(), calls = [];
  const session = id => {
    if (!sessions.has(id)) sessions.set(id, { header: { id, version: 1, createdAt: 0, isSeeded: false }, cursor: 0, records: [], hasMore: false, projections: { asOfSeq: 0, values: {} }, state: { cursor: 0, active: true, running: false, queue: [], pendingInput: [] } });
    return sessions.get(id);
  };
  const broadcast = (id, method, frame) => { for (const channel of streams.get(`${id}:${method}`) ?? []) channel.push(frame); };
  class SessionService extends TypertRemoteService {
    static inject = ['typert'];
    constructor(child) {
      super(child, 'sessionController', { namespace: 'session' });
      child.effect(() => child.typert.register({ package: SessionRemote.package, face: 'host', schemas: [], invocations: SessionRemote.descriptors.filter(d => ['follow', 'observeState', 'projections', 'events'].includes(d.method)), model: { services: [], events: [], objects: [] } }));
    }
    async *live(method, request, signal) {
      calls.push({ method, request });
      const id = request.address?.childSessionId ?? request.address?.sessionId ?? request.sessionId, data = session(id), channel = new Channel(), key = `${id}:${method}`;
      if (request.address && data.header.origin === 'subagent') {
        if (request.address.kind === 'session') throw new RemoteError('session/agent-busy', 'subagent Sessions require their durable parent address', {});
        if (request.address.parentSessionId !== data.header.parentSession) throw new RemoteError('subagent/unauthorized', 'subagent does not belong to the supplied parent', {});
      }
      const listeners = streams.get(key) ?? new Set(); streams.set(key, listeners); listeners.add(channel);
      try {
        yield method === 'follow' ? { type: 'snapshot', header: data.header, cursor: data.cursor, records: data.records, hasMore: data.hasMore, projections: data.projections } : data.state;
        yield* channel.stream(signal);
      } finally { listeners.delete(channel); }
    }
    follow(request, signal) { return this.live('follow', request, signal); }
    observeState(request, signal) { return this.live('observeState', request, signal); }
    async projections({ sessionId }) { return { kind: 'sequenced', ...session(sessionId).projections }; }
    async events({ address, beforeSeq, throughSeq }) { const data = session(address.sessionId); return { cursor: throughSeq, hasMore: false, records: data.records.filter(r => r.event.seq < beforeSeq) }; }
  }
  await ctx.plugin(SessionService);
  const claims = new Map(), continuedAnswers = [];
  ctx.typert.lookups.register('agent', { parameter: 'agent', wire: 'agentId', hostTypeSymbol: '@deepseek-ai/dsh-agent#Agent', wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId', resolve: id => ({ id, ctx }) });
  ctx.typert.contexts.registerHost('agent', { wire: 'agentId', wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId', resolve: () => ctx });
  class QuestionsService extends TypertRemoteService {
    static inject = ['typert'];
    constructor(child) {
      super(child, 'userQuestions');
      child.effect(() => child.typert.register({ package: QuestionsRemote.package, face: 'host', schemas: [], invocations: QuestionsRemote.descriptors, model: { services: [], events: [], objects: [] } }));
    }
    async *attachWait(agent, callId, signal) {
      const channel = new Channel(); claims.set(callId, channel);
      try { yield { remainingMs: 1000 }; yield* channel.stream(signal); } finally { claims.delete(callId); }
    }
    async answer(agent, callId, answer) { continuedAnswers.push({ agentId: agent.id, callId, answer }); return true; }
  }
  await ctx.plugin(QuestionsService);
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
        return method === 'health' ? { ok: true, api: health, sourceSha: null, runtime: { packageVersion: '0.2.2-alpha.3' }, host: { pid: process.pid, instanceId: process.env.DSH_OWNED_INSTANCE_ID ?? null, home: process.env.DSH_HOME ? await realpath(process.env.DSH_HOME) : null, permissionBinding: process.env.DSH_AGENT_TEAM_LAUNCH_PERMISSION_BINDING ?? null }, ...value } : value;
      } catch (error) { throw new RemoteError(error.code ?? 'team-roles/NATIVE_FAILURE', error.message, {}); }
    }
    health(r) { return this.call('health', r); } create(r) { return this.call('create', r); }
    send(r) { return this.call('send', r); } status(r) { return this.call('status', r); }
    result(r) { return this.call('result', r); } stop(r) { return this.call('stop', r); }
    turnResult(r) { return this.call('turnResult', r); }
    input(r) { return this.call('input', r); }
    jobs(r) { return this.call('jobs', r); }
    withdrawInput(r) { return this.call('withdrawInput', r); }
    activity(r) { return this.call('activity', r); } prepareShutdown(r) { return this.call('prepareShutdown', r); }
  }
  await ctx.plugin(FixtureRemote);
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 });
  const url = ctx.connection.authenticatedUrl(ctx.webServer.getOrigin());
  return { ctx, url, session, broadcast, calls, streams, claims, continuedAnswers,
    interaction(event, agentId, request, signal = new AbortController().signal) {
      const outcome = Promise.withResolvers(); void outcome.promise.catch(() => {});
      const agent = { ctx };
      events.push({ event, request: { ...request, agent, signal }, context: { value: ctx, subject: agent, agentId }, resolve: value => { claims.get(request.wait?.callId)?.close(); outcome.resolve(value); }, reject: outcome.reject });
      return outcome.promise;
    },
    close: () => ctx.fiber.dispose() };
}
