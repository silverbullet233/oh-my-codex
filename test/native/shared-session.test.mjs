import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureRoles, mountNativeHost, textChunks, until } from '../fixtures/native-harness.mjs';

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-'));
  let host;
  t.after(async () => { await host?.dispose(); await rm(root, { recursive: true, force: true }); });
  host = await mountNativeHost({ root, ...options });
  return host;
}
const content = (text) => [{ type: 'text', text }];

test('bridge submissions appear in the same native SessionController and Team projections', { timeout: 20000 }, async (t) => {
  const host = await fixture(t);
  const workspace = await host.ctx.workspaceRegistry.create(host.fixtureRoot);
  const input = { key: 'synthetic-team-one', text: 'Add the synthetic values 2 and 3.', cwd: host.fixtureRoot, workspaceId: workspace.id };
  const receipt = await host.client.request('create', input);
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.sessionId, receipt.teamId);
  await until(() => host.requests.length === 1 && host.ctx.agents.get(receipt.teamId)?.status === 'idle');
  const nativeList = await host.ctx.sessionController.list({}, new AbortController().signal);
  assert(nativeList.items.some((item) => item.sessionId === receipt.teamId));
  assert(workspace.sessionIds.includes(receipt.teamId));
  const duplicate = await host.client.request('create', input);
  assert.equal(duplicate.teamId, receipt.teamId);
  assert.equal(duplicate.duplicate, true);
  assert.equal(host.requests.length, 1);
  await assert.rejects(host.client.request('create', { ...input, text: 'Changed content.' }), { code: 'CONTENT_CONFLICT' });
  const lead = host.ctx.agents.get(receipt.teamId);
  assert.deepEqual(lead.model.current(), { provider: 'fixture-lead', model: 'fixture-model', reasoningEffort: 'max' });
  const originalSpawn = await host.ctx.tools.execute({
    agent: lead, signal: new AbortController().signal,
    calls: [{ type: 'tool-call', id: 'blocked-original-spawn', name: 'spawn_teammate', arguments: JSON.stringify({ name: 'unbound-bypass', description: 'Synthetic bypass negative control.', prompt: 'Synthetic bypass.', context: 'fresh' }) }],
  });
  assert.equal(originalSpawn.results[0].result.isError, true);
  assert.match(originalSpawn.results[0].result.error.message, /allowlisted role/u);
  assert.equal(host.ctx.agentTeams.listMembers(lead).some((item) => item.name === 'unbound-bypass'), false);
  const requestText = JSON.stringify(host.requests[0].messages);
  assert.match(requestText, /Coordinate synthetic fixture work/u);
  const projected = await host.ctx.sessionController.projections({ sessionId: receipt.teamId }, new AbortController().signal);
  assert.equal(projected.kind, 'sequenced');
  assert.equal(projected.values.agentTeam.id, receipt.teamId);
  assert.equal(projected.values.dshRoles.bound.role, 'lead');
  const result = await host.client.request('result', { teamId: receipt.teamId });
  assert.equal(result.completed, true);
  assert.equal(result.output, 'SYNTHETIC_COMPLETE');
  assert.equal(result.inputs.find((item) => item.id === receipt.inputId).processed, true);
  assert.equal(result.usage, null);
  assert.equal(result.fees, null);
  const audit = (await readFile(host.auditPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].payload.messages, host.requests[0].messages);
});

