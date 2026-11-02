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
  assert(skill.includes('Web for observation/settings only'));
  assert(skill.includes('unsupported concurrent interaction'));
  assert(skill.includes('never blanket/always approve'));
  assert(skill.includes('Main is the default Lead question handler'));
  assert(skill.includes('behavioral guidance: it does not remove Codex tools'));
  assert(skill.includes('normal Codex behavior is unchanged'));
  assert(docs.includes('Their access is unchanged') || docs.includes('their access is unchanged'));
  assert(docs.includes('not a restriction on every possible upstream/native channel'));
  assert(docs.includes(`plugin **${pkg.version}**`));
  assert(docs.includes('not Codex main'));
});

test('main/Lead English guidance preserves structured values and original quoted material', async () => {
  const skill = await read('skills/dsh-agent-team/SKILL.md'), docs = await read('docs/orchestration.md');
  assert(skill.includes('All communication between Codex main and DSH Lead must be in English'));
  for (const source of [skill, docs]) {
    assert(source.includes('Communicate with Codex main in English.'));
    assert(source.includes('original-language quotations'));
    assert(source.includes('behavioral'));
  }
  for (const name of ['dsh_team_create', 'dsh_team_send', 'dsh_team_answer']) assert(tools.find(tool => tool.name === name).description.includes('English'));
  const calls = [], dispatch = createDispatcher({ request: async (method, params) => { calls.push({ method, params }); return { accepted: true }; } });
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const brief = 'Communicate with Codex main in English. Fix `模块_α` in `/tmp/项目/src.ts`; original error: "权限不足".';
  const inputs = [
    ['dsh_team_create', { key: '任务-1', cwd: '/tmp/项目', text: brief }],
    ['dsh_team_send', { teamId: '会话-1', inputId: '跟进-1', text: brief }],
    ['dsh_team_answer', { teamId: '会话-1', interactionId: '交互-1', deliveryId: '投递-1', source: 'user', answers: [{ id: '问题-1', selected: ['现有选项'] }, { id: '问题-2', selected: [], custom: 'Use `/tmp/项目`; preserve the quoted message "权限不足".' }] }],
  ];
  for (const [index, [name, args]] of inputs.entries()) {
    const response = await dispatch({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name, arguments: args } });
    assert.equal(response.result?.isError, undefined); assert.deepEqual(calls[index].params, args);
  }
});

test('create-time permissions require explicit choice and keep native approval semantics', async () => {
  const skill = await read('skills/dsh-agent-team/SKILL.md');
  for (const clause of ['Only an explicit user selection', 'never infer them from the name or self-upgrade', 'Existing/restored Teams are checked read-only', '`never` denies actions', 'Workspace admission is not complete process confinement']) assert(skill.includes(clause));
  const description = tools.find(tool => tool.name === 'dsh_team_create').inputSchema.properties.permissionPreset.description;
  assert(description.includes('explicitly selected by the user')); assert(description.includes('Omit to preserve native defaults'));
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
  assert.equal(tools.length, 14);
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
  assert(guide.includes('5538a263d3d2e4f05e843153e524e1501f1564324951a9f21ed6470de5ade67e'));
});
