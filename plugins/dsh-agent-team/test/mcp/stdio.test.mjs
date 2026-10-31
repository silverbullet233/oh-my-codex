import { assertNativeDiagnostics } from '../fixtures/diagnostics.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { ownedFixture } from '../fixtures/owned.mjs';
import { birth, delay } from '../../src/host/files.mjs';

function run(env, lines) {
  return new Promise((resolve_, reject) => {
    const child = spawn(process.execPath, [resolve(import.meta.dirname, '../../src/mcp/main.mjs')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve_({ code, stdout, stderr }));
    child.stdin.end(lines);
  });
}

test('stdio EOF preserves its owned native host and a new MCP process reconnects', async t => {
  const fixture = await ownedFixture(t);
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {} } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n';
  let pid;
  for (let iteration = 0; iteration < 2; iteration++) {
    const result = await run(fixture.env, lines);
    assert.equal(result.code, 0, result.stderr); assertNativeDiagnostics(result.stderr);
    const responses = result.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(responses.length, 2);
    assert.equal(responses[1].result.structuredContent.api.version, 1);
    const current = responses[1].result.structuredContent.host.pid;
    if (pid) assert.equal(current, pid); else pid = current;
    assert.doesNotMatch(result.stdout + result.stderr, /token=|Cookie|DSH_OWNED_INSTANCE_ID/);
  }
  assert.equal(await fixture.starts(), 1);
});

test('malformed and oversized stdio input never runs a bridge operation', async () => {
  const missing = { PATH: process.env.PATH };
  const malformed = await run(missing, 'not-json\n');
  assert.equal(JSON.parse(malformed.stdout).error.code, -32700);
  const oversized = await run(missing, `${' '.repeat(1_048_577)}\n`);
  assert.equal(oversized.code, 1);
  assert.match(oversized.stderr, /input limit/);
});

test('a long-running browser launcher cannot block the next serialized MCP health request', { timeout: 15000 }, async t => {
  const fixture = await ownedFixture(t);
  const bin = join(fixture.home, 'bin'); await mkdir(bin);
  const pidFile = join(fixture.home, 'browser-pid'); let pid;
  t.after(async () => { if (pid && birth(pid)) process.kill(pid, 'SIGTERM'); });
  const source = ['#!/bin/sh', 'echo $$ > "$DSH_HANDOFF_PID"', 'exec sleep 30', ''].join('\n');
  for (const name of ['open', 'xdg-open']) await writeFile(join(bin, name), source, { mode: 0o700 });
  const env = { ...fixture.env, PATH: bin + delimiter + process.env.PATH, DSH_HANDOFF_PID: pidFile };
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_web', arguments: {} } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {} } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n';
  const resultPromise = run(env, lines);
  for (let i = 0; i < 200 && !pid; i++) {
    try { pid = Number(await readFile(pidFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!pid) await delay(10);
  }
  assert(pid);
  let timer;
  const result = await Promise.race([resultPromise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser handoff blocked subsequent MCP work')), 4000); })]).finally(() => clearTimeout(timer));
  assert.equal(result.code, 0); assertNativeDiagnostics(result.stderr);
  const responses = result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(responses.length, 3); assert.equal(responses[1].result.structuredContent.opened, true);
  assert.equal(responses[2].result.structuredContent.ok, true); assert(birth(pid));
  assert(!/token=|Cookie/.test(result.stdout + result.stderr), 'MCP output must not contain a capability');
});
