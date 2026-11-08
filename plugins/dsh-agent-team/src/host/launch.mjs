/** Run the native CLI directly, retaining the process's existing outer limits. */
export function hostInvocation(config) {
  return { executable: process.execPath, argv: [config.cli, '--profile', config.profile, '--no-open', '--host', '127.0.0.1', '--port', '0'] };
}
