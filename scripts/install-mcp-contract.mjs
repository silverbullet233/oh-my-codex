import assert from 'node:assert/strict';

// Independent installation oracle: do not derive this list from the server under test.
export const installedToolNames = [
  'dsh_team_web', 'dsh_team_web_url', 'dsh_team_shutdown', 'dsh_team_health',
  'dsh_team_create', 'dsh_team_send', 'dsh_team_status', 'dsh_team_jobs',
  'dsh_team_input', 'dsh_team_withdraw_input', 'dsh_team_result', 'dsh_team_turn_result',
  'dsh_team_stop', 'dsh_team_pending', 'dsh_team_answer', 'dsh_team_escalate',
  'dsh_team_approval', 'dsh_team_wait',
];
export const installProtocolVersion = '2025-06-18';

/** Validate actual installed stdio replies, including handshake and exact tool identities. */
export function assertInstalledMcp(stdout, serverInfo) {
  const replies = stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(replies.length, 2, 'Expected exactly initialize and tools/list replies');
  for (const reply of replies) {
    assert.equal(reply.jsonrpc, '2.0');
    assert.equal(reply.error, undefined, 'Installed MCP returned a JSON-RPC error');
  }
  assert.deepEqual(replies.map(reply => reply.id).sort(), [1, 2], 'Missing or duplicate response ID');
  const initialized = replies.find(reply => reply.id === 1).result;
  assert.equal(initialized.protocolVersion, installProtocolVersion);
  assert.deepEqual(initialized.serverInfo, serverInfo);
  assert.deepEqual(initialized.capabilities, { tools: { listChanged: false } });
  const listed = replies.find(reply => reply.id === 2).result;
  assert.equal(listed.nextCursor, undefined, 'Installed tool discovery must be complete');
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), [...installedToolNames].sort());
  for (const tool of listed.tools) {
    assert.equal(typeof tool.description, 'string');
    assert(tool.description.length > 0);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  return listed.tools.map(tool => tool.name);
}
