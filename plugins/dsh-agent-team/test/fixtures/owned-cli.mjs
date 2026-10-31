/** Fake CLI process serves official Connection/Gateway with durable synthetic receipts. */
import { readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { serveNativeFixture } from './native-server.mjs';
const home = process.env.DSH_HOME;
if (process.env.DSH_FIXTURE_FAIL === '1') process.exit(2);
await appendFile(join(home, 'starts'), 'start\n');
let data; try { data = JSON.parse(await readFile(join(home, 'fixture.json'), 'utf8')); } catch { data = { teams: {}, active: false }; }
const save = () => writeFile(join(home, 'fixture.json'), JSON.stringify(data));
const server = await serveNativeFixture({ dispatch: async (method, request) => {
  if (method === 'health') return { roles: { configured: false, leadRole: '', roles: [] } };
  if (method === 'create') { data.teams[request.key] ??= { teamId: request.key, sessionId: request.key }; data.active = request.text === 'hang'; await save(); return { ...data.teams[request.key], accepted: true, processed: null }; }
  if (method === 'stop') { data.active = false; await save(); return { accepted: true, quiescent: true }; }
  if (method === 'prepareShutdown' || method === 'activity') return { safeToStop: !data.active, leaseExpiresAt: Date.now() + 5000 };
  if (method === 'status') return { teamId: request.teamId, runtimeState: data.active ? 'running' : 'idle' };
  return { accepted: true, completed: !data.active };
} });
const url = server.url;
// Deliberately split output to test launch-line parsing. Capability never reaches test logs.
process.stdout.write('Web: ' + url.slice(0, -8));
setTimeout(() => console.error('Synthetic activation diagnostic'), 10);
setTimeout(() => process.stdout.write(url.slice(-8) + '\n'), 35);
// Console handles a closed diagnostic sink without killing this test-owned HTTP host.
const emitPostReady = () => console.error('Synthetic post-ready diagnostic');
if (process.env.DSH_FIXTURE_DIAGNOSTIC_TRIGGER === 'file') {
  let emitted = false;
  const timer = setInterval(async () => {
    try { await access(join(home, 'emit-post-ready')); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (emitted) return; emitted = true; clearInterval(timer);
    emitPostReady(); await writeFile(join(home, 'post-ready-emitted'), 'yes');
  }, 10);
} else setTimeout(emitPostReady, 150);
process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
