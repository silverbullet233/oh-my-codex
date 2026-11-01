import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { open, unlink, mkdir, readdir, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { privateDirectory, readPrivate, writePrivate, birth, delay, withLifecycleLock } from './files.mjs';
import { loadRuntime } from '../native/runtime.mjs';
import { GatewayClient } from '../native/gateway.mjs';
import { ClientError } from '../native/errors.mjs';
import { aborted } from '../native/interactions.mjs';
import { handoffBrowser } from './browser.mjs';
import { diagnosticPath } from './output.mjs';
export function configuration(env = process.env) {
  return { home: resolve(env.DSH_AGENT_TEAM_HOME ?? join(env.CODEX_HOME ?? join(homedir(), '.codex'), 'dsh-agent-team', 'host')), runtimeAnchor: env.DSH_AGENT_TEAM_RUNTIME, profile: 'web', startupTimeoutMs: 20000 };
}
export async function initializeOwnedHome(home, cwd) {
  await mkdir(home, { recursive: true, mode: 0o700 }); await privateDirectory(home);
  const marker = join(home, '.codex-dsh-owner.json');
  const prior = await readPrivate(marker);
  if (prior) { if (prior.owner !== 'oh-my-codex/dsh-agent-team' || prior.version !== 1) throw new ClientError('UNOWNED_HOME', 'This home belongs to another application.'); return { ...prior, created: false }; }
  if ((await readdir(home)).length) throw new ClientError('UNOWNED_HOME', 'Use an empty dedicated Harness home; existing user profiles cannot be claimed.');
  const value = { version: 1, owner: 'oh-my-codex/dsh-agent-team', cwd: await realpath(cwd) };
  let file;
  try { file = await open(marker, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return initializeOwnedHome(home, cwd); throw error; }
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  return { ...value, created: true };
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
    return withLifecycleLock(this.directory, this.config.startupTimeoutMs + 5000, action);
  }
  async pendingStart() {
    const path = join(this.directory, 'starting.json');
    const provisional = await readPrivate(path);
    if (!provisional) return false;
    if (provisional.birthFormat !== 'utc-c-v1') throw new ClientError('STARTUP_UNCERTAIN', 'Older process attribution needs explicit inspection; no replacement writer was started.');
    const ready = await readPrivate(join(this.directory, `ready-${provisional.instanceId}.json`));
    const child = ready ?? provisional;
    if (child.pid && (birth(child.pid) === null || birth(child.pid) !== child.birth)) { await unlink(path); return false; }
    if (ready) {
      if (ready.instanceId !== provisional.instanceId || ready.home !== this.config.home || ready.runtimeAnchor !== this.runtime.anchor) throw new ClientError('OWNERSHIP_MISMATCH', 'Provisional native host does not match this owned home.');
      await writePrivate(join(this.directory, 'instance.json'), ready);
      await unlink(path); return false;
    }
    if (birth(provisional.supervisorPid) === provisional.supervisorBirth) return true;
    if (!provisional.pid) throw new ClientError('STARTUP_UNCERTAIN', 'The attributed launcher exited after spawn authorization without publishing a child identity; no replacement writer was started. Inspect the dedicated host.');
    throw new ClientError('STARTUP_UNCERTAIN', 'An attributed child outlived its launcher before readiness; no second writer was started. Inspect the dedicated host.');
  }

  async current() {
    const entry = await readPrivate(join(this.directory, 'instance.json'));
    if (!entry) return null;
    if (entry.version !== 1 || entry.birthFormat !== 'utc-c-v1' || !Number.isSafeInteger(entry.pid) || entry.pid <= 0 || typeof entry.birth !== 'string' || !entry.birth || entry.home !== this.config.home || entry.runtimeAnchor !== this.runtime.anchor || typeof entry.instanceId !== 'string') throw new ClientError('OWNERSHIP_MISMATCH', 'Owned host metadata does not match this runtime.');
    if (birth(entry.pid) !== entry.birth) { await unlink(join(this.directory, 'instance.json')); return null; }
    return entry;
  }
  async ensure() {
    let failedRunner, diagnosticsPath;
    this.starting ??= this.locked(async () => {
      let entry = await this.current();
      const pendingDeadline = Date.now() + this.config.startupTimeoutMs + 5000;
      while (!entry) {
        const pending = await this.pendingStart(); entry = await this.current();
        if (entry || !pending) break;
        if (Date.now() > pendingDeadline) throw new ClientError('STARTUP_PENDING', 'The attributed native host is still starting or stopping; no second writer was started.');
        await delay(25);
      }
      if (!entry) {
        const instanceId = randomUUID();
        diagnosticsPath = diagnosticPath(this.directory, instanceId);
        await writePrivate(diagnosticsPath, { version: 1, instanceId, text: '' });
        const launchPath = join(this.directory, `launch-${instanceId}.json`);
        await writePrivate(launchPath, { ...this.config, cwd: this.cwd, cli: this.runtime.cli, runtimeAnchor: this.runtime.anchor, instanceId });
        const runner = spawn(process.execPath, [join(import.meta.dirname, 'runner.mjs'), this.directory, launchPath], { env: process.env, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        await writePrivate(join(this.directory, 'starting.json'), { version: 1, birthFormat: 'utc-c-v1', phase: 'spawn-authorized', instanceId, supervisorPid: runner.pid, supervisorBirth: birth(runner.pid) });
        runner.send({ start: true });
        try { await new Promise((resolve_, reject) => {
          const timer = setTimeout(() => { runner.kill('SIGTERM'); reject(new ClientError('STARTUP_TIMEOUT', 'The owned native Web host did not become ready.')); }, this.config.startupTimeoutMs + 1000);
          const finish = error => { clearTimeout(timer); runner.removeAllListeners('exit'); if (error) reject(error); else resolve_(); };
          runner.once('error', () => finish(new ClientError('STARTUP_FAILED', 'Could not launch the owned native Web process.')));
          runner.once('exit', () => finish(new ClientError('STARTUP_FAILED', 'The owned native Web process failed before readiness.')));
          runner.once('message', message => finish(message.ready ? null : new ClientError('STARTUP_FAILED', 'The owned native Web process failed before readiness.')));
        }); } catch (error) { failedRunner = runner; throw error; } finally { runner.unref(); if (runner.connected) runner.disconnect(); }
        const ready = await readPrivate(join(this.directory, `ready-${instanceId}.json`));
        if (ready) await writePrivate(join(this.directory, 'instance.json'), ready);
        entry = await this.current();
        if (!entry) throw new ClientError('STARTUP_FAILED', 'The owned host exited before readiness could be confirmed.');
      }
      if (this.entry?.instanceId !== entry.instanceId) { await this.gateway?.close(); this.gateway = new GatewayClient({ runtime: this.runtime, entry }); }
      this.entry = entry;
      await this.gateway.request('health');
      return entry;
    }).catch(async error => {
      // The runner needs this lock for exit cleanup, so wait only after locked() releases it.
      if (error.code === 'STARTUP_FAILED' && failedRunner?.pid) {
        const deadline = Date.now() + 4000;
        while (failedRunner.exitCode === null && failedRunner.signalCode === null && Date.now() < deadline) await delay(25);
      }
      throw this.withDiagnostics(error, diagnosticsPath);
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }
  withDiagnostics(error, path = this.entry && diagnosticPath(this.directory, this.entry.instanceId)) {
    if (error instanceof ClientError && path && !error.diagnosticsPath) {
      error.diagnosticsPath = path; error.message += ` Diagnostics: ${path}`;
    }
    return error;
  }
  async request(method, params = {}, options = {}) {
    try {
      aborted(options.signal);
      if (method === 'shutdown') return await this.shutdown(options);
      await this.ensure();
      aborted(options.signal);
      if (method === 'web') {
        return { ...await handoffBrowser(this.entry.url), diagnostics: { path: diagnosticPath(this.directory, this.entry.instanceId) } };
      }
      const value = await this.gateway.request(method, params, options);
      if (method === 'create') return { ...value, web: { url: new URL(this.entry.url).origin, scope: 'host' } };
      return method === 'health' ? { ...value, diagnostics: { path: diagnosticPath(this.directory, this.entry.instanceId) }, web: { url: new URL(this.entry.url).origin }, owned: true } : value;
    } catch (error) { throw this.withDiagnostics(error); }
  }
  async shutdown({ signal } = {}) {
    aborted(signal);
    let supervisor;
    const result = await this.locked(async () => {
      aborted(signal);
      let entry = await this.current();
      if (!entry) {
        if (await this.pendingStart()) return { stopped: false, reason: 'startup-in-progress' };
        entry = await this.current();
        if (!entry) return { stopped: true, alreadyStopped: true };
      }
      supervisor = { pid: entry.supervisorPid, birth: birth(entry.supervisorPid) };
      const client = new GatewayClient({ runtime: this.runtime, entry });
      try {
        await client.request('health', {}, { signal });
        const guard = await client.request('prepareShutdown', {}, { signal });
        aborted(signal);
        if (!guard.safeToStop) return { stopped: false, reason: 'active-or-uncertain-work', activity: guard };
        if (Date.now() >= guard.leaseExpiresAt || birth(entry.pid) !== entry.birth) throw new ClientError('OWNERSHIP_CHANGED', 'Owned process identity or shutdown lease changed; no signal was sent.');
        process.kill(entry.pid, 'SIGTERM');
        const deadline = Math.min(guard.leaseExpiresAt, Date.now() + 4000);
        while (birth(entry.pid) === entry.birth && Date.now() < deadline) await delay(25);
        if (birth(entry.pid) === entry.birth) throw new ClientError('SHUTDOWN_PENDING', 'Graceful host shutdown is pending. No force-kill was sent; the admission fence will expire.');
        await this.gateway?.close(); this.gateway = undefined; this.entry = undefined;
        return { stopped: true };
      } catch (error) { throw this.withDiagnostics(error, diagnosticPath(this.directory, entry.instanceId)); }
      finally { await client.close(); }
    });
    // Exit cleanup needs the same coordination lock, so wait after releasing it.
    if (result.stopped && supervisor?.birth) {
      const deadline = Date.now() + 4000;
      while (birth(supervisor.pid) === supervisor.birth && Date.now() < deadline) await delay(25);
      if (birth(supervisor.pid) === supervisor.birth) return { ...result, cleanupPending: true };
    }
    return result;
  }
  async close() { await this.gateway?.close(); this.gateway = undefined; this.entry = undefined; }
}
