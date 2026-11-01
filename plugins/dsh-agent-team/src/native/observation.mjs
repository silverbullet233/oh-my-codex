/** Narrow use of the pinned official generated Session/UserQuestions Remote contracts. */
import { ClientError } from './errors.mjs';
import { aborted, untilAbort } from './interactions.mjs';
export function nativeValue(result) {
  if (!result?.ok) throw new ClientError(result?.error?.code ?? 'GATEWAY_UNAVAILABLE', result?.error?.message ?? 'Native observation unavailable.');
  return result.value;
}
export class NativeObservation {
  constructor(gateway) { this.gateway = gateway; }
  async unary(method, request, signal) { return nativeValue(await untilAbort(this.gateway.ctx.remote.session[method](request, signal), signal)); }
  async *stream(method, request, signal) {
    for await (const frame of this.gateway.ctx.remote.session[method](request, signal)) { aborted(signal); yield frame; }
  }
  async opening(sessionId, signal) {
    const lifetime = new AbortController(), combined = AbortSignal.any([lifetime.signal, signal]);
    try {
      for await (const frame of this.stream('follow', { address: { kind: 'session', sessionId }, assistantStream: true, maxMessages: 20 }, combined)) {
        if (frame.type !== 'snapshot' || frame.header?.id !== sessionId || !Number.isSafeInteger(frame.cursor)) throw new ClientError('INVALID_BASELINE', 'Native follow opening does not match the requested Session.');
        lifetime.abort(); return frame;
      }
      throw new ClientError('INVALID_BASELINE', 'Native follow ended without its opening snapshot.');
    } finally { lifetime.abort(); }
  }
  async managed(teamId, signal) {
    const status = nativeValue(await untilAbort(this.gateway.ctx.remote.roleTeams.status({ teamId }), signal));
    if (status.teamId !== teamId || status.sessionId !== teamId) throw new ClientError('INTERACTION_SCOPE', 'The requested Session is not a managed Lead/root.');
    return status;
  }
  async authority(source, agentId, payload, signal) {
    const opening = await this.opening(agentId, signal);
    const permission = source === 'approval' || payload.questions?.some(q => q.intent?.kind === 'approval');
    let status;
    try { status = await this.managed(agentId, signal); }
    catch (error) {
      if (!permission || !opening.header.parentSession || !['team-roles/UNKNOWN_TEAM', 'INTERACTION_SCOPE'].includes(error.code)) throw new ClientError('INTERACTION_SCOPE', 'Only managed Lead questions or rostered native authority events are bridged.');
      status = await this.managed(opening.header.parentSession, signal);
      const roster = [...(status.team?.members ?? []), ...(status.teamActivity?.members ?? [])];
      if (!roster.some(m => m.id === agentId && m.role !== 'lead' && ['active', 'provisioning'].includes(m.phase))) throw new ClientError('INTERACTION_SCOPE', 'Native approval Agent is outside the managed Team roster.');
    }
    if (!permission && status.teamId !== agentId) throw new ClientError('INTERACTION_SCOPE', 'Member conversation is not exposed.');
    let correlationId = payload.wait?.callId;
    if (correlationId !== undefined && (typeof correlationId !== 'string' || !correlationId || correlationId.length > 256)) throw new ClientError('INVALID_INTERACTION', 'Invalid native question call identity.');
    let records = [...opening.records];
    if (source === 'approval') {
      // An approval callId is not an approval ID: one tool call may ask more than once.
      for (let page = 0; page < 3; page++) {
        const turnStart = records.findLastIndex(r => r.event?.type === 'turn/start');
        const pending = new Map();
        for (const { event } of records.slice(Math.max(0, turnStart))) {
          if (event?.type === 'approval/asked') pending.set(event.data.id, event.data);
          if (event?.type === 'approval/decided') pending.delete(event.data.id);
        }
        const matching = [...pending.values()].filter(a => a.toolName === payload.toolName && a.callId === payload.callId && a.reason === payload.reason);
        if (matching.length > 1) throw new ClientError('INTERACTION_CORRELATION', 'Ambiguous native approval audit identity; no permission was granted.');
        if (matching.length === 1 && (!opening.hasMore || turnStart >= 0)) { correlationId = matching[0].id; break; }
        const beforeSeq = records[0]?.event?.seq;
        if (!opening.hasMore || !Number.isSafeInteger(beforeSeq) || beforeSeq <= 0 || page === 2) throw new ClientError('INTERACTION_CORRELATION', 'Native approval audit identity is unavailable; no permission was granted.');
        const older = await this.unary('events', { address: { kind: 'session', sessionId: agentId }, throughSeq: opening.cursor, beforeSeq, maxMessages: 20 }, signal);
        records = [...older.records, ...records];
        if (!older.hasMore) opening.hasMore = false;
      }
    } else if (!correlationId) {
      const calls = new Map();
      for (const { event } of records) {
        if (event?.type === 'tool/call' && event.data.name === 'ask_user_question') calls.set(event.data.callId, event.data);
        if (event?.type === 'tool/result') calls.delete(event.data.message?.toolCallId);
      }
      const normalize = qs => qs.map(q => ({ id: q.id, question: q.question, header: q.header, options: q.options, multiSelect: q.multiSelect ?? q.multi_select ?? false }));
      const matching = [...calls.values()].filter(call => {
        try { const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments; return JSON.stringify(normalize(args.questions)) === JSON.stringify(normalize(payload.questions)); } catch { return false; }
      });
      if (matching.length === 1) correlationId = matching[0].callId;
      // Custom no-wait questions have no native business ID; never infer identity from text alone.
    }
    return { teamId: status.teamId, correlationId };
  }
  async claim(agentId, callId, signal) {
    const controller = new AbortController(), lifetime = AbortSignal.any([signal, controller.signal]);
    const iterator = this.gateway.ctx.remote.userQuestions.attachWait(agentId, callId, lifetime)[Symbol.asyncIterator]();
    try {
      const first = await untilAbort(iterator.next(), lifetime);
      if (first.done) throw new ClientError('STALE_INTERACTION', 'The native foreground question already ended.');
      const value = first.value;
      if (!Number.isFinite(value.remainingMs) || value.remainingMs < 0) throw new ClientError('INVALID_INTERACTION', 'Invalid native answer deadline.');
      const done = (async () => { try { while (!(await iterator.next()).done) {} } finally { controller.abort(); } })();
      void done.catch(() => {});
      return { remainingMs: value.remainingMs, done, dispose: async () => { controller.abort(); await done.catch(() => {}); } };
    } catch (error) { controller.abort(); await iterator.return?.().catch(() => {}); throw error; }
  }
}
