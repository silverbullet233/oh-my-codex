import test from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeOwnedHome, OwnedHost } from '../../src/host/manager.mjs';
import { writePrivate } from '../../src/host/files.mjs';
import { loadRuntime } from '../../src/native/runtime.mjs';
import { WEB_URL_ACKNOWLEDGEMENT, authenticatedHostEntry, managedRootTeam, webUrlError } from '../../src/host/web-url.mjs';
import { createDispatcher } from '../../src/mcp/server.mjs';
import { GatewayClient } from '../../src/native/gateway.mjs';
import { ownedFixture } from '../fixtures/owned.mjs';
import { serveNativeFixture, contract } from '../fixtures/native-server.mjs';

const statusFor = (teamId) => ({
  teamId,
  sessionId: teamId,
  team: { id: teamId, members: [{ id: teamId, name: 'lead', role: 'lead', phase: 'ready' }, { id: 'synthetic-child', name: 'left', role: 'left', phase: 'ready' }] },
  members: [{ memberId: teamId, name: 'lead' }, { memberId: 'synthetic-child', name: 'left' }],
  runtimeState: 'idle',
  taskState: 'completed',
});
const tokenOf = (url) => new URL(url).searchParams.get('token');
const PID = process.pid;

/** Isolated owned home + synthetic authenticated native fixture; process birth is injected deterministically. */
async function syntheticHost(t, { dispatchStatus } = {}) {
  const base = await ownedFixture(t);
  const runtime = await loadRuntime(base.runtime);
  const home = await mkdtemp(join(tmpdir(), 'web-url-revalidate-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await initializeOwnedHome(home, home);
  const realHome = await realpath(home);
  const directory = join(realHome, '.codex-owned'); await mkdir(directory, { recursive: true, mode: 0o700 });
  // The synthetic official-Connection fixture reports the real running pid and this environment's
  // DSH_HOME/DSH_OWNED_INSTANCE_ID. Point them at the isolated owned home so the native health
  // handshake attributes the fixture exactly like the revalidated instance record.
  const priorHome = process.env.DSH_HOME, priorInstance = process.env.DSH_OWNED_INSTANCE_ID;
  process.env.DSH_HOME = realHome; process.env.DSH_OWNED_INSTANCE_ID = 'synthetic-instance-1';
  const calls = [];
  const state = { serverUrl: '' };
  const server = await serveNativeFixture({ health: contract, dispatch: async (method, params) => {
    calls.push({ method, params });
    if (method === 'health') return {};
    if (method === 'status') return dispatchStatus ? dispatchStatus(method, params, state) : statusFor(params.teamId);
    throw new Error(`unexpected synthetic method: ${method}`);
  } });
  state.serverUrl = server.url;
  const connects = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input, 'http://fixture.invalid');
    if (url.pathname === '/connect') connects.push(url.searchParams.get('interactions'));
    return originalFetch(input, init);
  };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await server.close();
    if (priorHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = priorHome;
    if (priorInstance === undefined) delete process.env.DSH_OWNED_INSTANCE_ID; else process.env.DSH_OWNED_INSTANCE_ID = priorInstance;
  });
  const births = new Map();
  const config = { home: realHome, runtimeAnchor: base.runtime, profile: 'web', startupTimeoutMs: 5000, _birth: pid => births.get(pid) ?? 'no-such-process' };
  const owner = new OwnedHost(config);
  const record = {
    version: 1, birthFormat: 'utc-c-v1', instanceId: 'synthetic-instance-1', pid: process.pid, birth: 'synthetic-birth-1',
    supervisorPid: process.pid + 1, supervisorBirth: 'synthetic-supervisor-birth', url: server.url,
    home: realHome, runtimeAnchor: runtime.anchor,
  };
  const writeRecord = async (value = record) => { await writePrivate(join(directory, 'instance.json'), value); if (value.birth) births.set(value.pid, value.birth); };
  const live = async () => { await writeRecord(); return { owner, record }; };
  return { base, runtime, server, calls, connects, home: realHome, directory, config, owner, record, births, writeRecord, live, state, origin: new URL(server.url).origin };
}

