/** This entry checks Node before loading node:sqlite or any native runtime. */
const usage = 'Usage: node scripts/bootstrap.mjs /absolute/authorized/workspace [--root /absolute/new-private-bootstrap-root]';
try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!(major > 24 || (major === 24 && minor >= 9))) throw Object.assign(new Error('Use Node.js >=24.9.0 with npm on PATH, then rerun using that Node executable. Bootstrap does not install or change Node.'), { code: 'NODE_REQUIRED' });
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log(usage);
  else {
    if (![1, 3].includes(args.length) || (args.length === 3 && args[1] !== '--root')) throw Object.assign(new Error(usage), { code: 'USAGE' });
    const { bootstrap } = await import('../src/bootstrap/main.mjs');
    const { defaultRoot } = await import('../src/bootstrap/config.mjs');
    const result = await bootstrap({ workspace: args[0], root: args[2] ?? defaultRoot(), progress: message => console.error(message) });
    const { realpath } = await import('node:fs/promises');
    console.log(JSON.stringify(result, null, 2));
    if (result.root === await realpath(defaultRoot()).catch(() => null)) console.error('Default MCP/client configuration discovers this private installation. Restart Codex/MCP after bootstrap. No shell exports or Codex configuration edits are needed.');
    else console.error('Custom root: set BOTH environment values printed above on the dsh-agent-team MCP server and restart it, or launch a new Codex CLI process with those values. An already-running Codex app cannot acquire exports from another terminal. No Codex configuration was edited.');
  }
} catch (error) {
  const known = error.name === 'ClientError' || ['NODE_REQUIRED', 'USAGE'].includes(error.code);
  console.error(JSON.stringify({ ok: false, code: error.code ?? 'BOOTSTRAP_FAILED', root: error.bootstrapRoot, attempt: error.attempt, message: known ? error.message : 'Bootstrap could not complete safely. Check the private target paths and retry the same command; existing installations and failed attempts are retained.' }));
  process.exitCode = 1;
}
