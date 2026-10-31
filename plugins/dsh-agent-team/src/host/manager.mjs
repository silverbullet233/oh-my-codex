import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { open, unlink, mkdir, readdir, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { privateDirectory, readPrivate, writePrivate, birth, delay } from './files.mjs';
import { loadRuntime } from '../native/runtime.mjs';
import { GatewayClient } from '../native/gateway.mjs';
import { ClientError } from '../native/errors.mjs';
const execute = promisify(execFile);
export function configuration(env = process.env) {
  return { home: resolve(env.DSH_AGENT_TEAM_HOME ?? join(env.CODEX_HOME ?? join(homedir(), '.codex'), 'dsh-agent-team', 'host')), runtimeAnchor: env.DSH_AGENT_TEAM_RUNTIME, profile: 'web', startupTimeoutMs: 20000 };
}
export async function initializeOwnedHome(home, cwd) {
  await mkdir(home, { recursive: true, mode: 0o700 }); await privateDirectory(home);
  const marker = join(home, '.codex-dsh-owner.json');
  const prior = await readPrivate(marker);
  if (prior) { if (prior.owner !== 'oh-my-codex/dsh-agent-team' || prior.version !== 1) throw new ClientError('UNOWNED_HOME', 'This home belongs to another application.'); return prior; }
  if ((await readdir(home)).length) throw new ClientError('UNOWNED_HOME', 'Use an empty dedicated Harness home; existing user profiles cannot be claimed.');
  const value = { version: 1, owner: 'oh-my-codex/dsh-agent-team', cwd: await realpath(cwd) };
  await writePrivate(marker, value); return value;
}
/** One owned ordinary Web host, reused across disposable MCP connections. */
export class OwnedHost {
  constructor(config = configuration()) { this.config = config; }
  async prepare() {
    this.runtime ??= await loadRuntime(this.config.runtimeAnchor);
    this.config.home = await realpath(this.config.home);
    const marker = await readPrivate(join(this.config.home, '.codex-dsh-owner.json'));
    if (marker?.version !== 1 || marker.owner !== 'oh-my-codex/dsh-agent-team') throw new ClientError('SETUP_REQUIRED', 'Initialize a dedicated home with scripts/setup.mjs and install the host candidate there. Existing user Web processes are never reused.');
    this.cwd = marker.cwd;
    this.directory = join(this.config.home, '.codex-owned'); await privateDirectory(this.directory);
  }
  async locked(action) {
    await this.prepare();
    const path = join(this.directory, 'lifecycle.sqlite');
    const file = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try { const stat = await file.stat(); if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new ClientError('UNSAFE_STATE', 'Lifecycle coordination requires a private file.'); } finally { await file.close(); }
    const database = new DatabaseSync(path);
    database.exec('PRAGMA busy_timeout=0');
    const deadline = Date.now() + this.config.startupTimeoutMs + 5000;
    try {
      while (true) {
        try { database.exec('BEGIN IMMEDIATE'); break; }
        catch (error) {
          if (!String(error.message).includes('locked')) throw error;
          if (Date.now() > deadline) throw new ClientError('STARTUP_BUSY', 'Another owner is starting or inspecting this host; retry after it settles.');
          await delay(25);
        }
      }
      try { return await action(); }
      finally { database.exec('ROLLBACK'); }
    } finally { database.close(); }
  }
  async pendingStart() {
    const path = join(this.directory, 'starting.json');
    const provisional = await readPrivate(path);
    if (!provisional) return false;
    if (birth(provisional.supervisorPid) === provisional.supervisorBirth) return true;
    if (provisional.pid && birth(provisional.pid) === provisional.birth) throw new ClientError('STARTUP_UNCERTAIN', 'An attributed child outlived its launcher before readiness; no second writer was started. Inspect the dedicated host.');
    await unlink(path); return false;
  }
  async current() {
    const entry = await readPrivate(join(this.directory, 'instance.json'));
    if (!entry) return null;
    if (entry.version !== 1 || entry.home !== this.config.home || entry.runtimeAnchor !== this.runtime.anchor || typeof entry.instanceId !== 'string') throw new ClientError('OWNERSHIP_MISMATCH', 'Owned host metadata does not match this runtime.');
    if (birth(entry.pid) !== entry.birth) { await unlink(join(this.directory, 'instance.json')); return null; }
    return entry;
  }
  async ensure() {
    this.starting ??= this.locked(async () => {
      let entry = await this.current();
      const pendingDeadline = Date.now() + this.config.startupTimeoutMs + 5000;
      while (!entry && await this.pendingStart()) {
        if (Date.now() > pendingDeadline) throw new ClientError('STARTUP_PENDING', 'The attributed native host is still starting or stopping; no second writer was started.');
        await delay(25); entry = await this.current();
      }
      if (!entry) {
        const instanceId = randomUUID();
        const launchPath = join(this.directory, `launch-${instanceId}.json`);
        await writePrivate(launchPath, { ...this.config, cwd: this.cwd, cli: this.runtime.cli, runtimeAnchor: this.runtime.anchor, instanceId });
        const runner = spawn(process.execPath, [join(import.meta.dirname, 'runner.mjs'), this.directory, launchPath], { env: process.env, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        await writePrivate(join(this.directory, 'starting.json'), { version: 1, instanceId, supervisorPid: runner.pid, supervisorBirth: birth(runner.pid) });
        runner.send({ start: true });
        try { await new Promise((resolve_, reject) => {
          const timer = setTimeout(() => { runner.kill('SIGTERM'); reject(new ClientError('STARTUP_TIMEOUT', 'The owned native Web host did not become ready.')); }, this.config.startupTimeoutMs + 1000);
          const finish = error => { clearTimeout(timer); runner.removeAllListeners('exit'); if (error) reject(error); else resolve_(); };
          runner.once('error', () => finish(new ClientError('STARTUP_FAILED', 'Could not launch the owned native Web process.')));
          runner.once('exit', () => finish(new ClientError('STARTUP_FAILED', 'The owned native Web process failed before readiness.')));
          runner.once('message', message => finish(message.ready ? null : new ClientError('STARTUP_FAILED', 'The owned native Web process failed before readiness.')));
        }); } finally { runner.unref(); if (runner.connected) runner.disconnect(); }
        entry = await this.current();
        if (!entry) throw new ClientError('STARTUP_FAILED', 'The owned host exited before readiness could be confirmed.');
      }
      if (this.entry?.instanceId !== entry.instanceId) { await this.gateway?.close(); this.gateway = new GatewayClient({ runtime: this.runtime, entry }); }
      this.entry = entry;
      await this.gateway.request('health');
      return entry;
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }
  async request(method, params = {}) {
    if (method === 'shutdown') return this.shutdown();
    await this.ensure();
    if (method === 'web') {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
      if (!command) throw new ClientError('PLATFORM_UNSUPPORTED', 'Native Web handoff is validated on macOS and Linux only.');
      try { await execute(command, [this.entry.url]); } catch { throw new ClientError('WEB_OPEN_FAILED', 'Could not open the native Web entry. No launch capability was logged.'); }
      return { opened: true, url: new URL(this.entry.url).origin };
    }
    const value = await this.gateway.request(method, params);
    return method === 'health' ? { ...value, web: { url: new URL(this.entry.url).origin }, owned: true } : value;
  }
  async shutdown() {
    return this.locked(async () => {
      const entry = await this.current();
      if (!entry) {
        if (await this.pendingStart()) return { stopped: false, reason: 'startup-in-progress' };
        return { stopped: true, alreadyStopped: true };
      }
      const client = new GatewayClient({ runtime: this.runtime, entry });
      try {
        await client.request('health');
        const guard = await client.request('prepareShutdown');
        if (!guard.safeToStop) return { stopped: false, reason: 'active-or-uncertain-work', activity: guard };
        if (Date.now() >= guard.leaseExpiresAt || birth(entry.pid) !== entry.birth) throw new ClientError('OWNERSHIP_CHANGED', 'Owned process identity or shutdown lease changed; no signal was sent.');
        process.kill(entry.pid, 'SIGTERM');
        const deadline = Math.min(guard.leaseExpiresAt, Date.now() + 4000);
        while (birth(entry.pid) === entry.birth && Date.now() < deadline) await delay(25);
        if (birth(entry.pid) === entry.birth) throw new ClientError('SHUTDOWN_PENDING', 'Graceful host shutdown is pending. No force-kill was sent; the admission fence will expire.');
        await this.gateway?.close(); this.gateway = undefined; this.entry = undefined;
        return { stopped: true };
      } finally { await client.close(); }
    });
  }
  async close() { await this.gateway?.close(); this.gateway = undefined; this.entry = undefined; }
}
