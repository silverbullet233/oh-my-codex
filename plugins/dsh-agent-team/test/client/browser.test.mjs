import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { handoffBrowser } from '../../src/host/browser.mjs';
import { birth, delay } from '../../src/host/files.mjs';

test('Linux browser handoff returns while its launcher lives and never returns a capability', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-browser-handoff-'));
  const bin = join(root, 'bin'); await mkdir(bin);
  const pidFile = join(root, 'pid'); let pid;
  t.after(async () => { if (pid && birth(pid)) process.kill(pid, 'SIGTERM'); await rm(root, { recursive: true, force: true }); });
  await writeFile(join(bin, 'xdg-open'), ['#!/bin/sh', 'echo $$ > "$DSH_HANDOFF_PID"', 'exec sleep 30', ''].join('\n'), { mode: 0o700 });
  const started = Date.now();
  const result = await handoffBrowser('http://127.0.0.1:12345/?token=synthetic-launch-secret', { platform: 'linux', env: { PATH: bin + delimiter + process.env.PATH, DSH_HANDOFF_PID: pidFile } });
  assert(Date.now() - started < 2000);
  for (let i = 0; i < 200 && !pid; i++) {
    try { pid = Number(await readFile(pidFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!pid) await delay(10);
  }
  assert(pid);
  assert(birth(pid));
  assert.deepEqual(result, { opened: true, url: 'http://127.0.0.1:12345' });
  assert.doesNotMatch(JSON.stringify(result), /token|synthetic-launch-secret/);
});

test('failed browser spawn or exit before handoff returns a capability-free error', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-browser-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const url = 'http://127.0.0.1:12345/?token=synthetic-launch-secret';
  await assert.rejects(handoffBrowser(url, { platform: 'linux', env: { PATH: root } }), { code: 'WEB_OPEN_FAILED' });
  await writeFile(join(root, 'xdg-open'), ['#!/bin/sh', 'exit 7', ''].join('\n'), { mode: 0o700 });
  // Observe the actual child exit before advancing the handoff deadline. OS
  // scheduling under parallel tests need not run even this script within 250ms.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await assert.rejects(handoffBrowser(url, { platform: 'linux', env: { PATH: root } }), error => error.code === 'WEB_OPEN_FAILED' && !error.message.includes('synthetic-launch-secret'));
});
