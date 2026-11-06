import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, access, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { OwnedHost } from '../../src/host/manager.mjs';
import { signedFixture } from '../fixtures/permission-context.mjs';
import { readPermissionContext } from '../../src/host/permissions.mjs';
import { tools } from '../../src/mcp/tools.mjs';

test('successful create and retry return a clean host homepage and Team ID without browser launch', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-create-link-')), marker = join(directory, 'opened');
  const originalPath = process.env.PATH, originalMarker = process.env.DSH_URL_TEST_MARKER;
  try {
    for (const command of ['open', 'xdg-open']) await writeFile(join(directory, command), '#!/bin/sh\n: > "$DSH_URL_TEST_MARKER"\nexit 99\n', { mode: 0o700 });
    process.env.PATH = directory + delimiter + originalPath; process.env.DSH_URL_TEST_MARKER = marker;
    const owner = new OwnedHost({});
    const signed = await signedFixture(t, owner);
    const context = await readPermissionContext(signed.config);
    owner.ensure = async () => {};
    owner.entry = { permissionBinding: context.bindingHash, url: 'http://user:password@127.0.0.1:12345/?token=launch-secret&sessionId=wrong#private' };
    const teamId = 'root-α'; let calls = 0;
    owner.gateway = { request: async method => { assert.equal(method, 'create'); return { teamId, sessionId: teamId, accepted: true, duplicate: calls++ > 0, permissions: { sandbox: { mode: 'workspace-write', workspaceRoot: '/synthetic/workspace' }, approvalPolicy: 'ask' } }; } };
    for (const duplicate of [false, true]) {
      const result = await owner.request('create', { key: 'same' });
      assert.equal(result.teamId, teamId); assert.equal(result.duplicate, duplicate);
      assert.deepEqual(result.web, { url: 'http://127.0.0.1:12345', scope: 'host' });
      assert.doesNotMatch(JSON.stringify(result), /launch-secret|password|token=|cookie|sessionId=wrong|#private/);
    }
    await assert.rejects(access(marker), { code: 'ENOENT' });
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    if (originalMarker === undefined) delete process.env.DSH_URL_TEST_MARKER; else process.env.DSH_URL_TEST_MARKER = originalMarker;
    await rm(directory, { recursive: true, force: true });
  }
});

test('installed contract requires the safe Web homepage label and Team ID after every create', async () => {
  const skill = await readFile(new URL('../../skills/dsh-agent-team/SKILL.md', import.meta.url), 'utf8');
  assert(skill.includes('After every successful Team create'));
  assert(skill.includes('web.scope=host')); assert(skill.includes('not a Team-specific page'));
  assert(skill.includes('Displaying the URL does not authorize opening a browser'));
  assert(tools.find(tool => tool.name === 'dsh_team_create').description.includes('present teamId and web.url'));
});
