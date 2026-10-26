/** Match the native host's portable default without reading its configuration. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function resolveSocketPath(env = process.env) {
  return env.DSH_AGENT_TEAM_SOCKET ?? (process.getuid === undefined
    ? undefined : join(tmpdir(), `dsh-agent-team-${process.getuid()}`, 'native.sock'));
}
