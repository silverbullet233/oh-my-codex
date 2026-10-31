/** Command-line access to the same owned native host used by MCP. */
import { OwnedHost } from '../src/host/manager.mjs';
const [method, json = '{}'] = process.argv.slice(2);
if (!['health', 'create', 'send', 'status', 'result', 'stop', 'web', 'shutdown'].includes(method)) throw new Error('Usage: node scripts/client.mjs health|create|send|status|result|stop|web|shutdown [JSON object]');
const client = new OwnedHost();
try { console.log(JSON.stringify(await client.request(method, JSON.parse(json)), null, 2)); }
finally { await client.close(); }
