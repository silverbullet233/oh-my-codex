import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDispatcher } from '../../src/mcp/server.mjs';
import { tools } from '../../src/mcp/tools.mjs';
const read = name => readFile(new URL(`../../${name}`, import.meta.url), 'utf8');

test('installed skill preserves explicit activation, Lead ownership, review and escalation', async () => {
  const skill = await read('skills/dsh-agent-team/SKILL.md');
  for (const clause of [
    'Use only when the user explicitly asks',
    'User <-> Codex main <-> DSH Lead <-> team members',
    'Delegate all implementation, testing and debugging to DSH Lead',
    'Do not implement, run project tests or debug the project yourself',
    'Do not spawn alternative Codex workers',
    'Do not send instructions directly to DSH members',
    'independent read-only review',
    'task decomposition and acceptance criteria',
    'If Lead cannot proceed',
    'escalate to the user',
  ]) assert(skill.includes(clause), `Missing orchestration clause: ${clause}`);
});

test('contract permits observations and honestly distinguishes guidance from global enforcement', async () => {
  const skill = await read('skills/dsh-agent-team/SKILL.md');
  const docs = await read('docs/orchestration.md');
  const pkg = JSON.parse(await read('package.json'));
  assert(skill.includes('Status/member observations are allowed; direct member instructions are not'));
  assert(skill.includes('Web for observation and user approval handoff, not member instructions'));
  assert(skill.includes('behavioral guidance: it does not remove Codex tools'));
  assert(skill.includes('normal Codex behavior is unchanged'));
  assert(docs.includes('Their access is unchanged') || docs.includes('their access is unchanged'));
  assert(docs.includes('not a restriction on every possible upstream/native channel'));
  assert(docs.includes(`plugin **${pkg.version}**`));
  assert(docs.includes('not Codex main'));
});

test('MCP create/send keep the Lead root and never dispatch member fields or message tools', async () => {
  const root = 'synthetic-lead-root', calls = [];
  const dispatch = createDispatcher({ async request(method, params) {
    calls.push({ method, params });
    if (method === 'create') return { teamId: root, sessionId: root, accepted: true };
    if (method === 'send') return { teamId: params.teamId, accepted: true };
    return { teamId: root, members: [{ memberId: 'synthetic-child', status: 'idle' }] };
  } });
  let id = 0;
  const call = (name, args) => dispatch({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } });
  await dispatch({ jsonrpc: '2.0', id: ++id, method: 'initialize' });
  const created = await call('dsh_team_create', { key: 'one', text: 'Agreed design and acceptance', cwd: '/synthetic' });
  const teamId = created.result.structuredContent.teamId;
  assert.equal(teamId, root);
  await call('dsh_team_send', { teamId, inputId: 'correction', text: 'Lead: apply the review correction', mode: 'queue' });
  assert.equal(calls[1].params.teamId, root);
  const observed = await call('dsh_team_status', { teamId });
  assert.equal(observed.result.structuredContent.members[0].memberId, 'synthetic-child');
  const count = calls.length;
  for (const field of ['memberId', 'agentId', 'recipient', 'sessionId']) {
    const response = await call('dsh_team_send', { teamId, inputId: 'denied', text: 'Must not dispatch', [field]: 'synthetic-child' });
    assert.equal(response.error.code, -32602);
  }
  for (const name of ['dsh_member_send', 'dsh_team_send_member', 'dsh_agent_prompt']) assert.equal((await call(name, { teamId: 'synthetic-child' })).error.code, -32602);
  assert.equal(calls.length, count);
  assert.equal(tools.length, 8);
  assert(tools.find(tool => tool.name === 'dsh_team_send').inputSchema.properties.teamId.description.includes('Lead/root'));
});


test('initialization permission is explicit, limited to setup/health and requires actual MCP connectivity', async () => {
  const skill = await read('skills/dsh-agent-team/SKILL.md'), guide = await read('docs/bootstrap.md');
  assert(skill.includes('Explicit user authorization to initialize this plugin'));
  assert(skill.includes('../../docs/bootstrap.md'));
  assert(skill.includes('does not authorize user-project implementation/testing/debugging'));
  assert(skill.includes('provider credential handling or direct teammate instructions'));
  assert(guide.includes('actual `dsh_team_health`'));
  assert(guide.includes('CLI-only health is insufficient'));
  assert(guide.includes('There is no auto-discovery'));
  assert(guide.includes('e9f89b9e93e0c236005d3ad60c78ade3a548ba38f4b9b881bb9fb6378b5f5d61'));
});
