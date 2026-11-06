import { join } from 'node:path';
import { sandboxInvocation } from './permissions.mjs';

/** The entire host is the sandbox target. No control-plane write/network grant
 * is added to the caller state merely to make this deployment start. */
export function hostInvocation(config) {
  const args = [config.cli, '--profile', config.profile, '--no-open', '--host', '127.0.0.1', '--port', '0'];
  if (!config.sandbox) return { executable: process.execPath, argv: args };
  const encoded = JSON.stringify({ cli: config.cli, home: config.home, instanceId: config.instanceId, permissionBinding: config.permissionBinding, permissionExecution: config.permissionExecution });
  return sandboxInvocation({ sandbox: config.sandbox }, [process.execPath, join(import.meta.dirname, 'bootstrap.mjs'), encoded, ...args.slice(1)]);
}

export function startupIdentity(name, line, instanceId) {
  if (name !== 'stdout') return null;
  try {
    const value = JSON.parse(line);
    return value.type === 'dsh-sandbox-host' && value.instanceId === instanceId && Number.isSafeInteger(value.pid) && value.pid > 0 ? value.pid : null;
  } catch { return null; }
}
