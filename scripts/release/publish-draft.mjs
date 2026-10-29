/** Tag-triggered draft upload. Never publishes releases, creates tags or replaces assets. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTag, repository } from './metadata.mjs';
import { sha256 } from './prepare.mjs';

export async function publishDraft({ plan, directory, request }) {
  checkTag(plan.tag, plan.catalogVersion);
  assert(/^[0-9a-f]{40}$/u.test(plan.commit));
  const base = `/repos/${repository}`;
  // A release must refer to the existing tag's exact commit, including annotated tags.
  let ref = (await request('GET', `${base}/git/ref/tags/${plan.tag}`)).object;
  for (let depth = 0; ref?.type === 'tag' && depth < 8; depth++) {
    ref = (await request('GET', `${base}/git/tags/${ref.sha}`)).object;
  }
  assert.equal(ref?.type, 'commit', 'Tag must resolve to a commit.');
  assert.equal(ref.sha, plan.commit, 'Remote tag does not match the prepared commit.');
  // Verify every local artifact before making any remote mutation.
  const files = new Map();
  for (const asset of plan.assets) {
    assert.equal(basename(asset.name), asset.name);
    assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(asset.name));
    assert(!files.has(asset.name), 'Duplicate release asset.');
    const bytes = await readFile(join(directory, asset.name));
    assert.equal(bytes.length, asset.size);
    assert.equal(sha256(bytes), asset.sha256, 'Local release asset integrity mismatch.');
    files.set(asset.name, bytes);
  }
  // The by-tag endpoint is documented for published releases. List with the
  // write-capable token so retries also find drafts instead of creating duplicates.
  const matches = [];
  for (let page = 1; ; page++) {
    assert(page <= 20, 'Release listing limit reached; refusing an incomplete search.');
    const releases = await request('GET', `${base}/releases?per_page=100&page=${page}`);
    matches.push(...releases.filter(row => row.tag_name === plan.tag));
    if (releases.length < 100) break;
  }
  assert(matches.length <= 1, 'Multiple releases use this tag; review them manually.');
  let release = matches[0];
  if (!release) {
    release = await request('POST', `${base}/releases`, {
      tag_name: plan.tag, target_commitish: plan.commit, name: `Oh My Codex ${plan.tag}`,
      body: plan.body, draft: true, prerelease: false, make_latest: 'false',
    });
  }
  const requireDraft = value => {
    assert.equal(value.draft, true, 'Refusing to change an already published release.');
    assert.equal(value.tag_name, plan.tag, 'Release tag changed.');
    assert.equal(value.target_commitish, plan.commit, 'Draft target differs from the prepared commit.');
    assert.equal(value.body, plan.body, 'Draft notes differ; review or remove the draft manually before retrying.');
  };
  requireDraft(release);
  const inspectAssets = async () => {
    requireDraft(await request('GET', `${base}/releases/${release.id}`));
    const assets = new Map();
    for (let page = 1; ; page++) {
      assert(page <= 20, 'Asset listing limit reached; refusing an incomplete search.');
      const rows = await request('GET', `${base}/releases/${release.id}/assets?per_page=100&page=${page}`);
      for (const row of rows) {
        assert(!assets.has(row.name), 'Duplicate asset in listing; retry after concurrent changes settle.');
        assets.set(row.name, row);
      }
      if (rows.length < 100) break;
    }
    for (const asset of plan.assets) {
      const existing = assets.get(asset.name);
      if (!existing) continue;
      assert.equal(existing.size, asset.size, 'Existing asset differs; overwrites are forbidden.');
      assert.equal(existing.digest, `sha256:${asset.sha256}`, 'Existing asset differs or lacks a digest; overwrites are forbidden.');
    }
    return assets;
  };
  // Refuse any existing conflict before the first upload, regardless of plan order.
  await inspectAssets();
  for (const asset of plan.assets) {
    // Recheck the draft and entire plan before each write to catch concurrent changes.
    const assets = await inspectAssets();
    if (assets.has(asset.name)) continue;
    await request('UPLOAD', `${base}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`, files.get(asset.name));
  }
  requireDraft(await request('GET', `${base}/releases/${release.id}`));
  return { id: release.id, tag: plan.tag, draft: true };
}

export function githubRequest(token) {
  return async (method, path, value) => {
    const upload = method === 'UPLOAD';
    assert(path.startsWith(`/repos/${repository}/`));
    const response = await fetch(`https://${upload ? 'uploads' : 'api'}.github.com${path}`, {
      method: upload ? 'POST' : method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(value ? { 'content-type': upload ? 'application/octet-stream' : 'application/json' } : {}),
      },
      body: value ? (upload ? value : JSON.stringify(value)) : undefined,
    });
    if (!response.ok) {
      const error = new Error(`GitHub ${method} failed with HTTP ${response.status}.`);
      error.status = response.status;
      throw error; // Never print token-bearing headers or untrusted response bodies.
    }
    return response.json();
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Draft upload is restricted to GitHub Actions.');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  const directory = resolve(process.argv[2]);
  const plan = JSON.parse(await readFile(join(directory, 'release-plan.json'), 'utf8'));
  assert.equal(process.env.GITHUB_REF, `refs/tags/${plan.tag}`);
  assert.equal(process.env.GITHUB_SHA, plan.commit);
  assert(process.env.GITHUB_TOKEN, 'Missing Actions token.');
  console.log(await publishDraft({ plan, directory, request: githubRequest(process.env.GITHUB_TOKEN) }));
}
