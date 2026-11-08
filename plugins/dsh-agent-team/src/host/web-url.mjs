/** Guarded disclosure of the owned host's authenticated Web URL.
 *
 * The owned host's `entry.url` is the exact URL the official CLI printed for this
 * process: `http://127.0.0.1:<port>/?token=<per-process-random-token>`. It is the
 * host homepage root, not a Team/Session permalink (upstream 0.2.2-alpha.3 has
 * none). Disclosure is intentionally explicit and is validated without minting,
 * re-encoding or extending the token. Everything here is pure: no I/O, no host
 * start, no browser, no Team operation.
 */
import { ClientError } from '../native/errors.mjs';

export const WEB_URL_SCOPE = 'host';

/**
 * Honest upstream semantics of the disclosed URL (see observations/review/v3-native-web-auth.md,
 * evidence from the installed official 0.2.2-alpha.3 bytes).
 */
export const WEB_URL_DISCLOSURE = Object.freeze({
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
  discovery: 'Startup, health, status, result, create and logs never include this URL or its token; only an explicitly requested dsh_team_web_url call returns it.',
  scopeNote: 'Owned-host homepage root. Upstream 0.2.2-alpha.3 exposes no Team or Session permalink; selecting a Team in Web remains in-app client state.',
});

/** Construct a statically sanitized ClientError (safe to preserve verbatim through the boundary). */
function staticError(code, message) {
  const error = new ClientError(code, message);
  error.sanitized = true;
  return error;
}
/** Validate the owned host entry and return the exact URL plus its clean loopback origin. */
export function authenticatedHostEntry(entry) {
  const unavailable = 'The owned host has no authenticated loopback Web entry; no URL was disclosed. This query never starts, adopts or restarts a host.';
  if (!entry || typeof entry !== 'object' || typeof entry.url !== 'string') throw new ClientError('HOST_NOT_RUNNING', unavailable);
  let url;
  try { url = new URL(entry.url); }
  catch { throw new ClientError('INVALID_HOST_ENTRY', unavailable); }
  const tokens = url.searchParams.getAll('token');
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password
    || url.pathname !== '/' || url.hash || tokens.length !== 1 || !tokens[0]) {
    throw new ClientError('INVALID_HOST_ENTRY', 'The owned host entry is not the supported authenticated loopback Web homepage; no URL was disclosed. This query never starts, adopts or restarts a host.');
  }
  return { url: entry.url, origin: url.origin };
}

/** Require the native status record to be the managed Lead/root Session of this owned host. */
export function managedRootTeam(status, teamId) {
  const invalid = 'dsh_team_web_url only accepts an existing managed Lead/root Team on this owned host. Member, unknown and foreign Team IDs are not query targets. No URL was disclosed.';
  if (!status || typeof status !== 'object' || typeof teamId !== 'string' || !teamId) throw new ClientError('UNMANAGED_TEAM', invalid);
  const identity = status.sessionId ?? status.teamId;
  const members = status.team?.members;
  if (identity !== teamId || !Array.isArray(members) || !members.some(member => member?.id === teamId)) throw new ClientError('UNMANAGED_TEAM', invalid);
  return status;
}

/** Generic, token-free failure returned for every unexpected status/transport error. */
export function webUrlUnavailable() {
  return staticError('WEB_URL_UNAVAILABLE', 'The owned native Web host could not verify the requested Team. No URL was disclosed; inspect dsh_team_health and retry. Diagnostics may identify the owned host state.');
}

/** Generic, token-free cancellation. */
export function webUrlCancelled() {
  return staticError('CANCELLED', 'Operation cancelled. No URL was disclosed.');
}

/** Static token-free failure when native cleanup/disposal fails after a successful read. */
export function webUrlCleanupError() {
  return staticError('WEB_URL_UNAVAILABLE', 'The owned native Web host query did not finish safely (cleanup failed). No URL was disclosed; inspect dsh_team_health and retry.');
}

const fixedErrors = {
  PROCESS_UNVERIFIABLE: 'The owned host process identity could not be verified. No URL was disclosed; inspect the dedicated host and retry.',
  UNSAFE_STATE: 'Owned host metadata is unsafe or unreadable. No URL was disclosed; inspect the dedicated Home permissions.',
  WEB_URL_UNAVAILABLE: 'The owned native Web host query did not complete safely; no URL was disclosed. Inspect dsh_team_health and retry.',
  HOST_NOT_RUNNING: 'The owned native Web host is not reachable or no longer attributed. This query never starts, adopts or restarts one; inspect it with dsh_team_health before retrying. No URL was disclosed.',
  INVALID_HOST_ENTRY: 'The owned host entry is not the supported authenticated loopback Web homepage; no URL was disclosed. This query never starts, adopts or restarts a host.',
  OWNERSHIP_MISMATCH: 'The owned host entry or instance record does not match this owned home or runtime. No URL was disclosed; refresh with dsh_team_health.',
  RUNTIME_MISMATCH: 'The owned host does not match the exact supported DSH runtime. No URL was disclosed; use the supported official runtime.',
  RUNTIME_REQUIRED: 'The exact supported DSH runtime is not configured for this query. No URL was disclosed.',
  SETUP_REQUIRED: 'This home is not a complete owned installation. No URL was disclosed; initialize the dedicated home with scripts/setup.mjs.',
  UNMANAGED_TEAM: 'dsh_team_web_url only accepts an existing managed Lead/root Team on this owned host. Member, unknown and foreign Team IDs are not query targets. No URL was disclosed.',
  CANCELLED: 'Operation cancelled. No URL was disclosed.',
  AUTH_UNAVAILABLE: 'The owned native Web host is not reachable. This query never starts, adopts or restarts one; inspect it with dsh_team_health before retrying. No URL was disclosed.',
  GATEWAY_UNAVAILABLE: 'The owned native Web host is not reachable. This query never starts, adopts or restarts one; inspect it with dsh_team_health before retrying. No URL was disclosed.',
};

/**
 * Map a status/transport/cleanup failure to an actionable, token-free error. Known safe codes are
 * reconstructed with static messages (never passing arbitrary upstream text); every unexpected
 * error is replaced by a generic wrapper. This keeps credential-bearing error text out of
 * MCP/client responses, summaries, diagnostics messages and logs.
 */
export function webUrlError(error) {
  const code = error instanceof ClientError ? error.code : undefined;
  if (code === 'CANCELLED') return webUrlCancelled();
  if (code === 'team-roles/UNKNOWN_TEAM' || code === 'UNKNOWN_TEAM') return staticError('UNMANAGED_TEAM', fixedErrors.UNMANAGED_TEAM);
  if (code === 'AUTH_UNAVAILABLE' || code === 'GATEWAY_UNAVAILABLE') return staticError('HOST_NOT_RUNNING', fixedErrors.HOST_NOT_RUNNING);
  if (Object.hasOwn(fixedErrors, code)) return staticError(code, fixedErrors[code]);
  if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return staticError('SETUP_REQUIRED', fixedErrors.SETUP_REQUIRED);
  return webUrlUnavailable();
}
