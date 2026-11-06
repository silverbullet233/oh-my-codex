/** No listener, ps, signal, real host or real bearer credential is used by this suite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, realpath, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { OwnedHost, initializeOwnedHome } from '../../src/host/manager.mjs';
import { writePrivate } from '../../src/host/files.mjs';
import { createDispatcher } from '../../src/mcp/server.mjs';
import { ClientError } from '../../src/native/errors.mjs';

const token = 'synthetic-memory-only';
const entryUrl = `http://127.0.0.1:12345/?token=${token}`;
async function fixture(t) {
  const builds = resolve(import.meta.dirname, '../../../../.test-output'); await mkdir(builds, { recursive: true });
  const root = await mkdtemp(join(builds, 'web-memory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = join(root, 'runtime'); await mkdir(join(runtime, 'lib'), { recursive: true });
  await writeFile(join(runtime, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.2-alpha.3', type: 'module' }));
  await writeFile(join(runtime, 'lib/bin.js'), 'throw new Error("memory suite must never launch a host");');
  const home = join(root, 'home'); await initializeOwnedHome(home, root);
  const directory = join(home, '.codex-owned'); await mkdir(directory, { mode: 0o700 });
  const path = join(directory, 'instance.json');
  const record = { version: 1, birthFormat: 'utc-c-v1', home: await realpath(home), runtimeAnchor: await realpath(join(runtime, 'package.json')), instanceId: 'memory-host', pid: 123, birth: 'fixture-birth', url: entryUrl };
  await writePrivate(path, record);
  let live = true, status = { sessionId: 'root', team: { members: [{ id: 'root' }] } }, failure, cleanup;
  const calls = [];
  const owner = new OwnedHost({ home, runtimeAnchor: runtime, _birth: () => live ? record.birth : null });
  owner.createGateway = (_entry, options) => {
    assert.deepEqual(options, { interactionMode: 'none' });
    return { request: async (method, params, requestOptions) => { calls.push({ method, params }); if (failure) return failure(requestOptions); return status; }, close: async () => { if (cleanup) throw cleanup; } };
  };
  owner.ensure = () => { throw new Error('must not start'); };
  return { owner, record, path, calls, setLive: value => { live = value; }, setStatus: value => { status = value; }, setFailure: value => { failure = value; }, setCleanup: value => { cleanup = value; } };
}

test('teamId-only URL query preserves attribution, passive root validation, host scope and host-process lifetime', async t => {
  const f = await fixture(t), before = await readFile(f.path, 'utf8');
  const value = await f.owner.webUrl({ teamId: 'root' });
  assert.equal(value.url, entryUrl); assert.equal(value.scope, 'host');
  assert.equal(value.disclosure.teamPermalink, false); assert.equal(value.disclosure.launchTokenLifetime, 'host-process');
  assert.equal(value.disclosure.singleUse, false); assert.equal(value.disclosure.restartInvalidates, true);
  assert.equal(await readFile(f.path, 'utf8'), before);
  assert.deepEqual(f.calls, [{ method: 'status', params: { teamId: 'root' } }]);
  await writePrivate(f.path, { ...f.record, home: '/foreign' });
  await assert.rejects(f.owner.webUrl({ teamId: 'root' }), { code: 'OWNERSHIP_MISMATCH' });
  assert.equal(f.calls.length, 1);
});

test('missing, stopped, changed and member hosts fail closed before disclosure', async t => {
  const f = await fixture(t);
  await assert.rejects(f.owner.webUrl({}), { code: 'UNMANAGED_TEAM' });
  f.setStatus({ sessionId: 'other', team: { members: [{ id: 'child' }] } });
  await assert.rejects(f.owner.webUrl({ teamId: 'child' }), { code: 'UNMANAGED_TEAM' });
  f.owner.entry = { ...f.record, instanceId: 'old' };
  await assert.rejects(f.owner.webUrl({ teamId: 'root' }), { code: 'HOST_NOT_RUNNING' });
  f.owner.entry = undefined; f.setLive(false);
  await assert.rejects(f.owner.webUrl({ teamId: 'root' }), { code: 'HOST_NOT_RUNNING' });
});

test('credential-bearing transport, metadata and cleanup failures are statically sanitized through MCP', async t => {
  const f = await fixture(t);
  const dispatch = createDispatcher(f.owner);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  for (const code of ['AUTH_UNAVAILABLE', 'PROCESS_UNVERIFIABLE', 'UNEXPECTED']) {
    f.setFailure(() => { throw new ClientError(code, `synthetic unsafe ${entryUrl}`); });
    const result = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_web_url', arguments: { teamId: 'root' } } });
    assert.equal(result.result.isError, true); assert(!JSON.stringify(result).includes(token));
  }
  f.setFailure(undefined); f.setCleanup(new Error(entryUrl));
  await assert.rejects(f.owner.webUrl({ teamId: 'root' }), error => error.code === 'WEB_URL_UNAVAILABLE' && !error.message.includes(token));
  await writeFile(f.path, `{invalid ${entryUrl}`, { mode: 0o600 });
  await assert.rejects(f.owner.webUrl({ teamId: 'root' }), error => error.code === 'WEB_URL_UNAVAILABLE' && !error.message.includes(token));
});

test('pre-cancellation and in-flight cancellation never disclose the synthetic credential', async t => {
  const f = await fixture(t), pre = new AbortController(); pre.abort();
  await assert.rejects(f.owner.webUrl({ teamId: 'root' }, { signal: pre.signal }), { code: 'CANCELLED' });
  assert.equal(f.calls.length, 0);
  const entered = Promise.withResolvers();
  f.setFailure(({ signal }) => { entered.resolve(); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error(entryUrl)), { once: true })); });
  const current = new AbortController(), pending = f.owner.webUrl({ teamId: 'root' }, { signal: current.signal });
  await entered.promise; current.abort();
  await assert.rejects(pending, error => error.code === 'CANCELLED' && !error.message.includes(token));
});
