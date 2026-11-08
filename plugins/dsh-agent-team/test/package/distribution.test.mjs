import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const pluginRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(pluginRoot, '../..');
async function run(command, args, { cwd, env = process.env, input = '' }) {
  const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const ended = new Promise((resolve_, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve_({ code, stdout, stderr }));
  });
  child.stdin.end(input);
  const result = await ended;
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}

test('nested source, built folder and isolated tarball resolve MCP tools and retain tools and native setup diagnostics without a signature', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dist-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await run(process.execPath, [join(pluginRoot, 'scripts/check.mjs')], { cwd: root });
  await run(process.execPath, [join(pluginRoot, 'scripts/build.mjs')], { cwd: root });
  const packed = JSON.parse(await run('npm', ['--cache', join(root, 'cache'), 'pack', '--offline', '--ignore-scripts', '--pack-destination', root, '--json'], { cwd: pluginRoot }))[0];
  assert(packed.files.every(file => !/^plugins\/|^\.agents\/|node_modules|package-lock/u.test(file.path)));
  await run('tar', ['-xzf', join(root, packed.filename), '-C', root], { cwd: root });
  const packagedRoot = join(root, 'package');
  await assert.rejects(access(join(packagedRoot, 'node_modules')), error => error.code === 'ENOENT');
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dsh_team_health', arguments: {} } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n';
  for (const directory of [pluginRoot, join(pluginRoot, 'dist/dsh-agent-team'), packagedRoot]) {
    await access(join(directory, 'docs/bootstrap.md'));
    assert.equal(typeof (await import(pathToFileURL(join(directory, 'scripts/setup.mjs')).href)).setup, 'function');
    const config = JSON.parse(await readFile(join(directory, 'mcp.json'), 'utf8')).mcpServers['dsh-agent-team'];
    assert.deepEqual(config.env, {
      DSH_AGENT_TEAM_RUNTIME: '${PLUGIN_DATA}/runtime/node_modules/@deepseek-ai/dsh',
      DSH_AGENT_TEAM_HOME: '${PLUGIN_DATA}/dsh-home',
    });
    const expand = value => value.replaceAll('${PLUGIN_ROOT}', directory);
    assert.equal(expand(config.cwd), directory);
    const output = await run(config.command, config.args.map(expand), {
      // Deliberately disregard declared cwd: entrypoints must also work from elsewhere.
      cwd: directory === pluginRoot ? repositoryRoot : root,
      env: { PATH: process.env.PATH }, input: requests,
    });
    const replies = output.trim().split('\n').map(JSON.parse);
    assert.equal(replies[0].result.serverInfo.name, 'dsh-agent-team');
    assert.equal(replies[1].result.tools.length, 18);
    assert.equal(replies[2].result.isError, true);
    assert.equal(JSON.parse(replies[2].result.content[0].text).code, 'RUNTIME_REQUIRED');
    const url = replies[1].result.tools.find(tool => tool.name === 'dsh_team_web_url');
    assert.deepEqual(url.inputSchema.required, ['teamId']);
  }
});
