/** Detached carrier owner; consumes native startup output without forwarding secrets. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readPrivate, writePrivate, birth, removeIf } from './files.mjs';
const directory = process.argv[2];
const config = await readPrivate(process.argv[3]);
const provisional = join(directory, 'starting.json');
let started = false;
process.on('disconnect', () => { if (!started) void removeIf(provisional, config.instanceId).finally(() => process.exit(1)); });
await new Promise(resolve => process.once('message', resolve));
started = true;
const child = spawn(process.execPath, [config.cli, '--profile', config.profile, '--no-open', '--host', '127.0.0.1', '--port', '0'], {
  cwd: config.cwd, env: { ...process.env, DSH_HOME: config.home, DSH_OWNED_INSTANCE_ID: config.instanceId }, stdio: ['ignore', 'pipe', 'pipe'],
});
await writePrivate(provisional, { version: 1, instanceId: config.instanceId, supervisorPid: process.pid, supervisorBirth: birth(process.pid), ...(child.pid ? { pid: child.pid, birth: birth(child.pid) } : {}) });
const record = join(directory, 'instance.json');
let ready = false, finished = false, buffer = '';
const report = value => { if (process.connected) process.send(value); };
const deadline = setTimeout(() => { if (!ready) child.kill('SIGTERM'); }, config.startupTimeoutMs);
const consume = chunk => {
  if (ready) return;
  buffer = (buffer + chunk.toString('utf8')).slice(-32768);
  const end = buffer.lastIndexOf('\n');
  if (end < 0) return;
  const lines = buffer.slice(0, end); buffer = buffer.slice(end + 1);
  for (const match of lines.matchAll(/http:\/\/127\.0\.0\.1:\d+[^\s<>"']*/g)) {
    let url; try { url = new URL(match[0].replace(/\x1b\[[0-9;]*m/g, '')); } catch { continue; }
    if (!url.searchParams.get('token') || !birth(child.pid)) continue;
    ready = true; clearTimeout(deadline);
    void writePrivate(record, { version: 1, home: config.home, instanceId: config.instanceId, pid: child.pid, birth: birth(child.pid), supervisorPid: process.pid, url: url.href, runtimeAnchor: config.runtimeAnchor }).then(() => {
      void removeIf(provisional, config.instanceId);
      report({ ready: true }); if (process.connected) process.disconnect();
    }, () => child.kill('SIGTERM'));
    break;
  }
};
child.stdout.on('data', consume); child.stderr.on('data', consume);
child.on('error', async () => { clearTimeout(deadline); await removeIf(provisional, config.instanceId).catch(() => {}); report({ error: 'STARTUP_FAILED' }); process.exit(1); });
child.on('exit', async () => {
  finished = true; clearTimeout(deadline);
  await removeIf(record, config.instanceId).catch(() => {});
  await removeIf(provisional, config.instanceId).catch(() => {});
  const { unlink } = await import('node:fs/promises'); await unlink(process.argv[3]).catch(() => {});
  report({ error: ready ? 'HOST_EXITED' : 'STARTUP_FAILED' });
  process.exit(ready ? 0 : 1);
});
process.on('SIGTERM', () => { if (!finished) child.kill('SIGTERM'); });
