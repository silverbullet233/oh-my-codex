import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ClientError } from './errors.mjs';
export const version = '0.2.2-alpha.2';
export async function loadRuntime(anchor) {
  if (!anchor) throw new ClientError('RUNTIME_REQUIRED', 'Set DSH_AGENT_TEAM_RUNTIME to the supported official DSH package directory or package.json. No global runtime is changed.');
  let file = resolve(anchor);
  if (!file.endsWith('package.json')) file = join(file, 'package.json');
  file = await realpath(file);
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  if (pkg.name !== '@deepseek-ai/dsh' || pkg.version !== version) throw new ClientError('RUNTIME_MISMATCH', `Use the exact official @deepseek-ai/dsh ${version} installation.`);
  const require = createRequire(file);
  const load = specifier => import(pathToFileURL(require.resolve(specifier)).href);
  const [cordis, connection, gateway, registry, protocol, ownership, sessionRemote, questionRemote, zod, ws] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-client-connection/client'), load('@deepseek-ai/dsh-api-gateway/client'),
    load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-typert-protocol/remote-info'), load('@deepseek-ai/dsh-typert-protocol'), load('@deepseek-ai/dsh-api-session-controller/remote'), load('@deepseek-ai/dsh-user-questions/remote'), load('zod'), load('ws'),
  ]);
  return { anchor: file, cli: join(dirname(file), 'lib/bin.js'), Context: cordis.Context, installConnection: connection.installConnection,
    gateway, ownedValue: ownership.typertOwnedValue, sessionRemote: sessionRemote.default, questionRemote: questionRemote.default, TypertRegistry: registry.TypertRegistry, createTypertRemoteInfo: protocol.createTypertRemoteInfo, z: zod.z, WebSocket: ws.default };
}
