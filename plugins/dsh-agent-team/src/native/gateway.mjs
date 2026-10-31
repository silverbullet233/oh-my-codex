import { once } from 'node:events';
import { createTeamRemote } from './remote.mjs';
import { ClientError } from './errors.mjs';
const required = ['native-session', 'durable-role-snapshots', 'native-role-settings', 'text-input', 'idempotent-admission', 'host-activity'];
const writes = new Set(['create', 'send', 'stop', 'prepareShutdown']);
export function verifyHealth(value, entry) {
  if (value?.ok !== true || value.api?.name !== 'dsh-team-roles' || value.api.version !== 1
    || required.some(name => !value.api.capabilities?.includes(name)) || value.runtime?.packageVersion !== '0.2.2-alpha.2') throw new ClientError('CAPABILITY_MISMATCH', 'The owned host requires dsh-team-roles native API 1 and the exact supported runtime. No work was submitted.');
  if (entry && (value.host?.pid !== entry.pid || value.host?.instanceId !== entry.instanceId || (entry.home && value.host?.home !== entry.home))) throw new ClientError('OWNERSHIP_MISMATCH', 'The responding host is not this client’s attributed instance.');
}
/** Disposable authenticated native Node Gateway. It owns no execution state. */
export class GatewayClient {
  constructor({ runtime, entry, timeoutMs = 15000 }) { this.runtime = runtime; this.entry = entry; this.timeoutMs = timeoutMs; this.invalid = true; }
  async connect() {
    await this.close();
    const { runtime, entry } = this;
    const launch = new URL(entry.url), origin = launch.origin;
    if (launch.protocol !== 'http:' || launch.hostname !== '127.0.0.1' || !launch.searchParams.get('token')) throw new ClientError('INVALID_HOST_ENTRY', 'Owned host entry is not an authenticated loopback Web origin.');
    launch.pathname = '/connect'; launch.searchParams.set('interactions', 'none');
    let cookie;
    try {
      const response = await fetch(launch, { redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
      if (response.status !== 302) throw new Error();
      cookie = response.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error();
    } catch { throw new ClientError('AUTH_UNAVAILABLE', 'Native API authentication failed. Reconnect before retrying; task admission may be uncertain.'); }
    const ctx = this.ctx = new runtime.Context();
    try {
      await ctx.plugin(runtime.TypertRegistry);
      runtime.installConnection(ctx, { interactions: 'none', transport: {
        streamBaseUrl: origin,
        fetch: async (input, init) => {
          const response = await fetch(new URL(input, origin), { ...init, headers: { ...init.headers, Cookie: cookie }, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(this.timeoutMs)]) });
          if (response.status === 401 || response.status === 503) this.invalid = true;
          return response;
        },
        createWebSocket: address => {
          const socket = this.socket = new runtime.WebSocket(address, { headers: { Cookie: cookie } });
          socket.on('close', () => { if (this.ctx === ctx) this.invalid = true; });
          return socket;
        },
      } });
      await ctx.plugin(runtime.gateway);
      await ctx.remote.$mount(createTeamRemote(runtime));
      if (this.socket.readyState !== runtime.WebSocket.OPEN) await once(this.socket, 'open', { signal: AbortSignal.timeout(this.timeoutMs) });
      const result = await ctx.remote.roleTeams.health({});
      if (!result.ok) throw result.error;
      verifyHealth(result.value, entry);
      this.lastHealth = result.value;
      this.invalid = false;
    } catch (error) { await this.close(); throw error instanceof ClientError ? error : new ClientError('GATEWAY_UNAVAILABLE', 'Native Gateway readiness failed; the owned host is retained for inspection.'); }
  }
  async request(method, params = {}) {
    if (Buffer.byteLength(JSON.stringify(params)) > 131072) throw new ClientError('REQUEST_TOO_LARGE', 'Request exceeds the admission size limit; no operation was submitted.');
    const wasInvalid = this.invalid;
    if (this.invalid || this.connecting) { this.connecting ??= this.connect().finally(() => { this.connecting = undefined; }); await this.connecting; }
    if (wasInvalid && method === 'health') return this.lastHealth;
    try {
      const result = await this.ctx.remote.roleTeams[method](params);
      if (!result.ok) {
        if (result.error.code?.startsWith('gateway/')) { this.invalid = true; throw new ClientError(writes.has(method) ? 'OUTCOME_UNCERTAIN' : 'GATEWAY_UNAVAILABLE', 'Native connection failed. Retain create/input IDs and inspect status before retrying.'); }
        throw new ClientError(result.error.code, result.error.message);
      }
      if (method === 'health') verifyHealth(result.value, this.entry);
      return result.value;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      this.invalid = true;
      throw new ClientError(writes.has(method) ? 'OUTCOME_UNCERTAIN' : 'GATEWAY_UNAVAILABLE', 'Native connection failed. Retain IDs; work continues independently and admission may be uncertain.');
    }
  }
  async close() { this.invalid = true; const ctx = this.ctx; this.ctx = undefined; await ctx?.fiber.dispose(); }
}
