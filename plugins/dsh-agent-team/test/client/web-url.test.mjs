import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { OwnedHost } from '../../src/host/manager.mjs';
import { loadRuntime } from '../../src/native/runtime.mjs';
import { WEB_URL_ACKNOWLEDGEMENT, authenticatedHostEntry, managedRootTeam } from '../../src/host/web-url.mjs';
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
const secretToken = (url) => new URL(url).searchParams.get('token');

async function syntheticHost(t, dispatchStatus = async (_method, params) => statusFor(params.teamId)) {
  const owned = await ownedFixture(t);
  const calls = [];
  const server = await serveNativeFixture({ health: contract, dispatch: async (method, params) => {
    calls.push({ method, params });
    if (method === 'health') return {};
    if (method === 'status') return dispatchStatus(method, params);
    throw new Error(`unexpected synthetic method: ${method}`);
  } });
  t.after(() => server.close());
  const runtime = await loadRuntime(owned.runtime);
  // Synthetic attributed entry for the fixture host: pid/instanceId are those the fixture reports.
  const entry = { version: 1, birthFormat: 'utc-c-v1', instanceId: null, url: server.url, pid: process.pid, birth: 'synthetic-birth', supervisorPid: process.pid, supervisorBirth: 'synthetic-birth' };
  const live = () => { owned.owner.runtime = runtime; owned.owner.entry = entry; return owned.owner; };
  return { owned, calls, server, runtime, entry, live, origin: new URL(server.url).origin };
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

test('web URL query returns the existing authenticated URL verbatim with honest disclosure and no side effects', async t => {
  const host = await syntheticHost(t);
  const owner = host.live();
  const result = await owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT });
  assert.equal(result.teamId, 'managed-root');
  assert.equal(result.scope, 'host');
  assert.equal(result.origin, host.origin);
  assert(new URL(result.url).origin === host.origin, 'disclosed URL must stay on the owned loopback origin');
  assert(secretToken(result.url) === secretToken(host.server.url) && secretToken(result.url), 'disclosed URL must be the exact host entry URL');
  assert.deepEqual(result.disclosure, {
    bearerCredential: true,
    mayAppearInClientHistory: true,
    hostProcessScoped: true,
    teamScoped: false,
    teamPermalink: false,
    reusableWhileHostRunning: true,
    singleUse: false,
    grantsOwnerAccessToAllHostTeams: true,
    expiresWhenHostStops: true,
    restartInvalidates: true,
    cookieAbsoluteLifetimeDays: 30,
    cookieLifetimeNote: 'Upstream default cookieMaxAgeDays is 30 (configurable >= 1) with absolute, non-sliding expiry.',
    revocation: 'No logout API. Deleting or replacing the client-connection/browser-session credential record revokes cookies at the next Connection activation; clearing a cookie ends only that browser session.',
    discovery: 'Startup, health, status, result, create and logs never include this URL or its token; only an explicitly acknowledged dsh_team_web_url call returns it.',
    scopeNote: 'Owned-host homepage root. Upstream 0.2.2-alpha.3 exposes no Team or Session permalink; selecting a Team in Web remains in-app client state.',
  });
  assert.deepEqual(host.calls.map(call => call.method), ['health', 'status']);
  assert.equal(host.calls.filter(call => call.method === 'status').length, 1);
  assert.equal(JSON.stringify(host.calls).includes(secretToken(host.server.url)), false, 'native calls must not carry the launch token in their payloads');
  // The query never starts the host, opens a browser or creates owned state directories.
  assert.equal(owner.starting, undefined);
  await assert.rejects(access(join(host.owned.home, '.codex-owned')), { code: 'ENOENT' });
});

test('web URL query refuses member, unknown and foreign Team identities after authenticated host validation', async t => {
  const host = await syntheticHost(t, async () => { const error = new Error('The role service did not create the requested Team.'); error.code = 'team-roles/UNKNOWN_TEAM'; throw error; });
  const owner = host.live();
  await assert.rejects(owner.webUrl({ teamId: 'synthetic-child', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => error.code === 'UNMANAGED_TEAM' && !error.message.includes(secretToken(host.server.url)));
  assert.deepEqual(host.calls.map(call => call.method), ['health', 'status']);
});

test('web URL query never starts, adopts or restarts a missing owned host', async t => {
  const host = await syntheticHost(t);
  const fresh = new OwnedHost({ ...host.owned.config });
  await assert.rejects(fresh.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), { code: 'HOST_NOT_RUNNING' });
  assert.equal(host.calls.length, 0, 'a missing owned host must not be contacted or started');
  assert.equal(fresh.starting, undefined);
  await assert.rejects(access(join(host.owned.home, '.codex-owned')), { code: 'ENOENT' });
  assert.equal(fresh.runtime !== undefined, true, 'inspection may load the configured runtime but must not create host state');
});

test('web URL query fails closed on non-loopback entries and on an unreachable attributed host', async t => {
  const host = await syntheticHost(t);
  const owner = host.live();
  owner.entry = { ...host.entry, url: 'http://example.invalid:41234/?token=synthetic-only-token' };
  await assert.rejects(owner.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => error.code === 'INVALID_HOST_ENTRY' && !error.message.includes('synthetic-only-token'));
  assert.equal(host.calls.length, 0, 'an invalid entry must not be contacted');

  const unreachable = await syntheticHost(t);
  const owner2 = unreachable.live();
  await unreachable.server.close();
  await assert.rejects(owner2.webUrl({ teamId: 'managed-root', acknowledge: WEB_URL_ACKNOWLEDGEMENT }), (error) => error.code === 'HOST_NOT_RUNNING');
});

test('web URL query requires the schema-level user acknowledgement before any host access', async t => {
  const host = await syntheticHost(t);
  const owner = host.live();
  for (const acknowledge of [undefined, true, 'yes', 'reveal']) {
    await assert.rejects(owner.webUrl({ teamId: 'managed-root', acknowledge }), { code: 'ACKNOWLEDGEMENT_REQUIRED' });
  }
  await assert.rejects(owner.webUrl({ acknowledge: WEB_URL_ACKNOWLEDGEMENT }), { code: 'UNMANAGED_TEAM' });
  assert.equal(host.calls.length, 0);
});
