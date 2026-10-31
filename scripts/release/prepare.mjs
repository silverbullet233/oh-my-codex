/** Build local release assets only. This script never contacts GitHub or creates a tag. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { releaseMetadata, repositoryRoot } from './metadata.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function prepareRelease({ base = repositoryRoot, tag, output }) {
  assert(output, 'Specify an empty output directory with --output.');
  const metadata = await releaseMetadata(base, tag);
  const directory = resolve(output);
  await mkdir(directory, { recursive: true });
  assert.equal((await readdir(directory)).length, 0, 'Release output must be empty; never overwrite existing assets.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: base, encoding: 'utf8' }).trim();
  assert(/^[0-9a-f]{40}$/u.test(commit), 'Expected a Git commit SHA.');
  const cache = await mkdtemp(join(tmpdir(), 'codex-release-npm-'));
  const plugins = [];
  try {
    for (const plugin of metadata.plugins) {
      let pkg;
      try { pkg = JSON.parse(await readFile(join(base, plugin.path, 'package.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      // Manifest-only plugins are still installable through the tagged catalog.
      if (!pkg) { plugins.push(plugin); continue; }
      assert(Array.isArray(pkg.files) && pkg.files.length, 'Packaged plugins must declare their public files.');
      const packDirectory = await mkdtemp(join(cache, 'pack-'));
      const packed = JSON.parse(execFileSync('npm', ['--cache', cache, 'pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', packDirectory], {
        cwd: join(base, plugin.path), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }))[0];
      assert.equal(basename(packed.filename), packed.filename);
      for (const file of packed.files) {
        assert(!/(^|\/)(?:node_modules|\.git|\.env(?:\..*)?|auth\.json|credentials[^/]*)(?:\/|$)/iu.test(file.path), 'Unexpected private file in archive.');
        assert(!file.path.startsWith('/') && !file.path.split('/').includes('..'), 'Archive paths must be relative.');
      }
      assert.equal(packed.version, plugin.version);
      await copyFile(join(packDirectory, packed.filename), join(directory, packed.filename), constants.COPYFILE_EXCL);
      plugins.push({ ...plugin, archive: packed.filename });
    }
  } finally { await rm(cache, { recursive: true, force: true }); }
  const catalog = { catalogVersion: metadata.version, tag: metadata.tag, commit, plugins };
  await writeFile(join(directory, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  const rows = plugins.map(p => `| ${p.name} | ${p.version} | ${p.path} |`).join('\n');
  const install = plugins.map(p => `codex plugin add ${p.name}@oh-my-codex`).join('\n');
  const dshNote = plugins.some(p => p.name === 'dsh-agent-team') ? ' DSH Agent Team starts its own ordinary DSH Web host lazily after dedicated-home setup. Install exact DSH 0.2.2-alpha.2 and the checksum-verified [dsh-team-roles 0.5.0 release](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.5.0) first; no prestarted global daemon is required. See [its getting-started guide](https://github.com/silverbullet233/oh-my-codex/blob/' + metadata.tag + '/plugins/dsh-agent-team/docs/getting-started.md).' : '';
  const body = `# Oh My Codex ${metadata.tag}\n\n${metadata.changes}\n\n## Catalog contents\n\n| Plugin | Version | Repository path |\n| --- | --- | --- |\n${rows}\n\nAccess follows repository visibility. For a private catalog, Git must already authenticate an account with repository access; a published Release does not make it public. Keep authentication in the existing Git credential manager, never in repository URLs or MCP configuration. Verify private release assets with an already authenticated GitHub CLI.\n\nInstall selected plugins through the Git marketplace; the archives are inspection/packaging artifacts, not a direct Codex installer:\n\n\`\`\`sh\ncodex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref ${metadata.tag}\n${install}\n\`\`\`\n\nExisting marketplace registrations must be removed before changing refs. Start a new Codex session after installation.${dshNote}\n\nSource commit: \`${commit}\`. Plugin versions are independent of the catalog version.\n`;
  await writeFile(join(directory, 'release-notes.md'), body);
  const files = [...plugins.filter(p => p.archive).map(p => p.archive), 'catalog.json', 'release-notes.md'].sort();
  const assets = [];
  for (const name of files) {
    const bytes = await readFile(join(directory, name));
    assets.push({ name, size: bytes.length, sha256: sha256(bytes) });
  }
  const sums = assets.map(asset => `${asset.sha256}  ${asset.name}\n`).join('');
  await writeFile(join(directory, 'SHA256SUMS'), sums);
  assets.push({ name: 'SHA256SUMS', size: Buffer.byteLength(sums), sha256: sha256(sums) });
  const plan = { ...catalog, body, assets };
  await writeFile(join(directory, 'release-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { tag: { type: 'string' }, output: { type: 'string' } } });
  const plan = await prepareRelease(values);
  console.log(`Prepared ${plan.tag}: ${plan.assets.map(a => a.name).join(', ')}`);
}
