/** Catalog release metadata. Plugin versions are independent of the catalog version. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCatalog } from '../check-catalog.mjs';

export const repositoryRoot = resolve(import.meta.dirname, '../..');
export const repository = 'silverbullet233/oh-my-codex';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
export function checkTag(tag, version) {
  assert(stableVersion.test(version), 'Catalog version must be stable SemVer X.Y.Z.');
  assert.equal(tag, `v${version}`, 'Release tag must equal v<catalog package version>.');
}

export async function releaseMetadata(base = repositoryRoot, tag) {
  const json = async path => JSON.parse(await readFile(join(base, path), 'utf8'));
  const pkg = await json('package.json');
  const lock = await json('package-lock.json');
  checkTag(tag ?? `v${pkg.version}`, pkg.version);
  assert.equal(pkg.name, 'oh-my-codex');
  assert.equal(pkg.private, true, 'The catalog is private workspace tooling, not an npm plugin.');
  assert.equal(lock.version, pkg.version, 'Root lock version mismatch.');
  assert.equal(lock.packages[''].version, pkg.version, 'Root workspace lock version mismatch.');
  const plugins = [];
  for (const entry of await checkCatalog(base)) {
    const manifest = await json(`${entry.path}/plugin.json`);
    assert(stableVersion.test(manifest.version), 'Plugin release versions must be stable SemVer.');
    try {
      const pluginPackage = await json(`${entry.path}/package.json`);
      assert.equal(lock.packages[entry.path.slice(2)]?.version, pluginPackage.version, 'Plugin workspace lock version mismatch.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    plugins.push({ ...entry, version: manifest.version });
  }
  assert(plugins.length > 0, 'A catalog release must contain a plugin.');
  const changelog = await readFile(join(base, 'CHANGELOG.md'), 'utf8');
  const heading = `## ${pkg.version}\n`;
  assert.equal(changelog.split(heading).length, 2, 'Changelog must contain exactly one current-version section.');
  const changes = changelog.split(heading)[1].split(/^## /mu)[0].trim();
  assert(changes.length > 0, 'Current changelog section must not be empty.');
  return { version: pkg.version, tag: tag ?? `v${pkg.version}`, plugins, changes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metadata = await releaseMetadata(repositoryRoot, process.argv[2]);
  console.log(`Catalog ${metadata.version}: ${metadata.plugins.map(p => `${p.name}@${p.version}`).join(', ')}`);
}
