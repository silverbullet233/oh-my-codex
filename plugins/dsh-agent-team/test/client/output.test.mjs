import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureNativeOutput, diagnosticLog, DIAGNOSTIC_LIMIT } from '../../src/host/output.mjs';

test('interleaved stdout/stderr preserves the exact launch URL and redacts both streams after readiness', () => {
  const url = 'http://127.0.0.1:12345/?token=synthetic-head-tail';
  const launches = [], lines = [];
  const output = captureNativeOutput(value => { launches.push(value); return true; }, line => lines.push(line));
  output.push('stdout', Buffer.from('Web: ' + url.slice(0, -5)));
  output.push('stderr', Buffer.from('activation diagnostic\n'));
  output.push('stdout', Buffer.from(url.slice(-5) + '\n'));
  output.push('stderr', Buffer.from('runtime diagnostic synthetic-head-tail\nCookie: synthetic-cookie\nAuthorization: Bearer synthetic-bearer\n'));
  output.push('stdout', Buffer.from('https://user:synthetic-password@example.invalid/path?api_key=synthetic-key#fragment\n'));
  assert.deepEqual(launches, [url]);
  const text = lines.join('');
  assert.match(text, /activation diagnostic/); assert.match(text, /runtime diagnostic/);
  for (const secret of ['synthetic-head-tail', 'synthetic-cookie', 'synthetic-bearer', 'synthetic-password', 'synthetic-key', 'fragment']) assert(!text.includes(secret), 'Only capability-redacted diagnostics may be retained');
});

test('partial UTF-8 and oversized native lines remain bounded without logging a capability suffix', () => {
  const lines = []; let launches = 0;
  const output = captureNativeOutput(() => { launches++; return true; }, line => lines.push(line));
  const unicode = Buffer.from('synthetic 中文\n');
  output.push('stderr', unicode.subarray(0, 11)); output.push('stderr', unicode.subarray(11));
  output.push('stdout', Buffer.from('http://127.0.0.1:12345/?token=' + 'x'.repeat(9000)));
  output.push('stdout', Buffer.from('synthetic-sensitive-suffix\n'));
  output.push('stderr', Buffer.from('last partial diagnostic')); output.end('stderr');
  assert.equal(launches, 0);
  assert.match(lines.join(''), /synthetic 中文/);
  assert.match(lines.join(''), /last partial diagnostic/);
  assert(!lines.join('').includes('synthetic-sensitive-suffix'));
  assert(lines.join('').length < 500);
});

test('private diagnostics retain only a bounded recent tail and flush the latest write', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-private-diagnostics-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'diagnostics.json');
  const log = diagnosticLog(path, 'fixture');
  for (let index = 0; index < 500; index++) log.append(`diagnostic ${index}: ${'x'.repeat(1024)}\n`);
  log.append('last native diagnostic\n'); await log.flush();
  const stat = await lstat(path), record = JSON.parse(await readFile(path, 'utf8'));
  assert(stat.size <= DIAGNOSTIC_LIMIT); assert.equal(stat.mode & 0o077, 0);
  assert(record.text.endsWith('last native diagnostic\n'));
  assert(!record.text.includes('diagnostic 0:'));
});