test('authenticated entry validation accepts only the supported loopback homepage URL and never echoes the token', () => {
  const valid = authenticatedHostEntry({ url: 'http://127.0.0.1:41234/?token=synthetic-only-token' });
  assert.equal(valid.url, 'http://127.0.0.1:41234/?token=synthetic-only-token');
  assert.equal(valid.origin, 'http://127.0.0.1:41234');
  for (const url of [
    'http://example.invalid/?token=synthetic-only-token',
    'https://127.0.0.1:41234/?token=synthetic-only-token',
    'http://127.0.0.1:41234/',
    'http://127.0.0.1:41234/?token=one&token=two',
    'http://127.0.0.1:41234/?token=',
    'http://user:pass@127.0.0.1:41234/?token=synthetic-only-token',
    'http://127.0.0.1:41234/team?token=synthetic-only-token',
    'http://127.0.0.1:41234/?token=synthetic-only-token#fragment',
    'not-a-url',
  ]) {
    assert.throws(() => authenticatedHostEntry({ url }), (error) => {
      assert.equal(['INVALID_HOST_ENTRY', 'HOST_NOT_RUNNING'].includes(error.code), true);
      assert(!error.message.includes('synthetic-only-token'), 'validation errors must not repeat the launch token');
      return true;
    });
  }
  assert.throws(() => authenticatedHostEntry(null), { code: 'HOST_NOT_RUNNING' });
  assert.throws(() => authenticatedHostEntry({}), { code: 'HOST_NOT_RUNNING' });
});

test('managed root validation accepts the root Session only and rejects member, unknown and malformed records without echoing IDs', () => {
  assert.equal(managedRootTeam(statusFor('managed-root'), 'managed-root').sessionId, 'managed-root');
  const cases = [
    [statusFor('managed-root'), 'synthetic-child', 'UNMANAGED_TEAM'],
    [statusFor('managed-root'), 'foreign-root', 'UNMANAGED_TEAM'],
    [{ sessionId: 'managed-root', teamId: 'managed-root', team: { members: [] } }, 'managed-root', 'UNMANAGED_TEAM'],
    [{ sessionId: 'managed-root' }, 'managed-root', 'UNMANAGED_TEAM'],
    [null, 'managed-root', 'UNMANAGED_TEAM'],
  ];
  for (const [status, teamId, code] of cases) {
    assert.throws(() => managedRootTeam(status, teamId), (error) => {
      assert.equal(error.code, code);
      assert(!error.message.includes('synthetic-child') && !error.message.includes('foreign-root'), 'validation errors must not repeat Team IDs');
      return true;
    });
  }
});

test('web URL query revalidates attribution on every disclosure and returns the verbatim URL without side effects', async t => {
  const host = await syntheticHost(t);
  await host.live();
  const before = (await readdir(host.directory)).sort();
  const instanceBefore = await readFile(join(host.directory, 'instance.json'), 'utf8');
  const assertNoStart = async () => {
    assert.equal(host.owner.starting, undefined);
    await assert.rejects(access(join(host.home, 'starts')), { code: 'ENOENT' });
  };

  const result = await host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT });
  assert.equal(result.teamId, 'managed-root');
  assert.equal(result.scope, 'host');
  assert.equal(result.origin, host.origin);
  assert(new URL(result.url).origin === host.origin, 'disclosed URL must stay on the owned loopback origin');
  assert(tokenOf(result.url) === tokenOf(host.server.url) && tokenOf(result.url), 'disclosed URL must be the exact attributed entry URL');
  assert.deepEqual(result.disclosure, {
    bearerCredential: true,
    mayAppearInClientHistory: true,
    hostProcessScoped: true,
    teamScoped: false,
    teamPermalink: false,
    reusableWhileHostRunning: true,
    singleUse: false,
    grantsOwnerAccessToAllHostTeams: true,
    launchTokenLifetime: 'host-process',
    launchTokenExpiresWithHostProcess: true,
    restartInvalidates: true,
    cookieDefaultLifetimeDays: 30,
    cookieLifetimeNote: 'Upstream default cookieMaxAgeDays is 30 (configurable >= 1), authority-bound with absolute, non-sliding expiry; the actual configured value of this instance is not read by this query.',
    revocation: 'No logout API. Deleting or replacing the client-connection/browser-session credential record revokes cookies at the next Connection activation; clearing a cookie ends only that browser session.',
    discovery: 'Startup, health, status, result, create and logs never include this URL or its token; only an explicitly acknowledged dsh_team_web_url call returns it.',
    scopeNote: 'Owned-host homepage root. Upstream 0.2.2-alpha.3 exposes no Team or Session permalink; selecting a Team in Web remains in-app client state.',
  });
  assert.deepEqual(host.calls.map(call => call.method), ['health', 'status']);
  assert.equal(JSON.stringify(host.calls).includes(tokenOf(host.server.url)), false, 'native calls must not carry the launch token in their payloads');
  assert.deepEqual(host.connects, ['none'], 'the disclosure connection must be passive (interactions=none)');
  assert.deepEqual((await readdir(host.directory)).sort(), before, 'the query must not create or remove owned state files');
  assert.equal(await readFile(join(host.directory, 'instance.json'), 'utf8'), instanceBefore, 'the attributed record must stay unchanged');
  await assertNoStart();

  // A matching cached foreground entry is accepted only after the same revalidation.
  host.owner.entry = { ...host.record };
  const cached = await host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT });
  assert(tokenOf(cached.url) === tokenOf(host.server.url));
  assert.deepEqual(host.connects, ['none', 'none']);
  await assertNoStart();
});

