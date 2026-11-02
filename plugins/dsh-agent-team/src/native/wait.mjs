/** Bounded observation: native streams wake the client; no unary session.wait polling. */
import { ClientError } from './errors.mjs';
import { digest, untilAbort, aborted } from './interactions.mjs';
import { nativeValue } from './observation.mjs';
export async function waitForTeam(gateway, { teamId, timeoutMs = 10000, after }, callerSignal) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 30000) throw new ClientError('INVALID_WAIT', 'Wait timeout must be an integer from 0 to 30000 ms.');
  if ((gateway.activeWaits ?? 0) >= 4) throw new ClientError('WAIT_BUSY', 'At most four bounded waits may be active.');
  gateway.activeWaits = (gateway.activeWaits ?? 0) + 1;
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), timeoutMs);
  const clientSignal = gateway.waitLifetime.signal;
  const signal = AbortSignal.any([callerSignal, stop.signal, clientSignal]);
  const cursors = new Map(), states = new Map(), attempts = new Map(), observed = new Set(), pumps = [], ready = [];
  let changed = Promise.withResolvers(), failed, repaired = false, value, baseline;
  const notify = () => { changed.resolve(); };
  const unsub = gateway.interactions.onChange(notify); gateway.waiters.add(notify);
  const view = async (readSignal) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      aborted(readSignal);
      await untilAbort(gateway.ready(), readSignal); aborted(readSignal);
      const ctx = gateway.ctx;
      try {
        const status = await gateway.observation.managed(teamId, readSignal);
        const result = nativeValue(await untilAbort(ctx.remote.roleTeams.result({ teamId }), readSignal));
        await gateway.refreshPending(teamId, readSignal);
        if (ctx === gateway.ctx && !gateway.invalid) return { status, result };
      } catch (error) { aborted(readSignal); if (ctx === gateway.ctx && !gateway.invalid) throw error; }
      repaired = true;
    }
    throw new ClientError('GATEWAY_UNAVAILABLE', 'Native connection repeatedly changed during observation. Retry a bounded wait.');
  };
  const signature = current => digest({ instanceId: gateway.entry.instanceId,
    taskState: current.status.taskState, runtimeState: current.status.runtimeState, rootTurnState: current.status.rootTurnState,
    completed: current.result.completed, activity: current.status.teamActivity,
    cursors: [...cursors].sort(), states: [...states].sort(), attempts: [...attempts].sort(),
    pending: gateway.interactions.pending(teamId).map(p => [p.interactionId, p.deliveryId, p.requiresUser]),
  });
  const output = (reason, current = value) => ({ teamId, reason, baseline: current ? signature(current) : null, resynchronized: repaired,
    interactions: gateway.interactions.pending(teamId), ...(current ? { status: current.status, result: current.result } : { status: null, result: null }) });
  const pump = (id, method) => {
    const opening = Promise.withResolvers(); ready.push(opening.promise);
    let opened = false;
    const running = (async () => {
      for (let retry = 0; !signal.aborted && retry < 3; retry++) {
        let first = true;
        try {
          await untilAbort(gateway.ready(), signal);
          const address = id === teamId ? { kind: 'session', sessionId: id }
            : { kind: 'subagent', parentSessionId: teamId, childSessionId: id, mode: 'unknown' };
          const request = method === 'follow' ? { address, assistantStream: true, maxMessages: 1 } : { sessionId: id };
          for await (const frame of gateway.observation.stream(method, request, signal)) {
            if (method === 'observeState') {
              if (!Number.isSafeInteger(frame.cursor) || typeof frame.active !== 'boolean' || typeof frame.running !== 'boolean') throw new ClientError('INVALID_BASELINE', 'Invalid native Session state.');
              states.set(id, { active: frame.active, running: frame.running, queue: frame.queue?.map(q => [q.id, q.placement, q.rpcId]) ?? null });
            } else if (first) {
              if (frame.type !== 'snapshot' || frame.header?.id !== id || !Number.isSafeInteger(frame.cursor)) throw new ClientError('INVALID_BASELINE', 'Invalid native follow opening.');
              cursors.set(id, frame.cursor); attempts.set(id, frame.assistantStream?.activeAttempt?.attemptId ?? null);
            } else if (frame.type === 'event') {
              if (frame.event.seq <= cursors.get(id)) continue;
              if (frame.event.seq !== cursors.get(id) + 1) throw new ClientError('STREAM_GAP', 'Native sequence gap; replacing the observation from a snapshot.');
              cursors.set(id, frame.event.seq);
            } else if (frame.type === 'assistant-stream') {
              if (frame.frame.type === 'chunk') continue;
              attempts.set(id, frame.frame.type === 'start' ? frame.frame.attemptId : null);
            }
            if (first) { if (opened) repaired = true; opened = true; first = false; opening.resolve(); }
            notify();
          }
          if (!signal.aborted) throw new ClientError('STREAM_ENDED', 'Native observation ended; replacing the snapshot.');
        } catch (error) {
          if (signal.aborted) return;
          if (!['STREAM_GAP', 'STREAM_ENDED', 'INVALID_BASELINE'].includes(error.code)) gateway.invalid = true;
          if (retry === 2) { failed = error; opening.reject(error); notify(); return; }
        }
      }
    })();
    void running.catch(error => { failed = error; opening.reject(error); notify(); });
    // A failed opening is consumed even when the overall deadline expires first.
    void opening.promise.catch(() => {}); pumps.push(running);
  };
  const observe = status => {
    const ids = [...new Set([teamId, ...(status.team?.members ?? status.teamActivity?.members ?? []).map(m => m.id)])];
    if (new Set([...observed, ...ids]).size > 32) throw new ClientError('WAIT_LIMIT', 'The wait exceeds its bound of 32 distinct observed Sessions.');
    for (const id of ids) if (!observed.has(id)) { observed.add(id); pump(id, 'follow'); pump(id, 'observeState'); }
  };
  try {
    if (!signal.aborted) {
      value = await view(signal); observe(value.status);
      await untilAbort(Promise.all(ready), signal);
      value = await view(signal); baseline = signature(value);
      if (gateway.interactions.pending(teamId).length) return output('interaction');
      if (value.result.completed === true) return output('completed');
      if (after !== undefined && after !== baseline) return output('changed');
      while (!signal.aborted) {
        await untilAbort(changed.promise, signal); changed = Promise.withResolvers();
        if (failed) throw failed;
        // Coalesce native event bursts. Assistant token chunks never notify this loop.
        await untilAbort(new Promise(resolve => setTimeout(resolve, 25)), signal);
        value = await view(signal); observe(value.status);
        if (gateway.interactions.pending(teamId).length) return output('interaction');
        if (value.result.completed === true) return output('completed');
        if (signature(value) !== baseline || repaired) return output('changed');
      }
    }
  } catch (error) { if (!signal.aborted) throw error; }
  finally {
    clearTimeout(timer); stop.abort(); unsub(); gateway.waiters.delete(notify);
    await Promise.allSettled(pumps); gateway.activeWaits--;
  }
  // One bounded final authoritative read also covers member-only changes at the deadline.
  if (callerSignal.aborted || clientSignal.aborted) return output('cancelled');
  try { value = await view(AbortSignal.any([callerSignal, clientSignal, AbortSignal.timeout(1000)])); } catch {}
  if (callerSignal.aborted || clientSignal.aborted) return output('cancelled');
  if (gateway.interactions.pending(teamId).length) return output('interaction');
  if (value?.result.completed === true) return output('completed');
  if (value && baseline !== undefined && (signature(value) !== baseline || repaired)) return output('changed');
  return output('timeout');
}
