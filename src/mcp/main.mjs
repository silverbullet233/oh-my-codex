#!/usr/bin/env node
import { BridgeClient } from '../bridge/client.mjs';
import { createDispatcher } from './server.mjs';
import { createExactRequestClient } from './exact-request.mjs';

const socketPath = process.env.DSH_AGENT_TEAM_SOCKET ?? (process.getuid === undefined ? undefined : `/tmp/dsh-agent-team-${process.getuid()}/native.sock`);
if (!socketPath) {
  process.stderr.write('Set DSH_AGENT_TEAM_SOCKET to the shared native host IPC socket.\n');
  process.exit(1);
}
const client = new BridgeClient({ socketPath });
let requestClient = client;
if (process.env.DSH_AGENT_TEAM_MCP_REQUEST_POLICY !== undefined) {
  try { requestClient = createExactRequestClient(client, JSON.parse(process.env.DSH_AGENT_TEAM_MCP_REQUEST_POLICY)); }
  catch (error) { process.stderr.write('Invalid exact MCP request policy.\n'); process.exit(1); }
}
const limit = process.env.DSH_AGENT_TEAM_MCP_CALL_LIMIT === undefined ? Infinity : Number(process.env.DSH_AGENT_TEAM_MCP_CALL_LIMIT);
if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) throw new Error('Invalid MCP call limit.');
let calls = 0;
const dispatch = createDispatcher({ request: (method, params) => {
  if (++calls > limit) throw new Error('The explicit MCP call budget is exhausted.');
  return requestClient.request(method, params);
} });
const maxLineBytes = 1_048_576;
let buffer = Buffer.alloc(0);
let pending = Promise.resolve();
const write = (response) => { if (response !== undefined) process.stdout.write(`${JSON.stringify(response)}\n`); };

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let newline;
  while ((newline = buffer.indexOf(10)) !== -1) {
    const line = buffer.subarray(0, newline);
    buffer = buffer.subarray(newline + 1);
    if (line.length > maxLineBytes) { process.stderr.write('MCP request exceeds the input limit.\n'); process.exit(1); }
    if (!line.toString('utf8').trim()) continue;
    pending = pending.then(async () => {
      let request;
      try { request = JSON.parse(line.toString('utf8')); }
      catch (error) { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } }); return; }
      write(await dispatch(request));
    }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  }
  if (buffer.length > maxLineBytes) { process.stderr.write('MCP request exceeds the input limit.\n'); process.exit(1); }
});
process.stdin.on('end', () => {
  if (buffer.toString('utf8').trim()) {
    pending = pending.then(() => write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Incomplete JSON line.' } }));
  }
  // EOF closes this client only. No native Session cancellation or host shutdown.
  pending.then(() => { process.exitCode ??= 0; });
});
process.stdin.on('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
