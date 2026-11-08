import assert from 'node:assert/strict';
import test from 'node:test';
import { assertInstalledMcp, installedToolNames, installProtocolVersion } from '../scripts/install-mcp-contract.mjs';
import { createDispatcher } from '../plugins/dsh-agent-team/src/mcp/server.mjs';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../plugins/dsh-agent-team/package.json', import.meta.url)));
const identity = { name: pkg.name, version: pkg.version };
async function replies() {
  const dispatch = createDispatcher({ request: () => { throw new Error('Discovery must not contact DSH'); } });
  return Promise.all([
    dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: installProtocolVersion } }),
    dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  ]);
}
const serialize = rows => rows.map(row => JSON.stringify(row)).join('\n') + '\n';

test('installation oracle accepts the actual MCP handshake and eighteen named tools without a host', async () => {
  const rows = await replies();
  assert.deepEqual(assertInstalledMcp(serialize(rows), identity).sort(), [...installedToolNames].sort());
  assert.doesNotThrow(() => assertInstalledMcp(serialize(rows.reverse()), identity));
});

test('installation oracle rejects missing, substituted, duplicate and unexpected tools, even at the same count', async () => {
  for (const mutate of [
    rows => rows[1].result.tools.splice(1, 1), // The former 17-tool surface lacks web_url.
    rows => { rows[1].result.tools[1].name = 'dsh_team_unknown'; },
    rows => { rows[1].result.tools[1] = rows[1].result.tools[0]; },
    rows => rows[1].result.tools.push(rows[1].result.tools[0]),
  ]) {
    const rows = structuredClone(await replies());
    mutate(rows);
    assert.throws(() => assertInstalledMcp(serialize(rows), identity), assert.AssertionError);
  }
});

test('installation oracle rejects wrong identity/version/protocol, RPC errors and incomplete or malformed discovery', async () => {
  for (const mutate of [
    rows => { rows[0].result.serverInfo.name = 'another-server'; },
    rows => { rows[0].result.serverInfo.version = '0.0.0'; },
    rows => { rows[0].result.protocolVersion = 'unsupported'; },
    rows => { rows[0].result.capabilities = {}; },
    rows => { rows[1].error = { code: -32603, message: 'failure' }; },
    rows => { rows[1].id = 1; },
    rows => { rows[1].jsonrpc = '1.0'; },
    rows => { rows[1].result.nextCursor = 'more'; },
    rows => { rows[1].result.tools[0].inputSchema.additionalProperties = true; },
    rows => rows.pop(),
  ]) {
    const rows = structuredClone(await replies());
    mutate(rows);
    assert.throws(() => assertInstalledMcp(serialize(rows), identity), assert.AssertionError);
  }
  assert.throws(() => assertInstalledMcp('not-json', identity), SyntaxError);
});
