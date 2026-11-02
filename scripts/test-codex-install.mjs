/** Real Codex plugin management against local Git fixtures; no network, auth or inference. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const directory = await mkdtemp(join(tmpdir(), 'codex-catalog-install-'));
const source = join(directory, 'source');
const home = join(directory, 'home');
const bin = join(directory, 'bin');
const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;
try {
  await Promise.all([source, home, bin].map(path => mkdir(path)));
  const git = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const env = {
    ...process.env, CODEX_HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0',
  };
  const runGit = args => execFileSync(git, args, { cwd: source, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  runGit(['init', '--initial-branch=main']);
  runGit(['config', 'user.name', 'Local Fixture']);
  runGit(['config', 'user.email', 'fixture@example.invalid']);
  runGit(['config', 'commit.gpgsign', 'false']);
  runGit(['config', 'tag.gpgsign', 'false']);
  await mkdir(join(source, '.agents/plugins'), { recursive: true });
  await cp(join(root, '.agents/plugins/marketplace.json'), join(source, '.agents/plugins/marketplace.json'));
  const plugin = join(source, 'plugins/dsh-agent-team');
  await mkdir(plugin, { recursive: true });
  const pkg = JSON.parse(await readFile(join(root, 'plugins/dsh-agent-team/package.json'), 'utf8'));
  for (const file of [...pkg.files, 'package.json']) {
    await cp(join(root, 'plugins/dsh-agent-team', file), join(plugin, file), { recursive: true });
  }
  const snapshots = [
    { tag: 'v0.1.0', version: '0.2.0', marker: 'first' },
    { tag: 'v0.2.0', version: '0.2.1', marker: 'second' },
    { tag: 'v0.2.1', version: '0.2.1', marker: 'same-version-change' },
  ];
  for (const snapshot of snapshots) {
    for (const file of ['plugin.json', 'package.json']) {
      const path = join(plugin, file);
      const value = JSON.parse(await readFile(path, 'utf8'));
      value.version = snapshot.version;
      await writeFile(path, JSON.stringify(value));
    }
    await writeFile(join(plugin, 'README.md'), `${snapshot.marker}\n`);
    runGit(['add', '.']); runGit(['commit', '-m', snapshot.tag]); runGit(['tag', snapshot.tag]);
  }
  // Codex accepts GitHub-style Git sources. Rewrite this fixture URL to a local
  // repository and forbid every transport except file:; no network fallback.
  const url = 'https://github.com/local-fixture/oh-my-codex.git';
  await writeFile(join(bin, 'git'), `#!/bin/sh\nexec ${quote(git)} -c protocol.allow=never -c protocol.file.allow=always -c ${quote(`url.file://${source}.insteadOf=${url}`)} -c credential.helper= "$@"\n`, { mode: 0o700 });
  env.PATH = `${bin}:${process.env.PATH}`;
  const cli = args => {
    const result = spawnSync('codex', ['plugin', ...args, '--json'], { cwd: directory, env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return JSON.parse(result.stdout);
  };
  console.log(execFileSync('codex', ['--version'], { cwd: directory, env, encoding: 'utf8' }).trim());
  const sourceArgs = snapshot => ['marketplace', 'add', url, '--ref', snapshot.tag];
  cli(sourceArgs(snapshots[0]));
  assert.equal(cli(sourceArgs(snapshots[0])).alreadyAdded, true);
  const conflict = spawnSync('codex', ['plugin', ...sourceArgs(snapshots[1]), '--json'], { cwd: directory, env, encoding: 'utf8', timeout: 30_000 });
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /already added from a different source/);
  const observed = [];
  for (const [index, snapshot] of [...snapshots, snapshots[0]].entries()) {
    if (index) { cli(['marketplace', 'remove', 'oh-my-codex']); cli(sourceArgs(snapshot)); }
    // Refreshing a pinned immutable ref stays on that ref; it does not select a newer tag.
    cli(['marketplace', 'upgrade', 'oh-my-codex']);
    const installed = cli(['add', 'dsh-agent-team@oh-my-codex']);
    assert.equal(installed.version, snapshot.version);
    assert.equal(await readFile(join(installed.installedPath, 'README.md'), 'utf8'), `${snapshot.marker}\n`);
    assert(installed.installedPath.startsWith(`${await realpath(home)}/`));
    const mcp = JSON.parse(await readFile(join(installed.installedPath, 'mcp.json'), 'utf8')).mcpServers['dsh-agent-team'];
    const expand = value => value.replaceAll('${PLUGIN_ROOT}', installed.installedPath);
    const messages = [{ jsonrpc: '2.0', id: 1, method: 'initialize' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }].map(row => JSON.stringify(row)).join('\n') + '\n';
    const smoke = spawnSync(mcp.command, mcp.args.map(expand), { cwd: directory, env: { PATH: process.env.PATH }, input: messages, encoding: 'utf8', timeout: 10_000 });
    assert.equal(smoke.status, 0, smoke.stderr);
    assert.equal(JSON.parse(smoke.stdout.trim().split('\n')[1]).result.tools.length, 16);
    observed.push({ ...snapshot, mcpTools: JSON.parse(smoke.stdout.trim().split('\n')[1]).result.tools.length });
  }
  cli(['remove', 'dsh-agent-team@oh-my-codex']);
  cli(['marketplace', 'remove', 'oh-my-codex']);
  console.log(JSON.stringify({ localFixturesOnly: true, isolatedHome: true, observed }, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
