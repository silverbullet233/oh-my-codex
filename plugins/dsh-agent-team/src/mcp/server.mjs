import { tools, methods, validateArguments } from './tools.mjs';
import { boundedObservation, boundedObservationError } from './summary.mjs';

const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** JSON-RPC dispatcher. Native DSH, rather than the MCP connection, owns Session state. */
export function createDispatcher(client) {
  let initialized = false;
  return async (request, options = {}) => {
    if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' || (request.id !== undefined && typeof request.id !== 'string' && typeof request.id !== 'number' && request.id !== null)) {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request.' } };
    }
    if (request.id === undefined) return undefined;
    const response = { jsonrpc: '2.0', id: request.id };
    try {
      if (request.method === 'initialize') {
        initialized = true;
        return { ...response, result: { protocolVersion: protocolVersions.includes(request.params?.protocolVersion) ? request.params.protocolVersion : protocolVersions[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'dsh-agent-team', version: '0.4.3' } } };
      }
      if (request.method === 'ping') return { ...response, result: {} };
      if (!initialized) return { ...response, error: { code: -32002, message: 'Initialize the MCP connection first.' } };
      if (request.method === 'tools/list') return { ...response, result: { tools } };
      if (request.method !== 'tools/call') return { ...response, error: { code: -32601, message: 'Method not found.' } };
      const definition = tools.find((item) => item.name === request.params?.name);
      if (!definition) return { ...response, error: { code: -32602, message: 'Unknown tool.' } };
      let args;
      try { args = validateArguments(definition.inputSchema, request.params.arguments ?? {}); }
      catch (error) { return { ...response, error: { code: -32602, message: error.message } }; }
      try {
        const { view, ...nativeArgs } = args;
        const method = methods.get(definition.name);
        const result = await client.request(method, nativeArgs, options);
        if (view === 'summary') return { ...response, result: boundedObservation(method, result, nativeArgs) };
        return { ...response, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } };
      } catch (error) {
        if (args.view === 'summary') return { ...response, result: boundedObservationError(error) };
        return { ...response, result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: error.code ?? 'native/unavailable', message: error.message }) }] } };
      }
    } catch (error) {
      return { ...response, error: { code: -32603, message: error.message } };
    }
  };
}
