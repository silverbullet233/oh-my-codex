/** Keep native intent, signed statements and opaque protocol state distinct.
 * Neither a declaration nor a signature is an independent OS-policy probe. */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
export async function readPermissionContext(config, now = Date.now(), metadata) {
  // Configured strict mode is never weakened by a missing file, invalid signature
  // or incoming metadata. An environment context path alone also opts into strict mode.
  const strict = config.permissionAuthority !== undefined || config.permissionContext !== undefined;
  const attested = strict ? await readAttestedContext(config, now) : null;
  const opaque = sandboxContext(metadata, config);
  if (opaque) {
    if (attested || config.permissionProfile !== undefined) throw new ClientError('PERMISSION_CONTEXT_CONFLICT', 'Sandbox metadata cannot be combined with a separate permission profile or strict attestation. No work was submitted.');
    return opaque;
  }
  if (attested) return attested;
  if (config.permissionProfile === undefined) return fullAccessFallback(config, 'sandbox-metadata-unavailable');
  let permissions;
  const source = 'explicit-configuration';
  if (config.permissionProfile !== undefined) {
    try {
      if (!isAbsolute(config.permissionProfile)) fail();
      const value = await readPrivate(config.permissionProfile);
      if (!keys(value, ['sandboxMode', 'approvalPolicy', 'writableRoots', 'networkAccess']) || !['ask', 'never'].includes(value.approvalPolicy)) fail();
      const native = normalizePermissions({ ...value, approvalPolicy: value.approvalPolicy === 'ask' ? 'on-request' : 'never', networkAccess: value.networkAccess === 'unknown' ? 'enabled' : value.networkAccess });
      permissions = { ...native, networkAccess: value.networkAccess };
    } catch { throw new ClientError('PERMISSION_CONFIGURATION_INVALID', 'The explicitly configured private permission profile is invalid. No default fallback was attempted.'); }
  }
  const binding = { source, cwd: resolve(config.cwd ?? process.cwd()), backend: 'native', permissions };
  return { binding, bindingHash: fingerprint(binding), permissions, overrides: [],
    execution: { backend: 'native', filesystem: 'native-policy', network: 'unverified', approval: 'native-policy' },
    provenance: { source, codexSandbox: 'unknown', codexApproval: 'unknown', codexNetwork: 'unknown', signatureVerified: false, osLimitsVerified: false } };
}
/** Product default when no supported inheritance channel exists. The native
 * tuple grants no OS privileges and makes no claim about Codex or networking. */
function fullAccessFallback(config, reason, unavailableSandbox) {
  const source = 'full-access-fallback';
  const permissions = { sandboxMode: 'danger-full-access', approvalPolicy: 'never', writableRoots: [], networkAccess: 'unknown' };
  const binding = { source, fallbackReason: reason, cwd: resolve(config.cwd ?? process.cwd()), backend: 'native', permissions,
    ...(unavailableSandbox ? { unavailableSandbox } : {}) };
  return { binding, bindingHash: fingerprint(binding), permissions, overrides: [],
    execution: { backend: 'native', source, fallbackReason: reason, filesystem: 'native-policy', network: 'unverified', approval: 'native-policy' },
    provenance: { source, fallbackReason: reason, inheritance: 'unavailable', codexSandbox: 'unknown', codexApproval: 'unknown', codexNetwork: 'unknown',
      signatureVerified: false, osLimitsVerified: false,
      limitations: ['Codex permission inheritance is unavailable; full access is a DSH native policy default.', 'Network access is unknown; outer process and OS restrictions still apply.'] } };
}
async function readAttestedContext(config, now) {
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
    const binding = { authority, boundaryId: value.boundaryId, permissions, source: 'launcher-attested', backend: 'native', cwd: resolve(config.cwd ?? process.cwd()) };
    return { binding, bindingHash: fingerprint(binding), permissions, overrides,
      provenance: { source: 'launcher-attested', signatureVerified: true, osLimitsVerified: false, basis: 'effective-runtime', sessionId: value.sessionId, expiresAt: value.expiresAt } };
  } catch (error) {
    if (error instanceof ClientError && error.code.startsWith('PERMISSION_CONTEXT_')) throw error;
    fail();
  }
}

/** Only tools/call protocol metadata reaches this function, never tool arguments.
 * Keep the state opaque; inspecting the profile discriminator is solely an
 * unsupported-boundary check, never a projection of filesystem grants.
 */
