/** Invocation-local authorization for a single synthetic request and its result reads. */
import { isDeepStrictEqual } from 'node:util';
import { tools, validateArguments } from './tools.mjs';

const invalidPolicy = () => new Error('Invalid exact MCP request policy.');
const denied = () => new Error('The MCP request is outside the authorized exact request policy.');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** Detach and validate the policy before accepting any bridge operation. */
function requestPolicy(policy) {
  try {
    if (!object(policy) || Object.keys(policy).length !== 2 || !Object.hasOwn(policy, 'method') || !Object.hasOwn(policy, 'params')) throw invalidPolicy();
    if (policy.method !== 'create' && policy.method !== 'send') throw invalidPolicy();
    if (!object(policy.params)) throw invalidPolicy();
    const params = structuredClone(policy.params);
    const definition = tools.find(tool => tool.name === `dsh_team_${policy.method}`);
    validateArguments(definition.inputSchema, params);
    return { method: policy.method, params };
  } catch (error) { throw invalidPolicy(); }
}

/** Permit the exact authorized write plus result reads for its single native Team. */
export function createExactRequestClient(client, policy) {
  const expected = requestPolicy(policy);
  let teamId = expected.method === 'send' ? expected.params.teamId : null;
  return {
    async request(method, params = {}) {
      if (method === 'result') {
        if (teamId === null || !isDeepStrictEqual(params, { teamId })) throw denied();
        return client.request(method, { teamId });
      }
      if (method !== expected.method || !isDeepStrictEqual(params, expected.params)) throw denied();
      // Forward the detached authorized values so caller mutation cannot change dispatch.
      const result = await client.request(method, structuredClone(expected.params));
      if (method === 'create') {
        if (!object(result) || typeof result.teamId !== 'string' || !result.teamId.trim() || result.teamId.length > 256 || (teamId !== null && result.teamId !== teamId)) {
          throw new Error('The exact MCP request returned an invalid or changed Team identity.');
        }
        teamId = result.teamId;
      }
      return result;
    },
    close() { client.close?.(); },
  };
}
