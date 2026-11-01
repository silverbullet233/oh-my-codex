/** Process-local delivery queue. The native Host owns requests, cancellation and replay. */
import { createHash, randomUUID } from 'node:crypto';
import { ClientError } from './errors.mjs';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function aborted(signal) { if (signal?.aborted) throw signal.reason ?? new ClientError('CANCELLED', 'Operation cancelled.'); }
export function untilAbort(promise, signal) {
  aborted(signal);
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const cancel = () => { cleanup(); reject(signal.reason ?? new ClientError('CANCELLED', 'Operation cancelled.')); };
    const cleanup = () => signal.removeEventListener('abort', cancel);
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
const fail = (code, message) => new ClientError(code, message);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function questions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16 || new Set(value.map(q => q?.id)).size !== value.length) throw fail('INVALID_INTERACTION', 'Invalid native question batch.');
  for (const q of value) {
    if (!object(q) || typeof q.id !== 'string' || !q.id || q.id.length > 256 || typeof q.question !== 'string' || !q.question) throw fail('INVALID_INTERACTION', 'Invalid native question.');
    if (q.options !== undefined && (!Array.isArray(q.options) || q.options.length > 64 || q.options.some(o => !object(o) || typeof o.label !== 'string'))) throw fail('INVALID_INTERACTION', 'Invalid native choices.');
    if (q.intent !== undefined && (!object(q.intent) || !['approval', 'plan-review'].includes(q.intent.kind))) throw fail('INVALID_INTERACTION', 'Unsupported native decision intent.');
    if (q.intent?.kind === 'approval' && (value.length !== 1 || q.multiSelect || !q.options?.some(o => o.label === q.intent.approve) || !q.options.some(o => o.label === q.intent.reject) || q.intent.approve === q.intent.reject)) throw fail('INVALID_INTERACTION', 'Invalid native permission question.');
  }
}
function answerBatch(asked, answers) {
  if (!Array.isArray(answers) || answers.length !== asked.length || new Set(answers.map(a => a?.id)).size !== asked.length) throw fail('INVALID_ANSWER', 'Answer every question exactly once.');
  for (const q of asked) {
    const a = answers.find(item => item?.id === q.id);
    if (!object(a) || Object.keys(a).some(k => !['id', 'selected', 'custom'].includes(k)) || !Array.isArray(a.selected) || a.selected.some(s => typeof s !== 'string' || !q.options?.some(o => o.label === s)) || new Set(a.selected).size !== a.selected.length || (a.custom !== undefined && typeof a.custom !== 'string') || (!q.multiSelect && a.selected.length + Number(Boolean(a.custom?.trim())) > 1) || (!a.selected.length && !a.custom?.trim())) throw fail('INVALID_ANSWER', 'Use offered labels or a nonempty custom answer; respect single-select questions.');
  }
  return { answers: structuredClone(answers) };
}
export class InteractionQueue {
  constructor({ instanceId, authorize, claimTimed, answerContinued, maxPending = 32, maxBytes = 262144, timeoutMs = 300000 } = {}) {
    Object.assign(this, { instanceId, authorize, claimTimed, answerContinued, maxPending, maxBytes, timeoutMs });
    this.rows = new Map(); this.listeners = new Set(); this.handlers = 0; this.bytes = 0; this.revision = 0;
  }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  changed() { this.revision++; for (const notify of this.listeners) notify(); }
  invalidate() { for (const row of this.rows.values()) { row.invalid = true; this.retire(row, 'cancelled'); } }
  pending(teamId) {
    return [...this.rows.values()].filter(r => r.state === 'pending' && (!teamId || r.teamId === teamId)).map(r => ({ teamId: r.teamId, interactionId: r.id, deliveryId: r.deliveryId, kind: r.kind, source: r.source, agentId: r.agentId, correlationId: r.correlationId ?? null, requiresUser: r.requiresUser, ...(r.escalation ? { escalation: r.escalation } : {}), expiresAt: r.expiresAt, ...(r.continued ? { continued: true } : {}), request: structuredClone(r.payload) }));
  }
  retire(row, state) {
    if (row.state !== 'pending') return;
    clearTimeout(row.timer); this.bytes -= row.bytes; row.bytes = 0; row.state = state; row.payload = undefined;
    this.changed();
    while (this.rows.size > 128) { const old = [...this.rows.values()].find(r => r.state !== 'pending' && r !== row); if (!old) break; this.rows.delete(old.id); }
  }
  create({ source, agentId, teamId, correlationId, payload, continued = false }) {
    const id = correlationId ? digest([this.instanceId, agentId, source, correlationId, payload]) : randomUUID();
    const prior = this.rows.get(id);
    if (!prior?.invalid && (prior?.state === 'pending' || (continued && prior?.state === 'submitted'))) return prior;
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    if (bytes > 65536 || this.pending().length >= this.maxPending || this.bytes + bytes > this.maxBytes) throw fail('INTERACTION_QUEUE_FULL', 'Interaction queue limit reached; no approval was granted.');
    const kind = source === 'approval' || payload.questions?.some(q => q.intent?.kind === 'approval') ? 'approval' : 'question';
    const row = { id, deliveryId: randomUUID(), source, agentId, teamId, correlationId, kind, payload, bytes, state: 'pending', requiresUser: kind === 'approval', continued, bindings: new Set(), expiresAt: Date.now() + this.timeoutMs };
    this.rows.set(id, row); this.bytes += bytes; this.changed(); return row;
  }
  async receive(source, agentId, request, signal) {
    aborted(signal);
    if (this.handlers >= this.maxPending) throw fail('INTERACTION_QUEUE_FULL', 'Too many unresolved native deliveries; no approval was granted.');
    this.handlers++;
    try {
      const payload = source === 'approval' ? { toolName: request.toolName, ...(request.callId ? { callId: request.callId } : {}), ...(request.reason ? { reason: request.reason } : {}), ...(request.displayReason ? { displayReason: request.displayReason } : {}) } : { questions: request.questions, ...(request.wait ? { wait: request.wait } : {}) };
      if (Buffer.byteLength(JSON.stringify(payload)) > 65536) throw fail('INTERACTION_QUEUE_FULL', 'Native interaction exceeds the payload limit.');
      if (source === 'questions') questions(payload.questions);
      else if (typeof payload.toolName !== 'string' || !payload.toolName) throw fail('INVALID_INTERACTION', 'Invalid native approval.');
      const authority = await untilAbort(this.authorize(source, agentId, payload, signal), signal);
      aborted(signal);
      const row = this.create({ source, agentId, payload: structuredClone(payload), ...authority });
      const completion = Promise.withResolvers();
      void completion.promise.catch(() => {});
      row.deliverySignal = signal;
      const binding = { signal, resolve: completion.resolve, reject: completion.reject };
      const cancel = () => {
        row.bindings.delete(binding); binding.reject(signal.reason ?? fail('CANCELLED', 'Native interaction cancelled.'));
        if (!row.bindings.size) this.retire(row, 'cancelled');
      };
      row.bindings.add(binding); signal.addEventListener('abort', cancel, { once: true });
      let claim;
      try {
        if (payload.wait?.timed) {
          claim = await untilAbort(this.claimTimed(agentId, payload.wait.callId, signal), signal);
          row.expiresAt = Math.min(row.expiresAt, Date.now() + claim.remainingMs);
          // Native closure owns the claim: releasing before SDK result transmission can lose an answer.
          void claim.done.then(() => { if (row.state === 'pending') cancel(); }, () => { if (row.state === 'pending') cancel(); });
        }
        if (row.state === 'pending' && !row.timer) row.timer = setTimeout(() => {
          const error = fail(payload.wait?.timed ? 'ASK_TIMED_OUT' : 'INTERACTION_EXPIRED', 'The native interaction answer window expired.');
          if (payload.wait?.timed) error.name = 'UserQuestionError';
          this.retire(row, 'expired'); for (const b of row.bindings) b.reject(error);
        }, Math.max(0, row.expiresAt - Date.now()));
        aborted(signal);
        return await completion.promise;
      } finally {
        signal.removeEventListener('abort', cancel); row.bindings.delete(binding);
        if (!row.bindings.size && row.state === 'pending') this.retire(row, 'cancelled');
        // Claims end on native settlement or cancellation, never merely on a locally submitted answer.
        if (signal.aborted) await claim?.dispose();
      }
    } finally { this.handlers--; }
  }
  lookup({ teamId, interactionId, deliveryId }, allowAnswered = false) {
    const row = this.rows.get(interactionId);
    if (!row || row.invalid || row.teamId !== teamId || row.deliveryId !== deliveryId || (!allowAnswered && row.state !== 'pending') || !['pending', ...(allowAnswered ? ['submitted'] : [])].includes(row.state) || (!row.continued && (row.state === 'submitted' ? row.deliverySignal?.aborted : ![...row.bindings].some(b => !b.signal.aborted)))) throw fail('STALE_INTERACTION', 'Unknown, cancelled, expired or stale interaction delivery. Refresh pending interactions.');
    return row;
  }
  escalate(params) {
    const row = this.lookup(params);
    if (row.kind !== 'question') throw fail('INTERACTION_KIND', 'Approval decisions already require explicit user authorization.');
    row.requiresUser = true; row.escalation = params.reason; this.changed();
    return { escalated: true, interactionId: row.id, requiresUser: true };
  }
  async answer(params) {
    const row = this.lookup(params, true);
    if (row.kind !== 'question') throw fail('INTERACTION_KIND', 'Use the separate approval decision tool.');
    if (row.requiresUser && params.source !== 'user') throw fail('USER_DECISION_REQUIRED', 'This question was escalated; obtain the user answer first.');
    if (!['main', 'user'].includes(params.source)) throw fail('INVALID_ANSWER', 'Identify whether the answer came from main or the user.');
    if (row.state === 'submitted') return this.duplicate(row, params);
    const value = answerBatch(row.payload.questions, params.answers);
    return this.deliver(row, value, params);
  }
  async deliver(row, value, params) {
    if (row.continued) {
      if (row.answering) {
        if (row.answering.digest !== digest(params)) throw fail('INTERACTION_CONFLICT', 'A different continued reply is already in flight.');
        await row.answering.promise; return this.duplicate(row, params);
      }
      const promise = Promise.resolve().then(() => this.answerContinued(row.agentId, row.correlationId, value));
      row.answering = { digest: digest(params), promise };
      try {
        const result = await promise;
        if (result !== true) throw fail('STALE_INTERACTION', 'The continued question is no longer answerable.');
      } catch (error) { this.retire(row, 'uncertain'); throw error; }
    }
    return this.submit(row, value, params);
  }
  async approval(params) {
    const row = this.lookup(params, true);
    if (row.kind !== 'approval') throw fail('INTERACTION_KIND', 'This is a question, not an authority event.');
    if (!['approve', 'deny'].includes(params.decision) || (params.decision === 'approve' && !params.authorization?.trim())) throw fail('USER_DECISION_REQUIRED', 'One-shot approval requires explicit user authorization. Omission never grants approval.');
    if (row.state === 'submitted') return this.duplicate(row, params);
    const value = row.source === 'approval' ? (params.decision === 'approve' ? 'allowed-once' : 'rejected') : { answers: [{ id: row.payload.questions[0].id, selected: [row.payload.questions[0].intent[params.decision === 'approve' ? 'approve' : 'reject']] }] };
    return this.deliver(row, value, params);
  }
  duplicate(row, params) {
    if (row.replyDigest !== digest(params)) throw fail('INTERACTION_CONFLICT', 'This delivery already has a different submitted response.');
    return { submitted: true, duplicate: true, interactionId: row.id, confirmation: 'not-confirmed-by-native' };
  }
  submit(row, value, params) {
    row.replyDigest = digest(params); this.retire(row, 'submitted');
    for (const binding of row.bindings) { if (!binding.signal.aborted) binding.resolve(value); }
    return { submitted: true, duplicate: false, interactionId: row.id, confirmation: row.continued ? 'native-admitted' : 'not-confirmed-by-native' };
  }
  continued(teamId, active) {
    const retained = new Set((active ?? []).filter(q => q.state === 'continued').map(q => q.callId));
    for (const row of this.rows.values()) if (row.continued && row.teamId === teamId && row.state === 'pending' && !retained.has(row.correlationId)) this.retire(row, 'cancelled');
    for (const q of active ?? []) {
      if (q.state !== 'continued') continue;
      questions(q.questions);
      const row = this.create({ teamId, agentId: teamId, source: 'questions', correlationId: q.callId, payload: { questions: q.questions }, continued: true });
      if (row.state === 'pending' && !row.timer) row.timer = setTimeout(() => this.retire(row, 'expired'), this.timeoutMs);
    }
  }
}