test('concurrent native members receive their immutable roles before first inference and retain identity on follow-up', { timeout: 20000 }, async (t) => {
  const entered = new Set();
  const gate = Promise.withResolvers();
  t.after(() => gate.resolve());
  const host = await fixture(t, {
    respond: async (options) => {
      if (options.provider !== 'fixture-lead' && !entered.has(options.provider)) {
        entered.add(options.provider);
        await gate.promise;
      }
      return textChunks(`SYNTHETIC_${options.provider}`);
    },
  });
  const created = await host.client.request('create', { key: 'concurrent', text: 'Coordinate synthetic members.', cwd: host.fixtureRoot });
  const lead = host.ctx.agents.get(created.teamId);
  await lead.whenIdle();
  const signal = new AbortController().signal;
  const leftPromise = host.ctx.dshRoles.spawn(lead, { name: 'left-one', role: 'left', prompt: 'Compute synthetic left 7 plus 2.', signal });
  const rightPromise = host.ctx.dshRoles.spawn(lead, { name: 'right-one', role: 'right', prompt: 'Compute synthetic right 8 plus 3.', signal });
  const [left, right] = await Promise.all([leftPromise, rightPromise]);
  await until(() => entered.size === 2, { description: 'two simultaneously running member requests' });
  assert.equal(host.ctx.agents.get(left.member.id).status, 'running');
  assert.equal(host.ctx.agents.get(right.member.id).status, 'running');
  for (const [member, provider, instruction] of [[left, 'fixture-left', 'LEFT_ROLE_V1'], [right, 'fixture-right', 'RIGHT_ROLE_V1']]) {
    const request = host.requests.find((item) => item.sessionId === member.member.id);
    assert.equal(request.provider, provider);
    assert.equal(request.reasoningEffort, 'max');
    assert.match(JSON.stringify(request.messages), new RegExp(instruction, 'u'));
    const events = host.ctx.sessions.get(member.member.id).snapshotEvents();
    assert(events.findIndex((event) => event.type === 'plugin:dsh-agent-team/role-bound') < events.findIndex((event) => event.type === 'request/header'));
  }
  const tasks = await host.ctx.agentTeams.createTask(lead, { subject: 'Synthetic collaboration', description: 'Complete synthetic fixture work.', writeScopes: ['left-result.txt'] });
  assert.equal(tasks.status, 'pending');
  gate.resolve();
  await until(() => [left, right].every((member) => host.ctx.agents.get(member.member.id)?.status === 'idle'));
  await host.ctx.agentTeams.sendMessage(lead, { target: 'left-one', content: content('Synthetic follow-up: add 1.'), signal });
  await until(() => host.requests.filter((item) => item.sessionId === left.member.id).length === 2 && host.ctx.agents.get(left.member.id)?.status === 'idle');
  const repeated = await host.ctx.dshRoles.spawn(lead, { name: 'left-one', role: 'left', prompt: 'Compute synthetic left 7 plus 2.', signal });
  assert.equal(repeated.member.id, left.member.id);
  const secondInstance = await host.ctx.dshRoles.spawn(lead, { name: 'left-two', role: 'left', prompt: 'Compute synthetic left 3 plus 4.', signal });
  assert.notEqual(secondInstance.member.id, left.member.id);
  await until(() => host.ctx.agents.get(secondInstance.member.id)?.status === 'idle');
  const status = await host.client.request('status', { teamId: created.teamId });
  assert.equal(status.team.members.length, 3);
  assert.equal(status.team.tasks[0].subject, 'Synthetic collaboration');
  assert.equal(status.members.find((item) => item.name === 'left-one').lastRequest.provider, 'fixture-left');
  assert.equal(status.members.find((item) => item.name === 'right-one').lastRequest.provider, 'fixture-right');
});

