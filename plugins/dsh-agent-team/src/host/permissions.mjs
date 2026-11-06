/** Permission facts come from a pinned supervisor signature, never Codex-looking env flags.
 * Signature verification authenticates the launcher's statement; it does not probe OS policy.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { readPrivate } from './files.mjs';
import { ClientError } from '../native/errors.mjs';
import { isDeepStrictEqual } from 'node:util';

const fail = (code = 'PERMISSION_CONTEXT_INVALID') => { throw new ClientError(code, 'A fresh permission context signed by the configured launch authority is required. Signature authenticity is separate from effective-limit verification. No work was submitted; see docs/permissions.md.'); };
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => names.includes(key));
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function normalizePermissions(value) {
  if (!keys(value, ['sandboxMode', 'approvalPolicy', 'writableRoots', 'networkAccess'])
    || !['read-only', 'workspace-write', 'danger-full-access'].includes(value.sandboxMode)
    || !['on-request', 'never'].includes(value.approvalPolicy)
    || !['enabled', 'restricted'].includes(value.networkAccess)
    || !Array.isArray(value.writableRoots) || value.writableRoots.length > 64
    || value.writableRoots.some(root => typeof root !== 'string' || !isAbsolute(root) || root.includes('\0'))
    || (value.sandboxMode === 'workspace-write' ? value.writableRoots.length === 0 : value.writableRoots.length !== 0)) fail();
  return { sandboxMode: value.sandboxMode, approvalPolicy: value.approvalPolicy === 'on-request' ? 'ask' : 'never', writableRoots: [...new Set(value.writableRoots)].sort(), networkAccess: value.networkAccess };
}
export async function readPermissionContext(config, now = Date.now()) {
  if (!config.permissionAuthority || !config.permissionContext) fail('PERMISSION_CONTEXT_REQUIRED');
  if (!isAbsolute(config.permissionAuthority) || !isAbsolute(config.permissionContext)) fail();
  try {
    // Both files use the existing non-symlink, current-owner, private-file guard.
    // The authority path is pinned in user-controlled launch argv, NOT an env value.
    const trust = await readPrivate(config.permissionAuthority);
    const envelope = await readPrivate(config.permissionContext);
    if (!keys(trust, ['version', 'publicKey']) || trust.version !== 1 || typeof trust.publicKey !== 'string'
      || !keys(envelope, ['payload', 'signature']) || typeof envelope.payload !== 'string' || envelope.payload.length > 65536
      || typeof envelope.signature !== 'string') fail();
    const publicKey = createPublicKey(trust.publicKey);
    if (publicKey.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(envelope.payload, 'utf8'), publicKey, Buffer.from(envelope.signature, 'base64'))) fail();
    const value = JSON.parse(envelope.payload);
    if (!keys(value, ['version', 'audience', 'basis', 'sessionId', 'issuedAt', 'expiresAt', 'boundaryId', 'permissions', 'overrides']) || value.version !== 1 || value.audience !== config.permissionAudience || typeof value.audience !== 'string'
      || ![value.sessionId, value.boundaryId].every(id => typeof id === 'string' && id.length > 0 && id.length <= 256)
      || !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt)
      || value.issuedAt > now || value.expiresAt <= now || value.expiresAt <= value.issuedAt || value.expiresAt - value.issuedAt > 86400000
      || !Array.isArray(value.overrides) || value.overrides.length > 32) fail();
    if (value.basis !== 'effective-runtime') fail('PERMISSION_CONTEXT_UNVERIFIED');
    const permissions = normalizePermissions(value.permissions);
    const overrides = value.overrides.map(grant => {
      if (!keys(grant, ['id', 'preset', 'permissions']) || ![grant.id, grant.preset].every(id => typeof id === 'string' && id.length > 0 && id.length <= 256)) fail();
      return { id: grant.id, preset: grant.preset, permissions: normalizePermissions(grant.permissions) };
    });
    if (new Set(overrides.map(grant => grant.id)).size !== overrides.length) fail();
    const authority = fingerprint(publicKey.export({ type: 'spki', format: 'pem' }));
    const binding = { authority, boundaryId: value.boundaryId, permissions };
    return { binding, bindingHash: fingerprint(binding), permissions, overrides,
      provenance: { source: 'launcher-attested', signatureVerified: true, osLimitsVerified: false, basis: 'effective-runtime', sessionId: value.sessionId, expiresAt: value.expiresAt } };
  } catch (error) {
    if (error instanceof ClientError && error.code.startsWith('PERMISSION_CONTEXT_')) throw error;
    fail();
  }
}
export function selectPermissions(context, params) {
  if (params.permissionPreset === undefined && params.permissionAuthorization === undefined) return context.permissions;
  const grant = context.overrides.find(item => item.id === params.permissionAuthorization && item.preset === params.permissionPreset);
  if (!grant) throw new ClientError('PERMISSION_AUTHORIZATION_REQUIRED', 'A preset override requires a matching explicit user grant in the signed launch context. No work was submitted.');
  if (grant.permissions.networkAccess !== context.permissions.networkAccess) throw new ClientError('PERMISSION_MISMATCH', 'An override cannot change the retained host network boundary. A new effective launch context is required.');
  return grant.permissions;
}
export function profileAuthorized(context, profile) {
  if (!profile || profile.binding !== context.bindingHash) return false;
  const { binding, ...permissions } = profile;
  const permitted = [context.permissions, ...context.overrides.filter(grant => grant.permissions.networkAccess === context.permissions.networkAccess).map(grant => grant.permissions)];
  return permitted.some(value => isDeepStrictEqual(value, permissions));
}
export function verifyHostBinding(entry, context, health) {
  if (entry.permissionBinding !== context.bindingHash || (health && health.host?.permissionBinding !== context.bindingHash)) {
    throw new ClientError('HOST_PERMISSION_MISMATCH', 'The retained host has a different or unknown launch boundary. It was not reused, restarted or stopped; use a separately initialized home or explicitly coordinate its shutdown.');
  }
}
export function verifyNativePermissions(actual, expected) {
  const roots = expected.sandboxMode === 'workspace-write' ? [...new Set([actual?.sandbox?.workspaceRoot, ...(actual?.sandbox?.additionalWritableRoots ?? [])])].sort() : [];
  if (actual?.sandbox?.mode !== expected.sandboxMode || actual?.approvalPolicy !== expected.approvalPolicy
    || !isDeepStrictEqual(roots, expected.writableRoots)) throw new ClientError('PERMISSION_MISMATCH', 'The native Team policy does not match the signed permission intent. Retain Team/create IDs; no fallback was attempted.');
}
