import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { waitForTeam } from '../../src/native/wait.mjs';
import { untilAbort } from '../../src/native/interactions.mjs';
import { Channel } from '../fixtures/native-server.mjs';

// Controlled streams isolate deadline and roster races from native carrier timing.
function observation() {
  const streams = new Map(), opened = new Set();
  const state = { roster: ['lead'], running: false, completed: false };
  const gateway = {
    entry: { instanceId: 'boundary' }, waitLifetime: new AbortController(), waiters: new Set(), ready: async () => {}, refreshPending: async () => {},
    interactions: { onChange: () => () => {}, pending: () => [] },
    ctx: { remote: { roleTeams: { result: async () => ({ ok: true, value: { completed: state.completed } }) } } },
    observation: {
      async managed(teamId, signal) {
        state.readSignal = signal;
        if (state.readGate) await untilAbort(state.readGate.promise, signal);
        return { teamId, sessionId: teamId, team: { members: state.roster.map(id => ({ id })) } };
      },
      async *stream(method, request, signal) {
        const id = request.address?.sessionId ?? request.sessionId, key = `${id}:${method}`, channel = new Channel();
        opened.add(id); streams.set(key, channel);
        try {
          yield method === 'follow' ? { type: 'snapshot', header: { id }, cursor: 0 } : { cursor: 0, active: true, running: state.running, queue: [] };
          yield* channel.stream(signal);
        } finally { streams.delete(key); }
      },
    },
  };
  return { gateway, state, streams, opened };
}

test('roster replacements cannot exceed the accumulated observation bound', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { gateway, state, streams, opened } = observation();
  state.roster = ['lead', ...Array.from({ length: 31 }, (_, i) => `member-${i}`)];
  const waiting = waitForTeam(gateway, { teamId: 'lead', timeoutMs: 1000 }, new AbortController().signal);
  const outcome = assert.rejects(waiting, { code: 'WAIT_LIMIT' });
  await turn(); t.mock.timers.tick(25); await turn();
  state.roster = [...state.roster.slice(0, -1), 'replacement'];
  streams.get('lead:observeState').push({ cursor: 0, active: true, running: true, queue: [] });
  await turn(); t.mock.timers.tick(25); await outcome;
  assert.equal(opened.size, 32); assert.equal(opened.has('replacement'), false); assert.equal(streams.size, 0);
});

test('cancellation during the final authoritative read wins over any result', async t => {
  for (const mode of ['caller', 'client']) await t.test(mode, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { gateway, state } = observation(), caller = new AbortController();
    state.readGate = Promise.withResolvers(); state.completed = true;
    const waiting = waitForTeam(gateway, { teamId: 'lead', timeoutMs: 0 }, caller.signal);
    t.mock.timers.tick(0); await turn();
    assert(state.readSignal);
    (mode === 'caller' ? caller : gateway.waitLifetime).abort(); state.readGate.resolve();
    const result = await waiting;
    assert.equal(result.reason, 'cancelled'); assert.equal(state.readSignal.aborted, true);
  });
});

test('deadline coalescing preserves a meaningful change or stream replacement', async t => {
  for (const mode of ['state', 'replacement']) await t.test(mode, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { gateway, streams } = observation();
    const waiting = waitForTeam(gateway, { teamId: 'lead', timeoutMs: 100 }, new AbortController().signal);
    await turn(); t.mock.timers.tick(25); await turn();
    t.mock.timers.tick(65);
    if (mode === 'state') streams.get('lead:observeState').push({ cursor: 0, active: true, running: true, queue: [] });
    else streams.get('lead:follow').push({ type: 'event', event: { seq: 5 } });
    await turn(); t.mock.timers.tick(10);
    const result = await waiting;
    assert.equal(result.reason, 'changed'); assert.equal(result.resynchronized, mode === 'replacement'); assert.equal(streams.size, 0);
  });
});

test('connection replacement during a native read rebuilds the observation', async t => {
  for (const interrupted of ['status', 'result']) await t.test(interrupted, async () => {
    const { gateway, state, streams } = observation(); state.completed = true;
    const readStatus = gateway.observation.managed, readResult = gateway.ctx.remote.roleTeams.result;
    let replaced = false;
    const replace = () => { replaced = true; gateway.ctx = { ...gateway.ctx }; return { code: 'gateway/cancelled', message: 'Old connection disposed' }; };
    gateway.observation.managed = async (...args) => { if (interrupted === 'status' && !replaced) throw Object.assign(new Error(), replace()); return readStatus(...args); };
    gateway.ctx.remote.roleTeams.result = async () => interrupted === 'result' && !replaced ? { ok: false, error: replace() } : readResult();
    const result = await waitForTeam(gateway, { teamId: 'lead', timeoutMs: 1000 }, new AbortController().signal);
    assert.equal(result.reason, 'completed'); assert.equal(result.resynchronized, true); assert.equal(streams.size, 0);
  });
});

test('native read recovery is bounded and preserves current-connection refusals', async () => {
  const { gateway } = observation(); let attempts = 0;
  gateway.observation.managed = async () => { attempts++; throw Object.assign(new Error('Unknown Team'), { code: 'team-roles/UNKNOWN_TEAM' }); };
  await assert.rejects(waitForTeam(gateway, { teamId: 'lead' }, new AbortController().signal), { code: 'team-roles/UNKNOWN_TEAM' });
  assert.equal(attempts, 1); attempts = 0;
  gateway.observation.managed = async () => { attempts++; gateway.ctx = { ...gateway.ctx }; throw new Error('Connection disposed'); };
  await assert.rejects(waitForTeam(gateway, { teamId: 'lead' }, new AbortController().signal), { code: 'GATEWAY_UNAVAILABLE' });
  assert.equal(attempts, 3);
});
