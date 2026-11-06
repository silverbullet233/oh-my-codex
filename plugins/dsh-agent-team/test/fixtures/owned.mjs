import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { signedFixture } from './permission-context.mjs';
import { initializeOwnedHome, OwnedHost } from '../../src/host/manager.mjs';
const repo = resolve(import.meta.dirname, '../../../..');
export async function ownedFixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'codex-owned-test-'));
  const builds = join(repo, '.test-output'); await mkdir(builds, { recursive: true });
  const runtime = await mkdtemp(join(builds, 'native-runtime-'));
  await mkdir(join(runtime, 'lib'));
  await writeFile(join(runtime, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.2-alpha.3', type: 'module' }));
  await writeFile(join(runtime, 'lib/bin.js'), `import ${JSON.stringify(new URL('./owned-cli.mjs', import.meta.url).href)};`);
  await initializeOwnedHome(home, home);
  const config = { home, runtimeAnchor: runtime, profile: 'web', startupTimeoutMs: 5000 };
  const owner = new OwnedHost(config);
  const permissions = await signedFixture(t, owner, { cleanup: false });
  Object.assign(config, owner.config);
  t.after(async () => {
    try { await owner.prepare(); if (await owner.current()) { await owner.request('stop', { teamId: 'cleanup' }); await owner.shutdown(); } } finally { await owner.close(); }
    await rm(permissions.root, { recursive: true, force: true }); await rm(home, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true });
  });
  return { home, runtime, owner, config, issue: permissions.issue, env: { PATH: process.env.PATH, DSH_AGENT_TEAM_HOME: home, DSH_AGENT_TEAM_RUNTIME: runtime }, starts: async () => (await readFile(join(home, 'starts'), 'utf8')).trim().split('\n').length };
}
