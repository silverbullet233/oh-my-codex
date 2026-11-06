/** Detached carrier owner; consumes native startup output without forwarding secrets. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readPrivate, writePrivate, birth, removeIf, withLifecycleLock } from './files.mjs';
import { captureNativeOutput, diagnosticLog, diagnosticPath } from './output.mjs';
const directory = process.argv[2];
const config = await readPrivate(process.argv[3]);
const provisional = join(directory, 'starting.json');
let started = false;
process.on('disconnect', () => { if (!started) void removeIf(provisional, config.instanceId).finally(() => process.exit(1)); });
await new Promise(resolve => process.once('message', resolve));
started = true;
const child = spawn(process.execPath, [config.cli, '--profile', config.profile, '--no-open', '--host', '127.0.0.1', '--port', '0'], {
  cwd: config.cwd, env: { ...process.env, DSH_HOME: config.home, DSH_OWNED_INSTANCE_ID: config.instanceId, DSH_AGENT_TEAM_LAUNCH_PERMISSION_BINDING: config.permissionBinding }, stdio: ['ignore', 'pipe', 'pipe'],
});
const attribution = writePrivate(provisional, { version: 1, birthFormat: 'utc-c-v1', phase: 'child-published', instanceId: config.instanceId, supervisorPid: process.pid, supervisorBirth: birth(process.pid), ...(child.pid ? { pid: child.pid, birth: birth(child.pid) } : {}) });
const record = join(directory, `ready-${config.instanceId}.json`);
let publication = Promise.resolve();
let ready = false, finished = false;
const diagnosticsPath = diagnosticPath(directory, config.instanceId);
const diagnostics = diagnosticLog(diagnosticsPath, config.instanceId);
const report = value => { if (process.connected) process.send(value); };
const deadline = setTimeout(() => { if (!ready) child.kill('SIGTERM'); }, config.startupTimeoutMs);
const output = captureNativeOutput(url => {
  if (ready || finished || !birth(child.pid)) return false;
  ready = true; clearTimeout(deadline);
  publication = attribution.then(() => writePrivate(record, { version: 1, birthFormat: 'utc-c-v1', home: config.home, instanceId: config.instanceId, pid: child.pid, birth: birth(child.pid), supervisorPid: process.pid, url, runtimeAnchor: config.runtimeAnchor, permissionBinding: config.permissionBinding, diagnosticsPath })).then(() => {
    if (finished) return;
    report({ ready: true }); if (process.connected) process.disconnect();
  }, () => child.kill('SIGTERM'));
  return true;
}, line => diagnostics.append(line));
for (const name of ['stdout', 'stderr']) {
  child[name].on('data', chunk => output.push(name, chunk));
  child[name].on('end', () => output.end(name));
}
let finalized = false;
const finalize = async () => {
  if (finalized) return; finalized = true;
  finished = true; clearTimeout(deadline);
  await Promise.allSettled([attribution, publication, diagnostics.flush()]);
  report({ error: ready ? 'HOST_EXITED' : 'STARTUP_FAILED' });
  await withLifecycleLock(directory, config.startupTimeoutMs + 5000, async () => {
    await removeIf(record, config.instanceId).catch(() => {});
    await removeIf(join(directory, 'instance.json'), config.instanceId).catch(() => {});
    await removeIf(provisional, config.instanceId).catch(() => {});
  }).catch(() => {});
  const { unlink } = await import('node:fs/promises'); await unlink(process.argv[3]).catch(() => {});
  process.exit(ready ? 0 : 1);
};
child.on('error', () => { void finalize(); });
child.on('close', () => { void finalize(); });
process.on('SIGTERM', () => { if (!finished) child.kill('SIGTERM'); });
