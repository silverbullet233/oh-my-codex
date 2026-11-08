/** Real plugin MCP startup through Codex app-server. No turn, credentials, or inference. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(join(root, 'plugins/dsh-agent-team/mcp.json'), 'utf8'));
const schema = manifest.$schema;
const candidateServer = manifest.mcpServers['dsh-agent-team'];
assert.deepEqual(candidateServer.env, {
  DSH_AGENT_TEAM_RUNTIME: '${PLUGIN_DATA}/runtime/node_modules/@deepseek-ai/dsh',
  DSH_AGENT_TEAM_HOME: '${PLUGIN_DATA}/dsh-home',
});
const directory = await realpath(await mkdtemp(join(tmpdir(), 'codex-plugin-env-')));
const cli = (args, env, cwd) => {
  const result = spawnSync('codex', args, { env, cwd, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
};
try {
  for (const label of ['negative', 'positive']) {
    const base = join(directory, label), home = join(base, 'home'), source = join(base, 'source');
    const plugin = join(source, 'probe'), observation = join(base, 'observed.json');
    await mkdir(home, { recursive: true });
    await mkdir(join(source, '.agents/plugins'), { recursive: true });
    await mkdir(plugin);
    // Deliberately do not inherit ambient tokens, user config, or auth files.
    const env = { PATH: process.env.PATH, HOME: home, CODEX_HOME: home,
      DSH_AGENT_TEAM_RUNTIME: join(base, 'runtime'), DSH_AGENT_TEAM_HOME: join(base, 'dsh-home'),
      DSH_ENV_UNLISTED_SENTINEL: 'must-not-forward' };
    await writeFile(join(home, 'config.toml'), 'model = "fixture-model"\nmodel_provider = "fixture"\ncli_auth_credentials_store = "ephemeral"\n[model_providers.fixture]\nname = "Local fixture, never called"\nbase_url = "http://127.0.0.1:1/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n[features]\nplugins = true\n');
    await writeFile(join(source, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'env-fixture', plugins: [{ name: 'env-probe', source: { source: 'local', path: './probe' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' }] }));
    await writeFile(join(plugin, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'env-probe', version: '0.0.1', description: 'Local environment forwarding fixture' }));
    // Preserve the real schema/transport fields; replace only the executable's
    // script with a harmless recorder. The negative control models the old manifest.
    const probeServer = { ...candidateServer, args: ['${PLUGIN_ROOT}/probe.mjs'] };
    if (label === 'negative') delete probeServer.env;
    await writeFile(join(plugin, 'mcp.json'), JSON.stringify({ $schema: schema, mcpServers: { probe: probeServer } }));
    await writeFile(join(plugin, 'probe.mjs'), `import { writeFileSync } from 'node:fs';\nimport { createInterface } from 'node:readline';\nwriteFileSync(${JSON.stringify(observation)}, JSON.stringify({ runtime: process.env.DSH_AGENT_TEAM_RUNTIME ?? null, home: process.env.DSH_AGENT_TEAM_HOME ?? null, sentinel: process.env.DSH_ENV_UNLISTED_SENTINEL ?? null }));\ncreateInterface({ input: process.stdin }).on('line', line => { const r = JSON.parse(line); if (r.id === undefined) return; const result = r.method === 'initialize' ? { protocolVersion: r.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'env-probe', version: '0.0.1' } } : r.method === 'tools/list' ? { tools: [] } : {}; process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: r.id, result }) + '\\n'); });\n`);
    cli(['plugin', 'marketplace', 'add', source, '--json'], env, base);
    const installation = JSON.parse(cli(['plugin', 'add', 'env-probe@env-fixture', '--json'], env, base));
    assert(installation.installedPath.startsWith(`${home}/`), 'Local plugin must install inside fixture home');
    const servers = JSON.parse(cli(['mcp', 'list', '--json'], env, base));
    assert.equal(servers.length, 1, 'Expected only the fixture MCP server');
    assert.equal(servers[0].name, 'probe');
    assert.equal(servers[0].enabled, true);
    const configuredEnv = servers[0].transport.env;
    if (label === 'positive') {
      for (const key of Object.keys(candidateServer.env)) {
        assert(isAbsolute(configuredEnv[key]), `${key} must be absolute`);
        assert(configuredEnv[key].startsWith(`${home}/`), `${key} must remain in the selected Codex home`);
        assert(!configuredEnv[key].includes('${'), `${key} must be expanded by Codex`);
        assert.notEqual(configuredEnv[key], env[key], 'Manifest paths must override ambient values');
      }
      assert(configuredEnv.DSH_AGENT_TEAM_RUNTIME.endsWith('/runtime/node_modules/@deepseek-ai/dsh'));
      assert(configuredEnv.DSH_AGENT_TEAM_HOME.endsWith('/dsh-home'));
      assert.equal(
        configuredEnv.DSH_AGENT_TEAM_RUNTIME.slice(0, -'/runtime/node_modules/@deepseek-ai/dsh'.length),
        configuredEnv.DSH_AGENT_TEAM_HOME.slice(0, -'/dsh-home'.length),
        'Runtime and DSH Home must share the same plugin data directory',
      );
    }
    const child = spawn('codex', ['app-server', '--listen', 'stdio://'], { env, cwd: base, stdio: ['pipe', 'pipe', 'pipe'] });
    const pending = new Map(); let nextId = 1; let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => { let message; try { message = JSON.parse(line); } catch { return; } if (pending.has(message.id)) { const { resolve, reject, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); } });
    const request = (method, params) => new Promise((resolve, reject) => { const id = nextId++; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}; ${stderr}`)); }, 20_000); pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); });
    try {
      await request('initialize', { clientInfo: { name: 'env-fixture', version: '0.0.1' }, capabilities: { experimentalApi: true } });
      child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
      // This method initializes MCP discovery without creating a conversation turn.
      const status = await request('mcpServerStatus/list', {});
      assert.equal(status.data.length, 1);
      assert.equal(status.data[0].serverInfo.name, 'env-probe');
      assert.equal(status.data[0].serverInfo.version, '0.0.1');
      assert.equal(status.data[0].toolsError, null);
      let observed;
      for (let attempt = 0; attempt < 100; attempt++) {
        try { observed = JSON.parse(await readFile(observation, 'utf8')); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert(observed, `Plugin MCP was not launched (${label}); ${stderr}`);
      assert.deepEqual(observed, { runtime: label === 'positive' ? configuredEnv.DSH_AGENT_TEAM_RUNTIME : null, home: label === 'positive' ? configuredEnv.DSH_AGENT_TEAM_HOME : null, sentinel: null });
    } finally {
      for (const { timer } of pending.values()) clearTimeout(timer);
      lines.close(); child.stdin.end(); child.kill('SIGTERM');
      await new Promise(resolve => { if (child.exitCode !== null || child.signalCode !== null) return resolve(); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    }
  }
  console.log(JSON.stringify({ realCodexPluginMcp: true, manifestPathsExpandedAndDelivered: true, negativeControl: true, unlistedVariableFiltered: true, modelTurns: 0 }));
} finally { await rm(directory, { recursive: true, force: true }); }