test('cold recovery requires explicit continuation and keeps old role snapshots while new members use changed config', { timeout: 30000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-recovery-'));
  let host;
  t.after(async () => { await host?.dispose(); await rm(root, { recursive: true, force: true }); });
  host = await mountNativeHost({ root });
  const created = await host.client.request('create', { key: 'recovery', text: 'Synthetic recovery fixture.', cwd: host.fixtureRoot });
  const lead = host.ctx.agents.get(created.teamId);
  await lead.whenIdle();
  const signal = new AbortController().signal;
  const first = await host.ctx.dshRoles.spawn(lead, { name: 'stable-one', role: 'left', prompt: 'Synthetic first member.', signal });
  await until(() => host.ctx.agents.get(first.member.id)?.status === 'idle');
  await host.ctx.sessions.flush(lead.session);
  await host.ctx.sessions.flush(host.ctx.sessions.get(first.member.id));
  await host.dispose();
  host = undefined;
  const changed = { ...fixtureRoles, left: { ...fixtureRoles.left, provider: 'fixture-new', instructions: 'LEFT_ROLE_V2: New synthetic members only.' } };
  host = await mountNativeHost({ root, roles: changed });
  const cold = await host.client.request('status', { teamId: created.teamId });
  assert.equal(cold.runtimeState, 'unloaded');
  const old = cold.members.find((item) => item.name === 'stable-one');
  assert.equal(old.selected, null);
  assert.equal(old.lastRequest.provider, 'fixture-left');
  await assert.rejects(host.client.request('send', { teamId: created.teamId, inputId: 'continue-one', text: 'Synthetic continue.' }), { code: 'CONTINUATION_REQUIRED' });
  await host.client.request('send', { teamId: created.teamId, inputId: 'continue-one', text: 'Synthetic continue.', continue: true });
  await until(() => host.ctx.agents.get(created.teamId)?.status === 'idle');
  const resumedLead = host.ctx.agents.get(created.teamId);
  await host.ctx.agentTeams.sendMessage(resumedLead, { target: 'stable-one', content: content('Synthetic recovered follow-up.'), signal });
  await until(() => host.requests.some((item) => item.sessionId === first.member.id) && host.ctx.agents.get(first.member.id)?.status === 'idle');
  assert.equal(host.requests.find((item) => item.sessionId === first.member.id).provider, 'fixture-left');
  assert.match(JSON.stringify(host.requests.find((item) => item.sessionId === first.member.id).messages), /LEFT_ROLE_V1/u);
  const fresh = await host.ctx.dshRoles.spawn(resumedLead, { name: 'changed-two', role: 'left', prompt: 'Synthetic newly configured member.', signal });
  await until(() => host.requests.some((item) => item.sessionId === fresh.member.id) && host.ctx.agents.get(fresh.member.id)?.status === 'idle');
  assert.equal(host.requests.find((item) => item.sessionId === fresh.member.id).provider, 'fixture-new');
  assert.match(JSON.stringify(host.requests.find((item) => item.sessionId === fresh.member.id).messages), /LEFT_ROLE_V2/u);
  assert.equal(host.ctx.agentTeams.listMembers(resumedLead).filter((item) => item.name === 'stable-one').length, 1);
});

test('native cancellation and missing approval answerers fail closed without rollback or owner interaction privileges', { timeout: 20000 }, async (t) => {
  const host = await fixture(t, { respond: () => 'hang' });
  const created = await host.client.request('create', { key: 'cancel', text: 'Synthetic cancellable input.', cwd: host.fixtureRoot });
  const lead = host.ctx.agents.get(created.teamId);
  await until(() => host.requests.length === 1 && lead.status === 'running');
  const approval = await host.ctx.approval.request({ agent: lead, toolName: 'fixture_write', reason: 'Synthetic approval refusal check.' });
  assert.equal(approval, 'unavailable');
  assert.equal(lead.session.snapshotEvents().findLast((event) => event.type === 'approval/decided').data.outcome, 'unavailable');
  const passive = host.ctx.connection.createPeer({ principal: { kind: 'owner' }, interactions: 'none' });
  await assert.rejects(host.ctx.typertGateway.wireStream.open('$events', { args: {} }, (async function* () {})(), passive, new AbortController().signal), { code: 'gateway/interactions-forbidden' });
  await passive.dispose();
  const member = await host.ctx.dshRoles.spawn(lead, { name: 'cancel-one', role: 'left', prompt: 'Synthetic cancellable member.', signal: new AbortController().signal });
  await until(() => host.requests.some((item) => item.sessionId === member.member.id));
  await host.files.write('left-result.txt', 'retained');
  const stopped = await host.client.request('stop', { teamId: created.teamId });
  assert.equal(stopped.accepted, true);
  assert.equal(stopped.filesRolledBack, false);
  await until(() => lead.status === 'idle' && host.ctx.agents.get(member.member.id)?.status === 'idle');
  assert.equal(await host.files.read('left-result.txt'), 'retained');
  const status = await host.client.request('status', { teamId: created.teamId });
  assert.equal(status.taskState, 'aborted');
  await assert.rejects(host.client.request('send', { teamId: created.teamId, inputId: 'after-stop', text: 'Synthetic continuation.' }), { code: 'CONTINUATION_REQUIRED' });
});
