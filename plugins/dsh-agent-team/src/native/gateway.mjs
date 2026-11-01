import { once } from 'node:events';
import { createTeamRemote } from './remote.mjs';
import { ClientError } from './errors.mjs';
import { InteractionQueue, untilAbort, aborted } from './interactions.mjs';
import { NativeObservation, nativeValue } from './observation.mjs';
import { waitForTeam } from './wait.mjs';
const required = ['native-session', 'durable-role-snapshots', 'native-role-settings', 'text-input', 'idempotent-admission', 'host-activity'];
const writes = new Set(['create', 'send', 'stop', 'prepareShutdown']);
export function verifyHealth(value, entry) {
  if (value?.ok !== true || value.api?.name !== 'dsh-team-roles' || value.api.version !== 1
    || required.some(name => !value.api.capabilities?.includes(name)) || value.runtime?.packageVersion !== '0.2.2-alpha.2') throw new ClientError('CAPABILITY_MISMATCH', 'The owned host requires dsh-team-roles native API 1 and the exact supported runtime. No work was submitted.');
  if (entry && (value.host?.pid !== entry.pid || value.host?.instanceId !== entry.instanceId || (entry.home && value.host?.home !== entry.home))) throw new ClientError('OWNERSHIP_MISMATCH', 'The responding host is not this client’s attributed instance.');
}
/** Disposable authenticated native Node Gateway. It owns no execution state. */
export class GatewayClient {
  constructor({ runtime, entry, timeoutMs = 15000 }) {
    Object.assign(this, { runtime, entry, timeoutMs, invalid: true });
    this.observation = new NativeObservation(this); this.waiters = new Set(); this.waitLifetime = new AbortController(); this.connectionEpoch = 0; this.projectionSequences = new Map();
    this.interactions = new InteractionQueue({ instanceId: entry.instanceId,
      authorize: async (...args) => { await untilAbort(this.readyHealth.promise, args[3]); return this.observation.authority(...args); },
      claimTimed: (...args) => this.observation.claim(...args),
      answerContinued: async (agentId, callId, answer) => {
        try { return nativeValue(await this.ctx.remote.userQuestions.answer(agentId, callId, answer)); }
        catch { throw new ClientError('OUTCOME_UNCERTAIN', 'Continued-question reply may have been admitted. Inspect native state before an explicit retry.'); }
      },
    });
  }
  healthValue(value) { const pending = this.interactions.pending(); return { ...value, interactionBridge: { mode: 'answer', pendingCount: pending.length, teamIds: [...new Set(pending.map(p => p.teamId))] } }; }
  async ready() { if (this.invalid || this.connecting) { this.connecting ??= this.connect().finally(() => { this.connecting = undefined; }); await this.connecting; } }
  wake() { for (const notify of this.waiters) notify(); }
  async refreshPending(teamId, signal) {
    const ctx = this.ctx;
    let projections;
    try { projections = await this.observation.unary('projections', { sessionId: teamId }, signal); }
    catch (error) { aborted(signal); if (ctx !== this.ctx || this.invalid) return; throw error; }
    aborted(signal);
    if (ctx !== this.ctx || this.invalid || projections?.kind !== 'sequenced') return;
    if (!Number.isSafeInteger(projections.asOfSeq)) throw new ClientError('INVALID_BASELINE', 'Native projection has no valid sequence cut.');
    if (projections.asOfSeq < (this.projectionSequences.get(teamId) ?? -Infinity)) return;
    this.projectionSequences.set(teamId, projections.asOfSeq);
    this.interactions.continued(teamId, projections.values.userQuestions?.active);
  }
  async connect() {
    const epoch = this.connectionEpoch;
    await this.disconnect();
    const checkClosed = () => { if (epoch !== this.connectionEpoch) throw new ClientError('CANCELLED', 'Native client was closed during connection.'); };
    checkClosed();
    const { runtime, entry } = this;
    const launch = new URL(entry.url), origin = launch.origin;
    if (launch.protocol !== 'http:' || launch.hostname !== '127.0.0.1' || !launch.searchParams.get('token')) throw new ClientError('INVALID_HOST_ENTRY', 'Owned host entry is not an authenticated loopback Web origin.');
    launch.pathname = '/connect'; launch.searchParams.set('interactions', 'answer');
    let cookie;
    try {
      const response = await fetch(launch, { redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
      if (response.status !== 302) throw new Error();
      cookie = response.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error();
    } catch { throw new ClientError('AUTH_UNAVAILABLE', 'Native API authentication failed. Reconnect before retrying; task admission may be uncertain.'); }
    checkClosed();
    const ctx = this.ctx = new runtime.Context();
    this.readyHealth = Promise.withResolvers(); void this.readyHealth.promise.catch(() => {});
    const start = Promise.withResolvers();
    ctx.provide('loader', { await: () => start.promise });
    try {
      await ctx.plugin(runtime.TypertRegistry);
      runtime.installConnection(ctx, { interactions: 'answer', transport: {
        streamBaseUrl: origin,
        fetch: async (input, init) => {
          const response = await fetch(new URL(input, origin), { ...init, headers: { ...init.headers, Cookie: cookie }, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(this.timeoutMs)]) });
          if (response.status === 401 || response.status === 503) this.invalid = true;
          return response;
        },
        createWebSocket: address => {
          const socket = this.socket = new runtime.WebSocket(address, { headers: { Cookie: cookie } });
          socket.on('close', () => { if (this.ctx === ctx) { this.invalid = true; this.interactions.invalidate(); this.wake(); } });
          return socket;
        },
      } });
      await ctx.plugin(runtime.gateway);
      await ctx.remote.$mount(createTeamRemote(runtime));
      await ctx.remote.$mount(runtime.sessionRemote);
      await ctx.remote.$mount(runtime.questionRemote);
      const identity = Symbol('managed-team-agent');
      ctx.typert.contexts.registerClient('agent', {
        identity: candidate => candidate?.[identity],
        resolve: id => typeof id === 'string' && id.length > 0 && id.length <= 256 ? runtime.ownedValue(ctx.extend({ [identity]: id }), () => {}) : undefined,
      });
      for (const [event, source] of [['user-questions/request', 'questions'], ['approval/request', 'approval']]) {
        ctx.remote.$on(event, async (request, next) => {
          try { return await this.interactions.receive(source, request.agent?.[identity], request, request.signal); }
          catch (error) { if (error.code === 'INTERACTION_SCOPE' && !request.signal.aborted) return next(); throw error; }
        });
      }
      start.resolve();
      if (this.socket.readyState !== runtime.WebSocket.OPEN) await once(this.socket, 'open', { signal: AbortSignal.timeout(this.timeoutMs) });
      const result = await ctx.remote.roleTeams.health({});
      if (!result.ok) throw result.error;
      verifyHealth(result.value, entry);
      checkClosed();
      this.lastHealth = result.value;
      this.invalid = false;
      this.readyHealth.resolve();
    } catch (error) { start.resolve(); this.readyHealth.reject(error); await this.disconnect(); checkClosed(); throw error instanceof ClientError ? error : new ClientError('GATEWAY_UNAVAILABLE', 'Native Gateway readiness failed; the owned host is retained for inspection.'); }
  }
  async request(method, params = {}, options = {}) {
    if (Buffer.byteLength(JSON.stringify(params)) > 131072) throw new ClientError('REQUEST_TOO_LARGE', 'Request exceeds the admission size limit; no operation was submitted.');
    const signal = options.signal ?? new AbortController().signal;
    aborted(signal);
    if (this.waitLifetime.signal.aborted) this.waitLifetime = new AbortController();
    if (method === 'wait') return waitForTeam(this, params, signal);
    const wasInvalid = this.invalid;
    await untilAbort(this.ready(), signal);
    aborted(signal);
    if (wasInvalid && method === 'health') return this.healthValue(this.lastHealth);
    if (method === 'pending') {
      await this.observation.managed(params.teamId, signal);
      await this.refreshPending(params.teamId, signal);
      return { teamId: params.teamId, interactions: this.interactions.pending(params.teamId) };
    }
    if (method === 'answer') return this.interactions.answer(params);
    if (method === 'approval') return this.interactions.approval(params);
    if (method === 'escalate') return this.interactions.escalate(params);
    if (method === 'create' && params.permissionPreset !== undefined
      && !this.lastHealth.api.capabilities.includes('create-permission-preset')) {
      throw new ClientError('CAPABILITY_MISMATCH', 'This host does not support explicit create-time permission presets. No work was submitted; do not drop the requested preset or fall back.');
    }
    if (method === 'stop') this.wake();
    try {
      const result = await this.ctx.remote.roleTeams[method](params);
      if (!result.ok) {
        if (result.error.code?.startsWith('gateway/')) { this.invalid = true; throw new ClientError(writes.has(method) ? 'OUTCOME_UNCERTAIN' : 'GATEWAY_UNAVAILABLE', 'Native connection failed. Retain create/input IDs and inspect status before retrying.'); }
        throw new ClientError(result.error.code, result.error.message);
      }
      if (method === 'health') { verifyHealth(result.value, this.entry); this.lastHealth = result.value; }
      if (method === 'create' && params.permissionPreset !== undefined) {
        const actual = result.value?.permissions;
        if (actual?.preset !== params.permissionPreset || !['read-only', 'workspace-write', 'danger-full-access'].includes(actual?.sandbox?.mode)
          || !['ask', 'never'].includes(actual?.approvalPolicy) || !Number.isSafeInteger(actual?.asOfSeq)) {
          throw new ClientError('OUTCOME_UNCERTAIN', 'Create did not return a valid effective permission snapshot. Retain the create key and inspect native state; do not retry with different permissions.');
        }
      }
      return method === 'health' ? this.healthValue(result.value) : result.value;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      this.invalid = true;
      throw new ClientError(writes.has(method) ? 'OUTCOME_UNCERTAIN' : 'GATEWAY_UNAVAILABLE', 'Native connection failed. Retain IDs; work continues independently and admission may be uncertain.');
    }
  }
  async disconnect() { this.invalid = true; this.projectionSequences.clear(); this.interactions.invalidate(); this.wake(); const ctx = this.ctx; this.ctx = undefined; await ctx?.fiber.dispose(); }
  async close() {
    this.connectionEpoch++; this.waitLifetime.abort();
    const connecting = this.connecting;
    await this.disconnect();
    if (connecting) { await connecting.catch(() => {}); await this.disconnect(); }
  }
}
