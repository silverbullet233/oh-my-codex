import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const checked = spawnSync(process.execPath, ['scripts/check.mjs'], { stdio: 'inherit' });
if (checked.status !== 0) process.exit(checked.status ?? 1);
const target = 'dist/dsh-agent-team';
await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true });
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const path of [...pkg.files, 'package.json']) await cp(path, `${target}/${path}`, { recursive: true });
console.log('Independent Codex MCP client assembled at ' + target);
