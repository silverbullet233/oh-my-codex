import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveSocketPath } from '../../src/bridge/socket-path.mjs';
import { serveFakeBridge } from '../fixtures/ipc-server.mjs';

test('socket resolution matches the host OS temporary directory and preserves an explicit legacy/custom path', () => {
  assert.equal(resolveSocketPath({}), join(tmpdir(), `dsh-agent-team-${process.getuid()}`, 'native.sock'));
  const legacy = join('/tmp', `dsh-agent-team-${process.getuid()}`, 'native.sock');
  assert.equal(resolveSocketPath({ DSH_AGENT_TEAM_SOCKET: legacy }), legacy);
});

test('CLI and MCP attach to the host default under a nondefault TMPDIR without a socket override', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-default-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const socketPath = join(root, `dsh-agent-team-${process.getuid()}`, 'native.sock');
  await mkdir(join(root, `dsh-agent-team-${process.getuid()}`), { mode: 0o700 });
  const calls = [];
  const server = await serveFakeBridge({ socketPath, bridge: { dispatch: async method => { calls.push(method); return { ok: true, roles: { leadRole: '', roles: [] } }; } } });
  t.after(() => server.close());
  async function run(args, input = '') {
    const child = spawn(process.execPath, args, { env: { PATH: process.env.PATH, TMPDIR: root }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const ended = new Promise((resolve_, reject) => { child.once('error', reject); child.once('close', code => resolve_({ code, stdout, stderr })); });
    child.stdin.end(input);
    return ended;
  }
  const cli = await run([resolve('scripts/client.mjs'), 'health']);
  assert.equal(cli.code, 0, cli.stderr);
  assert.equal(cli.stderr, '');
  assert.deepEqual(JSON.parse(cli.stdout).roles, { leadRole: '', roles: [] });
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {} } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n';
  const mcp = await run([resolve('src/mcp/main.mjs')], input);
  assert.equal(mcp.code, 0, mcp.stderr);
  assert.equal(mcp.stderr, '');
  assert.equal(JSON.parse(mcp.stdout.trim().split('\n')[1]).result.structuredContent.ok, true);
  assert.deepEqual(calls, ['health', 'health']);
});
