import { cp, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const checked = spawnSync(process.execPath, ['scripts/check.mjs'], { stdio: 'inherit' });
if (checked.status !== 0) process.exit(checked.status ?? 1);
await rm('dist/dsh-agent-team', { recursive: true, force: true });
await mkdir('dist/dsh-agent-team', { recursive: true });
for (const path of ['src', 'scripts', 'skills', 'docs', 'examples', 'cordis.patch.yml', 'plugin.json', 'mcp.json', 'package.json', 'runtime-lock.json', 'PLAN.md', 'README.md', 'LICENSE', 'test/fixtures/audit.mjs', 'test/fixtures/synthetic-files.mjs', 'test/native/README.md']) {
  await cp(path, `dist/dsh-agent-team/${path}`, { recursive: true });
}
console.log('Local ESM plugin package assembled at dist/dsh-agent-team. Runtime source preparation is separate.');