test('web URL query refuses stopped, replaced and PID-reused hosts without disclosing or starting anything', async t => {
  const host = await syntheticHost(t);
  const expectRefused = async (token) => {
    await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => {
      assert.equal(error.code, 'HOST_NOT_RUNNING');
      if (token) assert(!error.message.includes(token), 'errors must not repeat the launch token');
      return true;
    });
    assert.equal(host.owner.starting, undefined);
    assert.equal(host.calls.length, 0, 'no native request may run for an unverified attribution');
    assert.equal(host.connects.length, 0, 'no native connection may be opened for an unverified attribution');
    await assert.rejects(access(join(host.home, 'starts')), { code: 'ENOENT' });
  };

  // Stopped host: cached foreground entry but the instance record is gone.
  await host.live();
  host.owner.entry = { ...host.record };
  await rm(join(host.directory, 'instance.json'));
  await expectRefused(tokenOf(host.record.url));

  // Replaced instance: the record has a new pid/instanceId/token while the foreground cache is old.
  await host.writeRecord({ ...host.record, instanceId: 'synthetic-instance-2', pid: PID + 10, birth: 'synthetic-birth-2', url: 'http://127.0.0.1:1/?token=synthetic-replacement-token' });
  host.owner.entry = { ...host.record };
  await expectRefused(tokenOf(host.record.url));

  // PID reused: same pid but a different process birth invalidates the old capability.
  await host.writeRecord({ ...host.record, birth: 'synthetic-birth-3' });
  host.owner.entry = { ...host.record };
  await expectRefused(tokenOf(host.record.url));

  // Stale record with no cached entry: current() attribution cleanup refuses and never discloses.
  host.owner.entry = undefined;
  host.births.set(PID, 'different-current-birth');
  await writePrivate(join(host.directory, 'instance.json'), { ...host.record, birth: 'synthetic-birth-1' });
  await expectRefused(tokenOf(host.server.url));
  await assert.rejects(access(join(host.directory, 'instance.json')), { code: 'ENOENT' });
});

test('web URL query fails closed on foreign homes, changed runtime anchors and unowned homes', async t => {
  const host = await syntheticHost(t);
  const marker = join(host.home, '.codex-dsh-owner.json');
  await host.live();

  await writePrivate(join(host.directory, 'instance.json'), { ...host.record, home: '/synthetic/foreign/home' });
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), { code: 'OWNERSHIP_MISMATCH' });
  assert.equal(host.calls.length, 0);

  await writePrivate(join(host.directory, 'instance.json'), { ...host.record, runtimeAnchor: '/synthetic/other/runtime/package.json' });
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), { code: 'OWNERSHIP_MISMATCH' });
  assert.equal(host.calls.length, 0);

  await rm(marker);
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), { code: 'SETUP_REQUIRED' });
  assert.equal(host.calls.length, 0);
});

