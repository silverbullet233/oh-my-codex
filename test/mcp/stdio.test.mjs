import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serveFakeBridge as serveBridge } from '../fixtures/ipc-server.mjs';

function run(socketPath, lines) {
  return new Promise((resolve_, reject) => {
    const child = spawn(process.execPath, [resolve('src/mcp/main.mjs')], { env: { PATH: process.env.PATH, DSH_AGENT_TEAM_SOCKET: socketPath }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve_({ code, stdout, stderr }));
    child.stdin.end(lines);
  });
}

test('stdio EOF preserves independently owned IPC host and a new client can reconnect', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mcp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const socketPath = join(directory, 'team.sock');
  const calls = [];
  const server = await serveBridge({ socketPath, bridge: { dispatch: async (method, params) => { calls.push({ method, params }); return { ok: true }; } } });
  t.after(() => server.close());
  const lines = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {} } })}\n`;
  for (let iteration = 0; iteration < 2; iteration++) {
    const result = await run(socketPath, lines);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    const responses = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(responses.length, 2);
    assert.equal(responses[1].result.structuredContent.ok, true);
    assert.equal(responses[1].result.structuredContent.protocol.version, 1);
  }
  assert.deepEqual(calls, [{ method: 'health', params: {} }, { method: 'health', params: {} }]);
});

test('malformed and oversized stdio input never runs a bridge operation', async () => {
  const missing = join(tmpdir(), 'intentionally-absent-dsh.sock');
  const malformed = await run(missing, 'not-json\n');
  assert.equal(JSON.parse(malformed.stdout).error.code, -32700);
  const oversized = await run(missing, `${' '.repeat(1_048_577)}\n`);
  assert.equal(oversized.code, 1);
  assert.match(oversized.stderr, /input limit/);
});
