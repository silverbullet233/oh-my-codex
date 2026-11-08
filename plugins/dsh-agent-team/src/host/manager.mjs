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
import { WEB_URL_DISCLOSURE, WEB_URL_SCOPE, authenticatedHostEntry, managedRootTeam, webUrlCancelled, webUrlCleanupError, webUrlError } from './web-url.mjs';
import { readPermissionContext, requireExecutableContext, selectPermissions, profileAuthorized, verifyHostBinding, verifyNativePermissions } from './permissions.mjs';
export function configuration(env = process.env, permissionAuthority) {
  return { home: resolve(env.DSH_AGENT_TEAM_HOME ?? join(env.CODEX_HOME ?? join(homedir(), '.codex'), 'dsh-agent-team', 'host')), cwd: process.cwd(), runtimeAnchor: env.DSH_AGENT_TEAM_RUNTIME, profile: 'web', startupTimeoutMs: 20000, permissionAuthority, permissionContext: env.DSH_AGENT_TEAM_PERMISSION_CONTEXT };
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
// Every OwnedHost in this MCP process shares one audience; another process cannot replay it.
const permissionAudience = randomUUID();
/** One owned ordinary Web host, reused across disposable MCP connections. */
export class OwnedHost {
  constructor(config = configuration()) {
    this.config = { ...config, permissionAudience };
    // Isolated tests may inject a deterministic process-start verifier; production
    // configuration(env) never sets this, so the real birth() guard is unchanged.
    this.verifyBirth = config._birth ?? birth;
  }
  /** Read-only owned-home validation: loads the runtime and marker but creates no directory. */
  async inspectOwned() {
    this.runtime ??= await loadRuntime(this.config.runtimeAnchor);
    this.config.home = await realpath(this.config.home);
    const marker = await readPrivate(join(this.config.home, '.codex-dsh-owner.json'));
    if (marker?.version !== 1 || marker.owner !== 'oh-my-codex/dsh-agent-team') throw new ClientError('SETUP_REQUIRED', 'Initialize a dedicated home with scripts/setup.mjs and install the host candidate there. Existing user Web processes are never reused.');
    this.cwd = marker.cwd;
    this.directory = join(this.config.home, '.codex-owned');
  }
  async prepare() {
    await this.inspectOwned();
    await privateDirectory(this.directory);
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
    if (child.pid && (birth(child.pid) === null || birth(child.pid) !== child.birth)) {
      if (provisional.awaitingSandboxHostIdentity) throw new ClientError('STARTUP_UNCERTAIN', 'The sandbox launcher exited before host identity was confirmed. Descendant exit is unknown; no replacement writer was started. Inspect the dedicated host.');
      await unlink(path); return false;
    }
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
    if (this.verifyBirth(entry.pid) !== entry.birth) { await unlink(join(this.directory, 'instance.json')); return null; }
    return entry;
  }
  /**
   * Explicit, secret-bearing read of the existing owned host's authenticated homepage URL.
   * Never starts, adopts or restarts a host and never opens a browser. The Team must be an
   * existing managed Lead/root on this owned host; member, unknown and foreign IDs fail closed.
   */
  createGateway(entry, options = {}) { return new GatewayClient({ runtime: this.runtime, entry, ...options }); }
  async webUrl(params = {}, options = {}) {
    // Static sanitized boundary for EVERY exit of the public operation: metadata parsing,
    // attribution, status/transport and cleanup failures can never surface arbitrary raw text
    // (the private instance record is credential-bearing). Known safe guard codes keep static
    // actionable mappings; everything else is a static generic failure.
    try { return await this.queryWebUrl(params, options); }
    catch (error) {
      if (options.signal?.aborted) throw webUrlCancelled();
      if (error instanceof ClientError && error.sanitized === true) throw error;
      throw webUrlError(error);
    }
  }
  async queryWebUrl(params = {}, options = {}) {
    try { aborted(options.signal); } catch { throw webUrlCancelled(); }
    if (typeof params.teamId !== 'string' || !params.teamId || params.teamId.length > 256) throw new ClientError('UNMANAGED_TEAM', 'dsh_team_web_url requires exactly one existing managed Lead/root Team ID. No URL was disclosed.');
    // Revalidate the owned home, private metadata, runtime identity and instance
    // attribution on EVERY disclosure, including a cached foreground entry. The
    // gateway health handshake and the Team status read are not substitutes for
    // the local pid+birth attribution guard in current().
    await this.inspectOwned();
    const entry = await this.current();
    if (!entry) throw new ClientError('HOST_NOT_RUNNING', 'The owned native Web host is not running. This query never starts, adopts or restarts one; start it explicitly with dsh_team_health first. No URL was disclosed.');
    const cached = this.entry;
    if (cached && (cached.instanceId !== entry.instanceId || cached.pid !== entry.pid || cached.birth !== entry.birth
      || cached.home !== entry.home || cached.runtimeAnchor !== entry.runtimeAnchor || cached.url !== entry.url)) {
      throw new ClientError('HOST_NOT_RUNNING', 'The cached owned-host entry no longer matches the attributed instance record; refresh with dsh_team_health before requesting the URL. No URL was disclosed.');
    }
    const { url, origin } = authenticatedHostEntry(entry);
    // A fresh passive connection (interactions=none) performs the one Team status
    // read; it never claims, answers or cancels native interactions and is closed
    // after use. No host is started, adopted, restarted or stopped.
    const client = this.createGateway(entry, { interactionMode: 'none' });
    let status, primaryError, cleanupError;
    try {
      status = await client.request('status', { teamId: params.teamId }, options);
      managedRootTeam(status, params.teamId);
    } catch (error) { primaryError = error; }
    // Cleanup runs separately: a disposal failure must neither override an actionable
    // primary error mapping nor be swallowed into a successful disclosure.
    try { await client.close(); } catch (error) { cleanupError = error; }
    // close() can itself observe cancellation, including when it also fails.
    // Never return the credential after cancellation in any cleanup path.
    if (options.signal?.aborted) throw webUrlCancelled();
    if (primaryError) {
      // Known safe failures are reconstructed with static token-free messages; any
      // other status/transport error is replaced by a generic wrapper.
      throw webUrlError(primaryError);
    }
    if (cleanupError) throw webUrlCleanupError();
    return { teamId: params.teamId, scope: WEB_URL_SCOPE, url, origin, disclosure: { ...WEB_URL_DISCLOSURE } };
  }
  async ensure(context, { allowStart = true } = {}) {
    if (allowStart) context ??= await readPermissionContext(this.config);
    if (context) requireExecutableContext(context);
    let failedRunner, diagnosticsPath;
    this.starting ??= this.locked(async () => {
      let entry = await this.current();
      if (!entry && !allowStart) throw new ClientError('HOST_NOT_RUNNING', 'This observation/control requires an existing attributed host; no host was started.');
      const pendingDeadline = Date.now() + this.config.startupTimeoutMs + 5000;
      while (!entry) {
        const pending = await this.pendingStart(); entry = await this.current();
        if (entry || !pending) break;
        if (Date.now() > pendingDeadline) throw new ClientError('STARTUP_PENDING', 'The attributed native host is still starting or stopping; no second writer was started.');
        await delay(25);
      }
      if (entry && context) verifyHostBinding(entry, context);
      if (!entry) {
        const instanceId = randomUUID();
        diagnosticsPath = diagnosticPath(this.directory, instanceId);
        await writePrivate(diagnosticsPath, { version: 1, instanceId, text: '' });
        const launchPath = join(this.directory, `launch-${instanceId}.json`);
        await writePrivate(launchPath, { ...this.config, cwd: context.binding?.cwd ?? this.cwd, cli: this.runtime.cli, runtimeAnchor: this.runtime.anchor, instanceId, permissionBinding: context.bindingHash, permissionExecution: context.execution });
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
      if (this.entry?.instanceId !== entry.instanceId) { await this.gateway?.close(); this.gateway = this.createGateway(entry); }
      this.entry = entry;
      const health = await this.gateway.request('health');
      if (context) verifyHostBinding(entry, context, health);
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
      if (method === 'webUrl') return await this.webUrl(params, options);
      const allowStart = ['health', 'web', 'create', 'send'].includes(method);
      // Both ordinary and continued interaction replies can resume execution.
      // Even a denial encoded as a continued question calls userQuestions.answer.
      const admitsWork = ['create', 'send', 'answer', 'approval'].includes(method);
      const context = allowStart || admitsWork ? await readPermissionContext(this.config) : null;
      if (context) {
        try { requireExecutableContext(context); }
        catch (error) {
          if (method !== 'health') throw error;
          // Capability observation must remain usable without spawning work.
          return { ok: false, owned: false, permissionSource: context.provenance, execution: context.execution, limitation: { code: error.code, message: error.message } };
        }
      }
      if (method === 'create') selectPermissions(context, params);
      await this.ensure(context, { allowStart });
      aborted(options.signal);
      if (context) verifyHostBinding(this.entry, context);
      if (method === 'create') {
        const permissions = selectPermissions(context, params);
        const { permissionAuthorization, ...request } = params;
        params = { ...request, permissionProfile: { ...permissions, binding: context.bindingHash } };
      }
      aborted(options.signal);
      if (method === 'web') {
        return { ...await handoffBrowser(this.entry.url), diagnostics: { path: diagnosticPath(this.directory, this.entry.instanceId) } };
      }
      const gateway = this.gateway, entry = this.entry;
      const beforeSubmit = admitsWork ? async () => {
        aborted(options.signal);
        if (this.gateway !== gateway || this.entry !== entry) throw new ClientError('HOST_PERMISSION_MISMATCH', 'The attributed host changed during admission. No work was submitted.');
        if (method !== 'create') {
          const status = await gateway.request('status', { teamId: params.teamId }, options);
          if (!profileAuthorized(context, status.permissionProfile)) {
            throw new ClientError('PERMISSION_MISMATCH', 'The Team permission intent is absent or no longer authorized by this launch context. No work was submitted.');
          }
          verifyNativePermissions(status.permissions, status.permissionProfile);
        }
        const fresh = await readPermissionContext(this.config);
        requireExecutableContext(fresh);
        aborted(options.signal);
        if (this.gateway !== gateway || this.entry !== entry) throw new ClientError('HOST_PERMISSION_MISMATCH', 'The attributed host changed during admission. No work was submitted.');
        verifyHostBinding(entry, fresh, gateway.lastHealth);
        if (JSON.stringify(fresh) !== JSON.stringify(context)) throw new ClientError('PERMISSION_CONTEXT_CHANGED', 'Permission context changed during admission. No work was submitted.');
        if (fresh.provenance.expiresAt <= Date.now()) throw new ClientError('PERMISSION_CONTEXT_INVALID', 'Permission context expired during admission. No work was submitted.');
      } : undefined;
      const value = await gateway.request(method, params, { ...options, beforeSubmit });
      if (method === 'create') { verifyNativePermissions(value.permissions, params.permissionProfile); return { ...value, permissionSource: context.provenance, execution: context.execution, web: { url: new URL(this.entry.url).origin, scope: 'host' } }; }
      return method === 'health' ? { ...value, permissionSource: context.provenance, execution: context.execution, diagnostics: { path: diagnosticPath(this.directory, this.entry.instanceId) }, web: { url: new URL(this.entry.url).origin }, owned: true } : value;
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
      const client = this.createGateway(entry);
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
