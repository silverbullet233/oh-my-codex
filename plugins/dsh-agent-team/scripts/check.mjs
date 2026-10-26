import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
const pluginRoot = resolve(import.meta.dirname, '..');

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(root, entry.name)) : join(root, entry.name)))).flat();
}
// Private source checkouts include tests; the packaged plugin omits test fixtures.
for (const root of ['src', 'scripts', ...(existsSync(join(pluginRoot, 'test')) ? ['test'] : [])]) {
  for (const path of await files(join(pluginRoot, root))) {
    if (!path.endsWith('.mjs')) continue;
    const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
const manifest = JSON.parse(await readFile(join(pluginRoot, 'plugin.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'));
if (manifest.name !== pkg.name || manifest.version !== pkg.version) throw new Error('Plugin/package identity mismatch.');
if (manifest.extensions['com.openai'].interface.shortDescription.length > 30) throw new Error('Plugin subtitle exceeds 30 characters.');
console.log('ESM syntax and plugin metadata checks passed.');
