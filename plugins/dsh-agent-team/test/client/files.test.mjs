import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { withLifecycleLock, delay } from '../../src/host/files.mjs';

test('local lock preflight cannot release another local transaction to an external contender', { timeout: 15000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-lock-inode-'));
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const holding = withLifecycleLock(directory, 5000, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const source = `import {withLifecycleLock} from ${JSON.stringify(new URL('../../src/host/files.mjs', import.meta.url).href)}; process.send('ready'); await withLifecycleLock(process.argv[1],5000,async()=>process.send('entered')); process.disconnect();`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, directory], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const exited = once(child, 'exit');
  let external = false, local = false;
  child.on('message', message => { if (message === 'entered') external = true; });
  t.after(async () => { release.resolve(); if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exited; await rm(directory, { recursive: true, force: true }); });
  await once(child, 'message');
  const waiting = withLifecycleLock(await realpath(directory), 5000, async () => { local = true; });
  try { await delay(150); assert.equal(external, false); assert.equal(local, false); }
  finally { release.resolve(); await Promise.allSettled([holding, waiting]); }
  assert.deepEqual(await exited, [0, null]);
  assert.equal(external, true); assert.equal(local, true);
});

test('a timed-out local waiter never opens SQLite or runs its action later', { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-lock-timeout-'));
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const holding = withLifecycleLock(directory, 5000, async () => { entered.resolve(); await release.promise; });
  t.after(async () => { release.resolve(); await holding; await rm(directory, { recursive: true, force: true }); });
  await entered.promise;
  let ran = false;
  await assert.rejects(withLifecycleLock(directory, 30, async () => { ran = true; }), { code: 'STARTUP_BUSY' });
  release.resolve(); await holding;
  await withLifecycleLock(directory, 1000, async () => assert.equal(ran, false));
});