test('web URL query refuses member, unknown and foreign Team identities after authenticated host validation', async t => {
  const host = await syntheticHost(t, { dispatchStatus: async () => { const error = new Error('The role service did not create the requested Team.'); error.code = 'team-roles/UNKNOWN_TEAM'; throw error; } });
  await host.live();
  await assert.rejects(host.owner.webUrl({ teamId: 'synthetic-child', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => error.code === 'UNMANAGED_TEAM' && !error.message.includes(tokenOf(host.server.url)));
  assert.deepEqual(host.calls.map(call => call.method), ['health', 'status']);
  assert.deepEqual(host.connects, ['none']);
});

test('web URL query fails closed on non-loopback entries and on an unreachable attributed host', async t => {
  const host = await syntheticHost(t);
  await host.live();
  await writePrivate(join(host.directory, 'instance.json'), { ...host.record, url: 'http://example.invalid:41234/?token=synthetic-only-token' });
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => error.code === 'INVALID_HOST_ENTRY' && !error.message.includes('synthetic-only-token'));
  assert.equal(host.calls.length, 0);
  assert.equal(host.connects.length, 0, 'an invalid entry must not be contacted');

  const unreachable = await syntheticHost(t);
  await unreachable.live();
  await unreachable.server.close();
  await assert.rejects(unreachable.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), { code: 'HOST_NOT_RUNNING' });
});

test('web URL query requires the schema-level user acknowledgement before any host access', async t => {
  const host = await syntheticHost(t);
  await host.live();
  for (const acknowledge of [undefined, true, 'yes', 'reveal']) {
    await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge }), { code: 'ACKNOWLEDGEMENT_REQUIRED' });
  }
  await assert.rejects(host.owner.webUrl({ acknowledge: WEB_URL_ACKNOWLEDGEMENT }), { code: 'UNMANAGED_TEAM' });
  assert.equal(host.calls.length, 0);
  assert.equal(host.connects.length, 0);
});

test('unexpected status/transport errors are sanitized so the credential-bearing entry never reaches errors or MCP responses', async t => {
  const leak = { serverUrl: '' };
  const host = await syntheticHost(t, { dispatchStatus: async (_method, _params, state) => {
    leak.serverUrl = state.serverUrl;
    const error = new Error(`unexpected native failure while reading ${state.serverUrl}`);
    error.code = 'team-roles/INTERNAL_FAILURE';
    throw error;
  } });
  await host.live();
  const token = tokenOf(host.server.url);
  const assertSanitized = (text) => {
    assert(!text.includes(token), 'sanitized error must not contain the launch token');
    assert(!text.includes(new URL(host.server.url).origin), 'sanitized error must not contain the authenticated origin');
  };

  // Direct bridge call: known-safe mapping is not weakened, unexpected failures are generic.
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => {
    assert.equal(error.code, 'WEB_URL_UNAVAILABLE');
    assertSanitized(error.message);
    return true;
  });

  // MCP end-to-end: the client-facing error, content text and structured payload stay clean.
  const dispatch = createDispatcher(host.owner);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_web_url', arguments: { teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT } } });
  assert.equal(response.result.isError, true);
  const serialized = JSON.stringify(response);
  assertSanitized(serialized);
  assert.equal(JSON.parse(response.result.content[0].text).code, 'WEB_URL_UNAVAILABLE');

  // Sanitizer contract: actionable known codes keep their exact mapping, everything else is generic.
  const { ClientError } = await import('../../src/native/errors.mjs');
  for (const [code, mapped] of [['team-roles/UNKNOWN_TEAM', 'UNMANAGED_TEAM'], ['UNKNOWN_TEAM', 'UNMANAGED_TEAM'], ['AUTH_UNAVAILABLE', 'HOST_NOT_RUNNING'], ['GATEWAY_UNAVAILABLE', 'HOST_NOT_RUNNING'], ['INVALID_HOST_ENTRY', 'INVALID_HOST_ENTRY'], ['CANCELLED', 'CANCELLED']]) {
    assert.equal(webUrlError(new ClientError(code, `leak ${host.server.url}`)).code, mapped);
  }
  for (const error of [new Error(`leak ${host.server.url}`), new ClientError('team-roles/INTERNAL_FAILURE', `leak ${host.server.url}`), new ClientError('INTERACTION_DISABLED', `leak ${host.server.url}`)]) {
    const mapped = webUrlError(error);
    assert.equal(mapped.code, 'WEB_URL_UNAVAILABLE');
    assertSanitized(mapped.message);
  }
});

