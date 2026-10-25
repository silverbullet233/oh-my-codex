/** Native host plugin: one Session service shared by Web and explicit MCP clients. */
import { join } from 'node:path';
import { BridgeStore } from './private-store.mjs';
import { SessionBridge } from './service.mjs';
import { NativeSessionPort } from './native-port.mjs';
import { bridgeProjectionDefinition } from './projection.mjs';
import { serveBridge } from './ipc.mjs';
import { BridgeError } from './errors.mjs';
import { verifyRuntime } from '../../scripts/runtime/verify.mjs';

export const name = 'dsh-agent-team-bridge';
export const inject = ['connection', 'typertGateway', 'sessionController', 'sessionProjections', 'sessions', 'agents', 'agentTeams', 'dshRoles'];

/** Compose into an existing matching native host. No host, account, token or HTTP server is created. */
export async function apply(ctx, config) {
  if (!config || typeof config.stateDirectory !== 'string' || typeof config.socketPath !== 'string') {
    throw new BridgeError('INVALID_CONFIG', 'stateDirectory and socketPath are required.');
  }
  const runtimeEvidence = await verifyRuntime();
  const { z } = await import('zod');
  const projection = await ctx.sessionProjections.register(bridgeProjectionDefinition(z));
  const store = await new BridgeStore(join(config.stateDirectory, 'bridge')).open();
  let native;
  let server;
  try {
    native = new NativeSessionPort(ctx, ctx.dshRoles);
    const bridge = new SessionBridge({ native, store, allowedRoots: config.allowedRoots, sourceSha: runtimeEvidence.sourceSha, runtimeEvidence });
    server = await serveBridge({ socketPath: config.socketPath, bridge });
  } catch (error) {
    await native?.close();
    await store.close();
    await projection.dispose?.();
    throw error;
  }
  ctx.effect(() => async () => {
    await server.close();
    await native.close();
    await store.close();
  }, 'dsh-agent-team-bridge: local transport');
}
