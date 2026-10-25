/** One bounded real Codex subscription turn over the installed host's explicit MCP client. */
import { spawn } from 'node:child_process';
import { readFile, writeFile, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const project = resolve(import.meta.dirname, '../..');
const run = JSON.parse(await readFile(process.argv[2] ?? '/tmp/dsh-team-native-live/run.json', 'utf8'));
const reuseTeam = process.argv[3];
if (reuseTeam !== undefined && !/^[a-f0-9-]{36}$/u.test(reuseTeam)) throw new Error('Expected an existing synthetic Team UUID.');
const prefix = reuseTeam === undefined ? 'codex' : 'codex-reuse';
const socketPath = `/tmp/dsh-agent-team-${process.getuid()}/native.sock`;
const expected = `${reuseTeam === undefined ? 'SYNTHETIC' : 'REUSE'}_${run.nonce}`;
const answerPath = join(run.root, `${prefix}-answer.txt`);
const env = { ...process.env };
env.RUST_LOG = 'error';
for (const name of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL']) delete env[name];
const exactRequest = reuseTeam === undefined ? {
  method: 'create', params: { key: `codex-${run.nonce}`, cwd: run.fixtureRoot, agentPreset: 'dsh-team-synthetic', leadRole: 'lead', text: `Synthetic fixture request: reply exactly ${expected} without calling tools.` },
} : {
  method: 'send', params: { teamId: reuseTeam, inputId: `reuse-${run.nonce}`, continue: true, text: `Synthetic followup. Reuse existing teammate calc-left. Send it one native message asking it to send_message lead exactly ${expected} once and then finish. Do not create any new member, read files, or use any other tool. Lead may wait once, then reply exactly ${expected} after its reply.` },
};
const prompt = reuseTeam === undefined
  ? `Use only the dsh_team MCP tools. This is a fresh synthetic validation, not repository work. Create one native DSH Session with key codex-${run.nonce}, cwd ${run.fixtureRoot}, agentPreset dsh-team-synthetic, leadRole lead, and text exactly: Synthetic fixture request: reply exactly ${expected} without calling tools. Poll its result with the returned teamId until completed=true, using at most 10 MCP calls total. Do not send any other context, read files, run shell commands, browse or select another provider/model. Return the teamId, exact output, completion state, and any honest failure. Do not claim success unless the native result contains ${expected}.`
  : `Use only dsh_team MCP tools for this existing synthetic fixture Team ${reuseTeam}. Call send with teamId ${reuseTeam}, inputId reuse-${run.nonce}, continue true, text exactly: Synthetic followup. Reuse existing teammate calc-left. Send it one native message asking it to send_message lead exactly ${expected} once and then finish. Do not create any new member, read files, or use any other tool. Lead may wait once, then reply exactly ${expected} after its reply. Then poll result at most 8 times. Success requires completed=true, input reuse-${run.nonce} processed with outcome completed, and exact output ${expected}. Report any honest failure; no fallback or other context.`;
const args = ['--no-daemon', '--ask-for-approval', 'never', 'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort="high"', '-c', 'project_doc_max_bytes=0', '-c', 'web_search="disabled"', '-c', 'hooks.enabled=false'];
for (const feature of ['shell_tool', 'apps', 'plugins', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'multi_agent', 'hooks']) args.push('--disable', feature);
args.push('--enable', 'code_mode_host');
for (const [key, value] of Object.entries({
  'mcp_servers.dsh_team.command': process.execPath,
  'mcp_servers.dsh_team.args': [join(project, 'src/mcp/main.mjs')],
  'mcp_servers.dsh_team.env.DSH_AGENT_TEAM_SOCKET': socketPath,
  'mcp_servers.dsh_team.env.DSH_AGENT_TEAM_MCP_CALL_LIMIT': '12',
  'mcp_servers.dsh_team.env.DSH_AGENT_TEAM_MCP_REQUEST_POLICY': JSON.stringify(exactRequest),
  // Invocation-only approval for the two operations explicitly authorized by this fixture test.
  // Native DSH approvals are separate and remain effective.
  'mcp_servers.dsh_team.enabled_tools': [reuseTeam === undefined ? 'dsh_team_create' : 'dsh_team_send', 'dsh_team_result'],
  [`mcp_servers.dsh_team.tools.${reuseTeam === undefined ? 'dsh_team_create' : 'dsh_team_send'}.approval_mode`]: 'approve',
  'mcp_servers.dsh_team.tools.dsh_team_result.approval_mode': 'approve',
})) args.push('-c', `${key}=${JSON.stringify(value)}`);
args.push('-C', run.fixtureRoot, '-o', answerPath, prompt);
await writeFile(join(run.root, `${prefix}-request.json`), JSON.stringify({ model: 'gpt-6.1-sol', reasoningEffort: 'high', expected, cwd: run.fixtureRoot, socketPath, prompt, exactRequest, deadlineMs: 180000, maxMcpCalls: 12 }) + '\n', { mode: 0o600 });
const log = await open(join(run.root, `${prefix}-events.jsonl`), 'w', 0o600);
const child = spawn('/opt/homebrew/bin/codex', args, { cwd: run.fixtureRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
let bytes = 0;
let pending = Promise.resolve();
const deadline = setTimeout(() => child.kill('SIGTERM'), 180000);
child.stdout.on('data', chunk => {
  bytes += chunk.length;
  if (bytes > 1_048_576) child.kill('SIGTERM');
  else pending = pending.then(() => log.write(chunk));
});
child.stderr.on('data', chunk => process.stderr.write(chunk.toString('utf8').replace(/([?&]token=)[^\s"'<>]*/gu, '$1[redacted]')));
child.once('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.once('exit', async (code, signal) => {
  clearTimeout(deadline);
  await pending;
  await log.close();
  let answer = null;
  try { answer = await readFile(answerPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  console.log(JSON.stringify({ code, signal, model: 'gpt-6.1-sol', reasoningEffort: 'high', expected, answer, eventsPath: join(run.root, `${prefix}-events.jsonl`) }));
  process.exitCode = code ?? 1;
});
