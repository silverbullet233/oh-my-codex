/** Runs INSIDE the official sandbox, before importing the native Web host.
 * The outer runner remains control-plane only. This process is the attributed
 * host PID, so health and graceful shutdown retain their original PID guards.
 */
import { pathToFileURL } from 'node:url';
const [encoded, ...args] = process.argv.slice(2);
const config = JSON.parse(encoded);
process.env.DSH_HOME = config.home;
process.env.DSH_OWNED_INSTANCE_ID = config.instanceId;
process.env.DSH_AGENT_TEAM_LAUNCH_PERMISSION_BINDING = config.permissionBinding;
process.env.DSH_AGENT_TEAM_LAUNCH_EXECUTION = JSON.stringify(config.permissionExecution);
process.stdout.write(JSON.stringify({ type: 'dsh-sandbox-host', instanceId: config.instanceId, pid: process.pid }) + '\n');
process.argv = [process.execPath, config.cli, ...args];
const entrypoint = await import(pathToFileURL(config.cli).href);
// The pinned official CLI uses import.meta.main, which is false when imported.
// Its public runCli export must be invoked explicitly in this bootstrap.
if (typeof entrypoint.runCli === 'function') await entrypoint.runCli();