export function sandboxContext(metadata, config = {}) {
  if (metadata === undefined) return null;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new ClientError('SANDBOX_METADATA_INVALID', 'Invalid sandbox protocol metadata.');
  const launcherMeta = metadata['codex/sandbox-launcher'];
  const launcher = launcherMeta?.codexExecutable;
  if (launcherMeta !== undefined && (!launcherMeta || typeof launcherMeta !== 'object' || Array.isArray(launcherMeta)
    || typeof launcher !== 'string' || !isAbsolute(launcher) || launcher.includes('\0'))) throw new ClientError('SANDBOX_LAUNCHER_INVALID', 'The protocol sandbox launcher must be an absolute executable path.');
  const current = metadata['codex/sandbox-state'], legacy = metadata['codex/sandbox-state-meta'];
  if (current === undefined && legacy === undefined) return null;
  if (current !== undefined && legacy !== undefined && !isDeepStrictEqual(current, legacy)) throw new ClientError('SANDBOX_METADATA_CONFLICT', 'Conflicting sandbox state aliases. No work was submitted.');
  const state = current !== undefined ? current : legacy;
  let stateJson, cwd;
  try {
    if (!state || typeof state !== 'object' || Array.isArray(state)
      || !state.permissionProfile || typeof state.permissionProfile !== 'object' || Array.isArray(state.permissionProfile)
      || typeof state.permissionProfile.type !== 'string' || !state.permissionProfile.type.length || state.permissionProfile.type.length > 128) throw new Error();
    stateJson = JSON.stringify(state);
    if (Buffer.byteLength(stateJson) > 65536) throw new Error();
    cwd = fileURLToPath(state.sandboxCwd);
    if (!isAbsolute(cwd) || cwd.includes('\0')) throw new Error();
  } catch { throw new ClientError('SANDBOX_METADATA_INVALID', 'Sandbox state must be an opaque JSON object with a native file cwd.'); }
  const supported = ['managed', 'disabled'].includes(state.permissionProfile.type);
  // Capability absence is the only protocol fallback. Never catch an executor,
  // identity, configuration or OS refusal and retry it with this broader policy.
  if (!supported || !launcher) return fullAccessFallback({ ...config, cwd }, !supported ? 'sandbox-state-unsupported' : 'sandbox-launcher-unavailable', { stateJson, launcher: launcher ?? null });
  const permissions = { sandboxMode: 'danger-full-access', approvalPolicy: 'ask', writableRoots: [], networkAccess: 'unknown' };
  const binding = { source: 'codex-request-metadata', cwd, backend: 'codex-sandbox-host-v1', stateJson, launcher: launcher ?? null, permissions };
  return { binding, bindingHash: fingerprint(binding), permissions, overrides: [],
    sandbox: { stateJson, launcher, supported },
    execution: { backend: binding.backend, scope: 'entire-native-host', filesystem: 'launcher-required', network: 'opaque-state-only', approval: 'native-ask', supported, launcherAvailable: !!launcher },
    provenance: { source: binding.source, codexSandbox: 'opaque', codexApproval: 'unknown', codexNetwork: 'partial-opaque-state', signatureVerified: false, osLimitsVerified: false } };
}

export function requireExecutableContext(context) {
  if (context.sandbox && !context.sandbox.supported) throw new ClientError('SANDBOX_STATE_UNSUPPORTED', 'External or unsupported sandbox state cannot be recreated locally. Observation remains available; no work was submitted.');
  if (context.sandbox && !context.sandbox.launcher) throw new ClientError('SANDBOX_LAUNCHER_UNAVAILABLE', 'The caller supplied sandbox state without a supported local launcher. No PATH lookup or native fallback was attempted.');
  if (!context.sandbox && context.permissions.networkAccess === 'restricted') throw new ClientError('NETWORK_ENFORCEMENT_UNAVAILABLE', 'Native DSH cannot enforce the requested restricted user-tool network. No work was submitted.');
}

/** Exact argv, no shell interpolation, extra readable roots or network exceptions. */
export function sandboxInvocation(context, command) {
  requireExecutableContext(context);
  if (!context.sandbox) return { executable: command[0], argv: command.slice(1) };
  return { executable: context.sandbox.launcher, argv: ['sandbox', '--sandbox-state-json', context.sandbox.stateJson, '--', ...command] };
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
  if (entry.permissionBinding !== context.bindingHash || (health && health.host?.permissionBinding !== context.bindingHash)
    || (context.execution && (!isDeepStrictEqual(entry.permissionExecution, context.execution) || (health && !isDeepStrictEqual(health.host?.permissionExecution, context.execution))))) {
    throw new ClientError('HOST_PERMISSION_MISMATCH', 'The retained host has a different or unknown launch boundary. It was not reused, restarted or stopped; use a separately initialized home or explicitly coordinate its shutdown.');
  }
}
export function verifyNativePermissions(actual, expected) {
  const roots = expected.sandboxMode === 'workspace-write' ? [...new Set([actual?.sandbox?.workspaceRoot, ...(actual?.sandbox?.additionalWritableRoots ?? [])])].sort() : [];
  if (actual?.sandbox?.mode !== expected.sandboxMode || actual?.approvalPolicy !== expected.approvalPolicy
    || !isDeepStrictEqual(roots, expected.writableRoots)) throw new ClientError('PERMISSION_MISMATCH', 'The native Team policy does not match the signed permission intent. Retain Team/create IDs; no fallback was attempted.');
}
