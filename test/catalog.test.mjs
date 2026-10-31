import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access, cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkCatalog } from '../scripts/check-catalog.mjs';

const root = resolve(import.meta.dirname, '..');
test('repository discovery points at self-contained plugins and the root stays a collection', async () => {
  assert.deepEqual(await checkCatalog(), [{ name: 'dsh-agent-team', path: './plugins/dsh-agent-team' }]);
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'oh-my-codex');
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.workspaces, ['plugins/*']);
  await assert.rejects(access(resolve(root, 'plugin.json')), error => error.code === 'ENOENT');
  await assert.rejects(access(resolve(root, 'mcp.json')), error => error.code === 'ENOENT');
  await access(resolve(root, 'plugins/dsh-agent-team/skills/dsh-agent-team/SKILL.md'));
  await access(resolve(root, 'skills/README.md'));
});

test('a marketplace entry with a missing declared MCP entrypoint fails discovery validation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-catalog-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, '.agents/plugins'), { recursive: true });
  await mkdir(join(directory, 'plugins/dsh-agent-team'), { recursive: true });
  await cp(join(root, '.agents/plugins/marketplace.json'), join(directory, '.agents/plugins/marketplace.json'));
  for (const file of ['plugin.json', 'mcp.json', 'package.json']) {
    await cp(join(root, 'plugins/dsh-agent-team', file), join(directory, 'plugins/dsh-agent-team', file));
  }
  await assert.rejects(checkCatalog(directory), error => error.code === 'ENOENT');
});

test('workspace lock retains portable local links without developer-checkout dependencies', async () => {
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.name, 'oh-my-codex');
  assert.deepEqual(lock.packages[''].workspaces, ['plugins/*']);
  assert.equal(lock.packages['node_modules/dsh-agent-team'].resolved, 'plugins/dsh-agent-team');
  for (const entry of Object.values(lock.packages).filter(entry => entry.link)) {
    assert(!entry.resolved.startsWith('/'));
    assert(!entry.resolved.split('/').includes('..'), 'External development links must not enter the workspace lock.');
  }
});

test('normal installation guides pin the catalog version and versioned host release assets', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const file of ['README.md', 'plugins/dsh-agent-team/docs/getting-started.md']) {
    const text = await readFile(join(root, file), 'utf8');
    const refs = [...text.matchAll(/codex plugin marketplace add[^\n]*--ref ([^\s]+)/g)].map(row => row[1]);
    assert(refs.length > 0);
    assert(refs.every(ref => ref === `v${pkg.version}`), `${file} must follow the exact catalog version`);
    assert(!text.includes('--ref feat/'));
    assert(text.includes('Git must already authenticate an account with repository access'));
    assert(!text.includes('public assets are published'));
  }
  const guide = await readFile(join(root, 'plugins/dsh-agent-team/docs/getting-started.md'), 'utf8');
  const assets = [...guide.matchAll(/https:\/\/github\.com\/silverbullet233\/dsh-team-roles\/releases\/download\/([^/\s]+)\/([^\s]+)/g)];
  assert.equal(assets.length, 2);
  assert(assets.every(row => /^v\d+\.\d+\.\d+$/.test(row[1])));
  assert.equal(new Set(assets.map(row => row[1])).size, 1);
  assert(!guide.includes('releases/latest/'));
});
