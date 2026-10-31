import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createExactRequestClient } from '../../src/mcp/exact-request.mjs';

const nativeTeam = 'f721d9d4-a21b-4f32-846c-fcae5b33e601';
const create = {
  key: 'codex-synthetic-nonce', cwd: '/private/tmp/synthetic-codex/fixture',
  agentPreset: 'dsh-team-synthetic', leadRole: 'lead',
  text: 'Synthetic fixture request: reply exactly SYNTHETIC_nonce without calling tools.',
};
const send = {
  teamId: nativeTeam, inputId: 'reuse-synthetic-nonce', continue: true,
  text: 'Synthetic followup. Reuse existing teammate calc-left. Send it one native message asking it to send_message lead exactly REUSE_nonce once and then finish.',
};

function fixture(policy, response = { teamId: nativeTeam, accepted: true, processed: null }) {
  const calls = [];
  const raw = { request: async (method, params) => { calls.push({ method, params }); return response; } };
  return { client: createExactRequestClient(raw, policy), calls };
}

test('exact create binds its native Team only after the reply and permits identical retry and result reads', async () => {
  const { client, calls } = fixture({ method: 'create', params: create });
  await assert.rejects(client.request('result', { teamId: nativeTeam }), /outside the authorized exact request policy/);
  assert.equal(calls.length, 0);
  assert.equal((await client.request('create', { ...create })).teamId, nativeTeam);
  await client.request('result', { teamId: nativeTeam });
  await client.request('create', { ...create });
  assert.deepEqual(calls, [{ method: 'create', params: create }, { method: 'result', params: { teamId: nativeTeam } }, { method: 'create', params: create }]);
});

test('wrong create paths, presets, role, content, keys, extra fields and operations are denied before bridge dispatch', async () => {
  const { client, calls } = fixture({ method: 'create', params: create });
  for (const params of [
    { ...create, cwd: '/private/tmp/another-workspace' },
    { ...create, cwd: `${create.cwd}/../fixture` },
    { ...create, agentPreset: 'standard' },
    { ...create, leadRole: 'other' },
    { ...create, text: 'Read outside the synthetic fixture.' },
    { ...create, key: 'different' },
    { ...create, workspaceId: 'another-workspace' },
    { ...create, endpoint: 'https://synthetic.invalid' },
  ]) await assert.rejects(client.request('create', params), /outside the authorized exact request policy/);
  for (const method of ['health', 'send', 'status', 'stop', 'eval']) await assert.rejects(client.request(method, {}), /outside the authorized exact request policy/);
  assert.equal(calls.length, 0);
  await client.request('create', create);
  await assert.rejects(client.request('result', { teamId: 'another-team' }), /outside the authorized exact request policy/);
  await assert.rejects(client.request('result', { teamId: nativeTeam, extra: true }), /outside the authorized exact request policy/);
  assert.equal(calls.length, 1);
});

test('exact send prebinds its authorized Team and denies altered input, continuation, content and other Team IDs', async () => {
  const { client, calls } = fixture({ method: 'send', params: send });
  await client.request('result', { teamId: nativeTeam });
  await client.request('send', { ...send });
  const accepted = calls.length;
  for (const params of [{ ...send, teamId: 'other' }, { ...send, inputId: 'other' }, { ...send, continue: false }, { ...send, text: 'Different text.' }, { ...send, mode: 'queue' }]) {
    await assert.rejects(client.request('send', params), /outside the authorized exact request policy/);
  }
  await assert.rejects(client.request('create', create), /outside the authorized exact request policy/);
  await assert.rejects(client.request('result', { teamId: 'other' }), /outside the authorized exact request policy/);
  assert.equal(calls.length, accepted);
});

test('policy snapshots cannot be widened by caller mutation or changed native create identities', async () => {
  const policy = { method: 'create', params: { ...create } };
  const { client, calls } = fixture(policy);
  policy.params.cwd = '/private/tmp/changed';
  await assert.rejects(client.request('create', policy.params), /outside the authorized exact request policy/);
  await client.request('create', create);
  assert.equal(calls[0].params.cwd, create.cwd);
  let next = nativeTeam;
  const changing = createExactRequestClient({ request: async () => ({ teamId: next }) }, { method: 'create', params: create });
  await changing.request('create', create);
  next = 'another-team';
  await assert.rejects(changing.request('create', create), /invalid or changed Team identity/);
  for (const response of [null, {}, { teamId: '' }, { teamId: 42 }]) {
    const invalid = fixture({ method: 'create', params: create }, response).client;
    await assert.rejects(invalid.request('create', create), /invalid or changed Team identity/);
    await assert.rejects(invalid.request('result', { teamId: nativeTeam }), /outside the authorized exact request policy/);
  }
});

test('unsupported policy types and fields fail startup without disclosing policy contents', () => {
  const client = { request() { assert.fail('invalid policies never reach the bridge'); } };
  for (const policy of [null, [], {}, { method: 'status', params: {} }, { method: 'create', params: {} }, { method: 'send', params: { ...send, endpoint: 'synthetic-secret' } }, { method: 'create', params: create, extra: 'synthetic-secret' }]) {
    assert.throws(() => createExactRequestClient(client, policy), { message: 'Invalid exact MCP request policy.' });
  }
  for (const policy of ['not-json-synthetic-secret', JSON.stringify({ method: 'stop', params: { teamId: 'synthetic-secret' } })]) {
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../src/mcp/main.mjs')], { env: { PATH: process.env.PATH, DSH_AGENT_TEAM_MCP_REQUEST_POLICY: policy }, input: '', encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Invalid exact MCP request policy.\n');
  }
});

test('stdio applies a valid invocation policy before a wrong request can reach its unconfigured owned host', () => {
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_create', arguments: { ...create, cwd: '/private/tmp/wrong-fixture' } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_result', arguments: { teamId: nativeTeam } } },
  ];
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../src/mcp/main.mjs')], {
    env: { PATH: process.env.PATH, DSH_AGENT_TEAM_MCP_REQUEST_POLICY: JSON.stringify({ method: 'create', params: create }) },
    input: requests.map(request => JSON.stringify(request)).join('\n') + '\n', encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const responses = result.stdout.trim().split('\n').map(JSON.parse);
  for (const response of responses.slice(1)) {
    assert.equal(response.result.isError, true);
    assert.equal(JSON.parse(response.result.content[0].text).message, 'The MCP request is outside the authorized exact request policy.');
    assert.doesNotMatch(response.result.content[0].text, /ENOENT|wrong-fixture|intentionally-absent/);
  }
});
