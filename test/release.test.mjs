import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkTag, releaseMetadata } from '../scripts/release/metadata.mjs';
import { prepareRelease, sha256 } from '../scripts/release/prepare.mjs';
import { publishDraft } from '../scripts/release/publish-draft.mjs';

const root = resolve(import.meta.dirname, '..');
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'codex-release-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('catalog SemVer is independent of plugin versions; tag and lock must agree', async () => {
  const metadata = await releaseMetadata();
  assert.equal(metadata.tag, `v${metadata.version}`);
  checkTag('v0.1.0', '0.1.0');
  for (const [tag, version] of [['v2026-10-29', '0.1.0'], ['v0.2.0', '0.1.0'], ['v01.1.0', '01.1.0'], ['v0.1.0-rc.1', '0.1.0-rc.1']]) {
    assert.throws(() => checkTag(tag, version));
  }
});

test('local preparation produces usable archives and matching checksums without absolute source paths', async t => {
  const directory = await temporary(t);
  const output = join(directory, 'assets');
  const metadata = await releaseMetadata();
  const plan = await prepareRelease({ tag: metadata.tag, output });
  assert.equal(plan.catalogVersion, metadata.version);
  assert.equal(plan.plugins[0].version, metadata.plugins[0].version);
  assert.equal(plan.plugins[0].path, './plugins/dsh-agent-team');
  assert.equal(plan.plugins[0].archive, `dsh-agent-team-${metadata.plugins[0].version}.tgz`);
  for (const asset of plan.assets) {
    const bytes = await readFile(join(output, asset.name));
    assert.equal(sha256(bytes), asset.sha256);
    assert.equal(bytes.length, asset.size);
  }
  const listing = execFileSync('tar', ['-tzf', join(output, plan.plugins[0].archive)], { encoding: 'utf8' });
  for (const file of ['package/plugin.json', 'package/mcp.json', 'package/src/mcp/main.mjs', 'package/skills/dsh-agent-team/SKILL.md']) assert(listing.includes(file));
  assert(!listing.includes('node_modules/'));
  const recorded = await readFile(join(output, 'release-plan.json'), 'utf8');
  assert(!recorded.includes(root) && !recorded.includes(directory));
  assert.equal((await readdir(output)).length, plan.assets.length + 1);
  await assert.rejects(prepareRelease({ tag: metadata.tag, output }), /must be empty/);
  await assert.rejects(prepareRelease({ tag: 'not-a-release-tag', output: join(directory, 'bad') }), /Release tag/);
});

test('lock and changelog drift fail before release preparation', async t => {
  const directory = await temporary(t);
  for (const file of ['package.json', 'package-lock.json']) await cp(join(root, file), join(directory, file));
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
  lock.version = '9.0.0';
  await writeFile(join(directory, 'package-lock.json'), JSON.stringify(lock));
  await assert.rejects(releaseMetadata(directory), /Root lock version/);
  await cp(join(root, 'package-lock.json'), join(directory, 'package-lock.json'));
  await mkdir(join(directory, '.agents/plugins'), { recursive: true });
  await cp(join(root, '.agents/plugins/marketplace.json'), join(directory, '.agents/plugins/marketplace.json'));
  // The catalog remains validated before changelog extraction.
  await cp(join(root, 'plugins'), join(directory, 'plugins'), { recursive: true, filter: path => !path.includes('/dist') });
  await writeFile(join(directory, 'CHANGELOG.md'), '# Missing release section\n');
  await assert.rejects(releaseMetadata(directory), /Changelog/);
});

