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

/** Required, non-defaultable acknowledgement value for secret-bearing disclosure. */
export const WEB_URL_ACKNOWLEDGEMENT = 'reveal-bearer-credential';
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
  expiresWhenHostStops: true,
  restartInvalidates: true,
  cookieAbsoluteLifetimeDays: 30,
  cookieLifetimeNote: 'Upstream default cookieMaxAgeDays is 30 (configurable >= 1) with absolute, non-sliding expiry.',
  revocation: 'No logout API. Deleting or replacing the client-connection/browser-session credential record revokes cookies at the next Connection activation; clearing a cookie ends only that browser session.',
  discovery: 'Startup, health, status, result, create and logs never include this URL or its token; only an explicitly acknowledged dsh_team_web_url call returns it.',
  scopeNote: 'Owned-host homepage root. Upstream 0.2.2-alpha.3 exposes no Team or Session permalink; selecting a Team in Web remains in-app client state.',
});

export function requireWebUrlAcknowledgement(value) {
  if (value !== WEB_URL_ACKNOWLEDGEMENT) {
    throw new ClientError('ACKNOWLEDGEMENT_REQUIRED', `Disclosing the authenticated Web URL exposes a bearer credential. Require an explicit user request and pass acknowledge: "${WEB_URL_ACKNOWLEDGEMENT}". No URL was disclosed.`);
  }
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
