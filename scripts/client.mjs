/** Direct command-line client of the same native IPC adapter used by stdio MCP. */
import { BridgeClient } from '../src/bridge/client.mjs';
import { resolveSocketPath } from '../src/bridge/socket-path.mjs';

const [method, json = '{}'] = process.argv.slice(2);
if (!['health', 'create', 'send', 'status', 'result', 'stop'].includes(method)) throw new Error('Usage: node scripts/client.mjs health|create|send|status|result|stop [JSON object]');
const socketPath = resolveSocketPath();
if (!socketPath) throw new Error('Set DSH_AGENT_TEAM_SOCKET to the shared native host IPC socket.');
const client = new BridgeClient({ socketPath });
try { console.log(JSON.stringify(await client.request(method, JSON.parse(json)), null, 2)); }
finally { client.close(); }