async function publisherFixture(t) {
  const directory = await temporary(t);
  const bytes = Buffer.from('synthetic release artifact\n');
  await writeFile(join(directory, 'fixture.tgz'), bytes);
  const plan = { catalogVersion: '0.1.0', tag: 'v0.1.0', commit: 'a'.repeat(40), body: 'Synthetic release notes', assets: [{ name: 'fixture.tgz', size: bytes.length, sha256: sha256(bytes) }] };
  const state = { release: null, assets: [], calls: [], tag: plan.commit, uploads: 0 };
  const request = async (method, path, value) => {
    state.calls.push({ method, path });
    if (path.includes('/git/ref/')) return { object: { type: 'tag', sha: 'b'.repeat(40) } };
    if (path.includes('/git/tags/')) return { object: { type: 'commit', sha: state.tag } };
    if (path.includes('/releases?')) return state.release ? [{ ...state.release }] : [];
    if (method === 'POST') {
      state.release = { id: 7, ...value };
      return { ...state.release };
    }
    if (method === 'UPLOAD') {
      state.uploads++;
      state.assets.push({ name: 'fixture.tgz', size: value.length, digest: `sha256:${sha256(value)}` });
      return {};
    }
    if (path.includes('/assets?')) return state.assets;
    return { ...state.release };
  };
  return { directory, plan, state, request };
}

test('draft creation and identical retry upload once and never publish or replace an asset', async t => {
  const fixture = await publisherFixture(t);
  const result = await publishDraft(fixture);
  assert.equal(result.draft, true);
  await publishDraft(fixture);
  assert.equal(fixture.state.uploads, 1);
  assert.equal(fixture.state.calls.filter(c => c.method === 'POST').length, 1);
  assert(fixture.state.calls.every(c => !['PATCH', 'DELETE', 'PUT'].includes(c.method)));
  assert.equal(fixture.state.release.make_latest, 'false');
});

test('published releases, conflicting assets and mismatched tags fail closed', async t => {
  for (const condition of ['published', 'conflicting', 'tag-mismatch', 'integrity']) {
    const fixture = await publisherFixture(t);
    if (condition === 'tag-mismatch') fixture.state.tag = 'c'.repeat(40);
    else if (condition === 'integrity') await writeFile(join(fixture.directory, 'fixture.tgz'), 'changed');
    else {
      await publishDraft(fixture);
      fixture.state.calls.length = 0;
      if (condition === 'published') fixture.state.release.draft = false;
      else fixture.state.assets[0].digest = 'sha256:conflict';
    }
    await assert.rejects(publishDraft(fixture), /published|overwrites|match|equal/);
    assert(fixture.state.calls.every(c => c.method === 'GET'), `${condition} must not mutate remote state`);
  }
});

test('draft status is checked again before upload if a maintainer publishes concurrently', async t => {
  const fixture = await publisherFixture(t);
  const request = async (...args) => {
    const result = await fixture.request(...args);
    if (args[0] === 'POST') fixture.state.release.draft = false;
    return result;
  };
  await assert.rejects(publishDraft({ ...fixture, request }), /published/);
  assert.equal(fixture.state.uploads, 0);
});

test('workflow restricts write permissions and uses full immutable action pins', async () => {
  const yaml = await readFile(join(root, '.github/workflows/validate-release.yml'), 'utf8');
  assert(!yaml.includes('pull_request_target') && !yaml.includes('workflow_dispatch'));
  const pins = [...yaml.matchAll(/uses: ([^\s]+)(?: # ([^\n]+))?/gu)];
  assert.equal(pins.length, 4);
  for (const pin of pins) assert.match(pin[1], /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/u);
  assert.equal([...yaml.matchAll(/contents: write/gu)].length, 1);
  assert.match(yaml, /needs: validate/);
  assert.match(yaml, /if: github.event_name == 'push' && startsWith\(github.ref, 'refs\/tags\/'\)/);
  assert.match(yaml, /persist-credentials: false/);
  assert.equal([...yaml.matchAll(/run: npm ci --ignore-scripts --no-audit --no-fund/gu)].length, 2);
  assert.equal([...yaml.matchAll(/run: npm run build/gu)].length, 2);
  assert(!/^\s+run:.*\$\{\{/mu.test(yaml), 'Untrusted expressions must pass through environment variables.');
  assert.match(yaml, /RELEASE_TAG: \$\{\{ github.ref_name \}\}/);
});
