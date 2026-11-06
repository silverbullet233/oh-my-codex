/** Command-line access to the same owned native host used by MCP. */
import { readPermissionContext } from '../src/host/permissions.mjs';
import { delay } from '../src/host/files.mjs';
import { OwnedHost, configuration } from '../src/host/manager.mjs';
const args = process.argv.slice(2);
const authorityIndex = args.indexOf('--permission-authority');
let authority;
if (authorityIndex >= 0) { authority = args[authorityIndex + 1]; if (!authority) throw new Error('Missing permission authority path.'); args.splice(authorityIndex, 2); }
let [method, json = '{}'] = args;
if (method === 'web_url') method = 'webUrl';
if (!['health', 'create', 'send', 'status', 'result', 'stop', 'web', 'webUrl', 'shutdown'].includes(method)) throw new Error('Usage: node scripts/client.mjs health|create|send|status|result|stop|web|web_url|shutdown [JSON object]');
const client = new OwnedHost(configuration(process.env, authority));
try {
  if (authority && ['health', 'web', 'create', 'send'].includes(method)) {
    process.stderr.write(JSON.stringify({ type: 'dsh-permission-challenge', audience: client.config.permissionAudience }) + '\n');
    const deadline = Date.now() + 5000;
    while (true) {
      try { await readPermissionContext(client.config); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await delay(50); }
    }
  }
  console.log(JSON.stringify(await client.request(method, JSON.parse(json)), null, 2)); }
finally { await client.close(); }
