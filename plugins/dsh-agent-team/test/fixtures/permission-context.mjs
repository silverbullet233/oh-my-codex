import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writePrivate } from '../../src/host/files.mjs';
export async function signedFixture(t, owner, { cleanup = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'permission-signed-'));
  if (cleanup) t.after(() => rm(root, { recursive: true, force: true }));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const config = owner?.config ?? { permissionAudience: 'synthetic-process-audience' };
  Object.assign(config, { permissionAuthority: join(root, 'authority.json'), permissionContext: join(root, 'context.json') });
  await writePrivate(config.permissionAuthority, { version: 1, publicKey: publicKey.export({ type: 'spki', format: 'pem' }) });
  const payload = { version: 1, basis: 'effective-runtime', audience: config.permissionAudience, sessionId: 'synthetic-codex-session', issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60000, boundaryId: 'synthetic-outer-boundary', permissions: { sandboxMode: 'workspace-write', approvalPolicy: 'on-request', writableRoots: [config.home ?? '/synthetic/workspace'], networkAccess: 'enabled' }, overrides: [] };
  const write = async (value = payload, key = privateKey, path = config.permissionContext) => { const text = JSON.stringify(value); await writePrivate(path, { payload: text, signature: sign(null, Buffer.from(text), key).toString('base64') }); };
  await write();
  const issue = (audience, path) => write({ ...payload, audience }, privateKey, path);
  return { root, config, payload, write, issue };
}


/** Test supervisor signs ONLY temporary synthetic policy, after the child supplies its challenge. */
export function authorizeSyntheticMcp(child, path, issue) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const read = chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        if (message.type !== 'dsh-permission-challenge') continue;
        child.stderr.off('data', read);
        issue(message.audience, path).then(resolve, reject); return;
      }
    };
    child.stderr.on('data', read); child.once('error', reject);
    child.once('exit', () => reject(new Error('Synthetic MCP exited before permission handoff')));
  });
}