test('web URL query propagates cancellation promptly as a token-free CANCELLED error', async t => {
  const host = await syntheticHost(t);
  await host.live();
  const token = tokenOf(host.server.url);
  const pre = new AbortController(); pre.abort(new Error(`cancelled near ${host.server.url}`));
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }, { signal: pre.signal }), (error) => {
    assert.equal(error.code, 'CANCELLED');
    assert(!error.message.includes(token));
    return true;
  });
  assert.equal(host.calls.length, 0, 'a pre-cancelled query must not reach the native host');
  assert.equal(host.connects.length, 0);

  const started = Promise.withResolvers();
  const host2 = await syntheticHost(t, { dispatchStatus: async (_method, params) => { started.resolve(); await new Promise(() => {}); return statusFor(params.teamId); } });
  await host2.live();
  const controller = new AbortController();
  const pending = host2.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }, { signal: controller.signal });
  await started.promise;
  controller.abort(new Error(`mid-flight cancel ${host2.server.url}`));
  await assert.rejects(pending, (error) => {
    assert.equal(error.code, 'CANCELLED');
    assert(!error.message.includes(tokenOf(host2.server.url)));
    return true;
  });
});

test('cleanup/disposal failures are token-free and never override actionable errors or fake success', async t => {
  const host = await syntheticHost(t);
  await host.live();
  const token = tokenOf(host.server.url);
  const leaky = new Error(`dispose failed near ${host.server.url}`);
  const originalClose = GatewayClient.prototype.close;
  const assertClean = (error) => {
    assert(!error.message.includes(token), 'cleanup failure must not surface the launch token');
    assert(!error.message.includes(host.server.url), 'cleanup failure must not surface the authenticated URL');
    return true;
  };
  try {
    // Successful native read but failing disposal: fail closed, never disclose, never leak.
    GatewayClient.prototype.close = async () => { throw leaky; };
    await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => {
      assert.equal(error.code, 'WEB_URL_UNAVAILABLE');
      assert(error.message.includes('did not finish safely'));
      return assertClean(error);
    });
    const dispatch = createDispatcher(host.owner);
    await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_web_url', arguments: { teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT } } });
    assert.equal(response.result.isError, true);
    assert(!JSON.stringify(response).includes(token));
    assert.equal(JSON.parse(response.result.content[0].text).code, 'WEB_URL_UNAVAILABLE');
  } finally { GatewayClient.prototype.close = originalClose; }

  // Primary sanitized failure keeps its static generic mapping even when disposal also fails.
  const leak2 = { serverUrl: '' };
  const host2 = await syntheticHost(t, { dispatchStatus: async (_method, _params, state) => { leak2.serverUrl = state.serverUrl; throw new Error(`native leak ${state.serverUrl}`); } });
  await host2.live();
  try {
    GatewayClient.prototype.close = async () => { throw new Error(`dispose leak ${host2.server.url}`); };
    await assert.rejects(host2.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => {
      assert.equal(error.code, 'WEB_URL_UNAVAILABLE');
      assert(!error.message.includes('did not finish safely'), 'cleanup must not override the primary failure mapping');
      assert(!error.message.includes(tokenOf(host2.server.url)));
      return true;
    });
  } finally { GatewayClient.prototype.close = originalClose; }

  // Actionable primary codes stay actionable (static message) even when disposal fails.
  const host3 = await syntheticHost(t, { dispatchStatus: async () => { const error = new Error('synthetic unknown managed team'); error.code = 'team-roles/UNKNOWN_TEAM'; throw error; } });
  await host3.live();
  try {
    GatewayClient.prototype.close = async () => { throw new Error(`dispose leak ${host3.server.url}`); };
    await assert.rejects(host3.owner.webUrl({ teamId: 'member-session', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => {
      assert.equal(error.code, 'UNMANAGED_TEAM');
      assert(!error.message.includes(tokenOf(host3.server.url)));
      return true;
    });
  } finally { GatewayClient.prototype.close = originalClose; }
});

test('known sanitizer codes are reconstructed with static token-free messages', async t => {
  const host = await syntheticHost(t);
  const leak = `upstream detail ${host.server.url} token=${tokenOf(host.server.url)}`;
  const cases = [
    ['ACKNOWLEDGEMENT_REQUIRED', 'ACKNOWLEDGEMENT_REQUIRED'],
    ['HOST_NOT_RUNNING', 'HOST_NOT_RUNNING'],
    ['INVALID_HOST_ENTRY', 'INVALID_HOST_ENTRY'],
    ['OWNERSHIP_MISMATCH', 'OWNERSHIP_MISMATCH'],
    ['RUNTIME_MISMATCH', 'RUNTIME_MISMATCH'],
    ['RUNTIME_REQUIRED', 'RUNTIME_REQUIRED'],
    ['SETUP_REQUIRED', 'SETUP_REQUIRED'],
    ['UNMANAGED_TEAM', 'UNMANAGED_TEAM'],
    ['CANCELLED', 'CANCELLED'],
    ['AUTH_UNAVAILABLE', 'HOST_NOT_RUNNING'],
    ['GATEWAY_UNAVAILABLE', 'HOST_NOT_RUNNING'],
    ['team-roles/UNKNOWN_TEAM', 'UNMANAGED_TEAM'],
    ['UNKNOWN_TEAM', 'UNMANAGED_TEAM'],
  ];
  const { ClientError } = await import('../../src/native/errors.mjs');
  for (const [code, expected] of cases) {
    const mapped = webUrlError(new ClientError(code, leak));
    assert.equal(mapped.code, expected);
    assert(!mapped.message.includes(tokenOf(host.server.url)) && !mapped.message.includes(host.server.url), `${code} must not pass through upstream text`);
  }
  for (const error of [new Error(leak), new ClientError('team-roles/INTERNAL_FAILURE', leak), new ClientError('INTERACTION_DISABLED', leak)]) {
    assert.equal(webUrlError(error).code, 'WEB_URL_UNAVAILABLE');
    assert(!webUrlError(error).message.includes(tokenOf(host.server.url)));
  }
});

test('malformed or unsafe credential-bearing metadata is sanitized and fails closed on every exit', async t => {
  const host = await syntheticHost(t);
  await host.live();
  const token = 'synthetic-malformed-metadata-token';
  const raw = `{"url":"http://127.0.0.1:9999/?token=${token}","home":`;
  const instance = join(host.directory, 'instance.json');
  await writeFile(instance, raw);
  await chmod(instance, 0o600);
  const assertClean = (text) => {
    assert(!text.includes(token), 'raw malformed metadata must not surface the synthetic token');
    assert(!text.includes('127.0.0.1:9999'), 'raw malformed metadata must not surface the authenticated URL');
    assert(!/Unexpected token|is not valid JSON|in JSON at position/i.test(text), 'raw parse/IO text must not reach the caller: ' + text);
    return true;
  };
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => {
    assert.equal(error.code, 'WEB_URL_UNAVAILABLE');
    return assertClean(error.message);
  });
  const dispatch = createDispatcher(host.owner);
  await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const response = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dsh_team_web_url', arguments: { teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT } } });
  assert.equal(response.result.isError, true);
  assertClean(JSON.stringify(response));

  // Unsafe (group-readable) private metadata is a static UNSAFE_STATE failure.
  await writeFile(instance, JSON.stringify({ ...host.record, url: `http://127.0.0.1:1/?token=${token}` }));
  await chmod(instance, 0o644);
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => {
    assert.equal(error.code, 'UNSAFE_STATE');
    return assertClean(`${error.code} ${error.message}`);
  });

  // Malformed owned-home marker text is likewise static and token-free.
  const marker = join(host.home, '.codex-dsh-owner.json');
  await writeFile(marker, `not-json ${token} ${host.server.url}`);
  await chmod(marker, 0o600);
  await assert.rejects(host.owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => {
    assert.equal(error.code, 'WEB_URL_UNAVAILABLE');
    return assertClean(error.message);
  });
});
