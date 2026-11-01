/** Explicit online gate: published host + official npm runtime, only health; never inference. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, access } from 'node:fs/promises';
import { join, dirname, delimiter } from 'node:path';
import { OwnedHost } from '../src/host/manager.mjs';
import { installedPaths } from '../src/bootstrap/config.mjs';
const root = await realpath(await mkdtemp('/tmp/dsh-bootstrap-e2e-'));
const workspace = join(root, 'authorized workspace'), user = join(root, 'user'), codex = join(root, 'codex');
await mkdir(workspace); await mkdir(user);
const env = { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`, HOME: user, CODEX_HOME: codex, LANG: 'en_US.UTF-8' };
const run = (args, input = '') => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const timer = setTimeout(() => child.kill('SIGTERM'), 420000);
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; if (args[0].endsWith('bootstrap.mjs')) process.stderr.write(data); });
  child.once('error', reject);
  child.once('close', code => { clearTimeout(timer); if (code === 0) resolve(stdout); else reject(new Error(`Isolated bootstrap gate failed (${code}); ${stderr.slice(-2000)}`)); });
  child.stdin.end(input);
});
const installationRoot = join(codex, 'dsh-agent-team/bootstrap');
const owner = new OwnedHost(installedPaths(installationRoot));
let complete = false;
try {
  const entry = join(import.meta.dirname, 'bootstrap.mjs');
  const first = JSON.parse(await run([entry, workspace]));
  assert.equal(first.ok, true); assert.equal(first.reused, false); assert.equal(first.health.owned, true);
  const second = JSON.parse(await run([entry, workspace]));
  assert.equal(second.reused, true);
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {} } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n';
  const replies = (await run([join(import.meta.dirname, '../src/mcp/main.mjs')], input)).trim().split('\n').map(JSON.parse);
  assert.equal(replies[1].result.tools.length, 8);
  assert.equal(replies[2].result.structuredContent.owned, true);
  assert.equal(replies[2].result.structuredContent.api.version, 1);
  assert.equal(replies[2].result.structuredContent.runtime.packageVersion, '0.2.2-alpha.2');
  await assert.rejects(access(join(codex, 'config.toml')), { code: 'ENOENT' });
  const marker = JSON.parse(await readFile(join(first.environment.DSH_AGENT_TEAM_HOME, '.codex-dsh-owner.json'), 'utf8'));
  assert.equal(marker.cwd, workspace);
  assert.equal((await owner.shutdown()).stopped, true);
  complete = true;
  console.log(JSON.stringify({ passed: true, gate: 'published-bootstrap-health-only', firstInstall: true, offlineRerunCodePath: second.reused, defaultMcpDiscovery: true, nativeApi: 1, tools: 8, pinnedRuntime: second.pins.runtime, pinnedHost: second.pins.host, shutdown: true, inferenceRequests: 0, providerCredentialsSupplied: false, codexConfigCreated: false, root }, null, 2));
} finally {
  await owner.close();
  if (complete) await rm(root, { recursive: true, force: true });
  else console.error(`Gate did not complete; isolated files retained at ${root}. Inspect owned lifecycle before cleanup.`);
}
