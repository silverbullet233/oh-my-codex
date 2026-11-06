import assert from 'node:assert/strict';

/** Node 24 reports its built-in SQLite status on stderr; never suppress production diagnostics. */
export function assertNativeDiagnostics(stderr) {
  stderr = stderr.replace(/^\{"type":"dsh-permission-challenge","audience":"[a-f0-9-]{36}"\}\n/gm, '');
  assert.match(stderr, /^(?:\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n(?:\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\n)?)?$/);
}
