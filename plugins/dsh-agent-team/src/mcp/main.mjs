#!/usr/bin/env node
import { OwnedHost } from '../host/manager.mjs';
import { createDispatcher } from './server.mjs';
import { createExactRequestClient } from './exact-request.mjs';
const client = new OwnedHost();
let requestClient = client;
if (process.env.DSH_AGENT_TEAM_MCP_REQUEST_POLICY !== undefined) {
  try { requestClient = createExactRequestClient(client, JSON.parse(process.env.DSH_AGENT_TEAM_MCP_REQUEST_POLICY)); }
  catch (error) { process.stderr.write('Invalid exact MCP request policy.\n'); process.exit(1); }
}
const limit = process.env.DSH_AGENT_TEAM_MCP_CALL_LIMIT === undefined ? Infinity : Number(process.env.DSH_AGENT_TEAM_MCP_CALL_LIMIT);
if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) throw new Error('Invalid MCP call limit.');
let calls = 0;
const dispatch = createDispatcher({ request: (method, params, options) => {
  if (++calls > limit) throw new Error('The explicit MCP call budget is exhausted.');
  return requestClient.request(method, params, options);
} });
const maxLineBytes = 1_048_576;
let buffer = Buffer.alloc(0);
let pending = Promise.resolve();
const active = new Map(), inFlight = new Set();
const write = response => { if (response !== undefined) process.stdout.write(`${JSON.stringify(response)}\n`); };
const accept = line => {
  let request;
  try { request = JSON.parse(line); }
  catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } }); return; }
  if (request?.jsonrpc === '2.0' && request.method === 'notifications/cancelled' && request.id === undefined) {
    active.get(request.params?.requestId)?.abort(new Error('MCP request cancelled.')); return;
  }
  if (request?.id !== undefined && active.has(request.id)) {
    write({ jsonrpc: '2.0', id: request.id, error: { code: -32600, message: 'Request ID is already active.' } }); return;
  }
  const controller = new AbortController();
  if (request?.id !== undefined) active.set(request.id, controller);
  const task = pending.then(() => dispatch(request, { signal: controller.signal })).then(write).catch(error => {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
  }).finally(() => { active.delete(request?.id); inFlight.delete(task); });
  inFlight.add(task);
  // Other writes retain arrival order; a bounded observation must not hold stop/answer behind it.
  if (request?.method !== 'tools/call' || request.params?.name !== 'dsh_team_wait') pending = task;
};
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  let newline;
  while ((newline = buffer.indexOf(10)) !== -1) {
    const line = buffer.subarray(0, newline); buffer = buffer.subarray(newline + 1);
    if (line.length > maxLineBytes) { process.stderr.write('MCP request exceeds the input limit.\n'); process.exit(1); }
    if (line.toString('utf8').trim()) accept(line.toString('utf8'));
  }
  if (buffer.length > maxLineBytes) { process.stderr.write('MCP request exceeds the input limit.\n'); process.exit(1); }
});
process.stdin.on('end', () => {
  if (buffer.toString('utf8').trim()) pending = pending.then(() => write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Incomplete JSON line.' } }));
  // EOF closes only this peer after bounded calls finish; native work and pending requests survive.
  Promise.allSettled([pending, ...inFlight]).then(async () => { await client.close(); process.exitCode ??= 0; });
});
process.stdin.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
