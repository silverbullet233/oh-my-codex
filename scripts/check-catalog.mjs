/** Validate repository discovery paths without installing or enabling plugins. */
import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
async function optionalJson(path) {
  try { return await json(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function inside(parent, child) {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\');
}

export async function checkCatalog(base = root) {
  const catalog = await json(join(base, '.agents/plugins/marketplace.json'));
  assert.equal(catalog.name, 'oh-my-codex');
  assert(Array.isArray(catalog.plugins));
  const names = new Set();
  const entries = [];
  const pluginsRoot = await realpath(join(base, 'plugins'));
  for (const entry of catalog.plugins) {
    assert(!names.has(entry.name), 'Duplicate marketplace plugin name.');
    names.add(entry.name);
    assert.equal(entry.source.source, 'local');
    assert(entry.source.path.startsWith('./plugins/'), 'Local paths are relative to the repository root.');
    const pluginRoot = await realpath(resolve(base, entry.source.path));
    assert(inside(pluginsRoot, pluginRoot), 'Plugin source must remain inside plugins/.');
    assert.equal(entry.policy.installation, 'AVAILABLE');
    assert.equal(entry.policy.authentication, 'ON_INSTALL');
    const manifest = await json(join(pluginRoot, 'plugin.json'));
    assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.equal(manifest.name, entry.name);
    assert.equal(entry.category, manifest.extensions['com.openai'].interface.category);
    const pkg = await optionalJson(join(pluginRoot, 'package.json'));
    if (pkg !== null) {
      assert.equal(pkg.name, manifest.name);
      assert.equal(pkg.version, manifest.version);
    }
    const mcp = await optionalJson(join(pluginRoot, 'mcp.json'));
    if (mcp !== null) {
      assert.equal(mcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
      for (const server of Object.values(mcp.mcpServers)) {
        for (const value of [server.cwd, ...(server.args ?? [])]) {
          if (typeof value !== 'string' || !value.includes('${PLUGIN_ROOT}')) continue;
          const path = value.replaceAll('${PLUGIN_ROOT}', pluginRoot);
          assert(path === pluginRoot || inside(pluginRoot, resolve(path)), 'MCP path escapes its plugin.');
          await stat(path);
        }
      }
    }
    entries.push({ name: entry.name, path: entry.source.path });
  }
  return entries;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Repository marketplace paths verified for ${(await checkCatalog()).length} plugin(s).`);
}
